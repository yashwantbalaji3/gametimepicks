/**
 * audit-hits-misses-research — READ-ONLY settled-data research: where the model
 * wins and loses, by market / odds band / recent-form / side / confidence /
 * sport, plus card-level "killed by one leg" analysis. Settled-only, no paid
 * API, no fabrication. Joins settled_leans (outcomes) with per-date boards
 * (odds + recentSeries) so we can bucket by odds/L5/L10 the leans file lacks.
 *
 * Emits a markdown research report (docs/audits/hits-misses-research-latest.md)
 * and a machine-readable market-reliability artifact
 * (app/public/data/audit/market-reliability.json) the methodology can read.
 *
 * Run: cd app && npx tsx scripts/audit-hits-misses-research.mjs --write-report
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const WRITE = process.argv.includes("--write-report");

function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
function loadJSONL(p) { try { return readFileSync(p, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } }
function norm(v) { return String(v || "").trim().toLowerCase(); }
function won(v) { const r = norm(v); return r === "win" || r === "won"; }
function lost(v) { const r = norm(v); return r === "loss" || r === "lost" || r === "lose"; }
function decided(v) { return won(v) || lost(v); }
function oddsBand(o) {
  if (typeof o !== "number") return "unknown";
  if (o <= -200) return "heavy_fav";
  if (o <= -130) return "favorite";
  if (o <= -105) return "mild_fav";
  if (o <= 105) return "near_even";
  if (o <= 150) return "plus_money";
  return "high_plus";
}
function pct(w, n) { return n > 0 ? (100 * w / n).toFixed(1) + "%" : "—"; }
// Wilson 95% lower bound — honest small-sample floor so we never trumpet a tiny hot streak.
function wilsonLo(w, n) {
  if (n === 0) return 0;
  const z = 1.96, p = w / n;
  const d = 1 + z * z / n;
  return Math.max(0, ((p + z * z / (2 * n)) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d);
}

// --- build a board index per date for odds + recentSeries join -------------
const boardCache = new Map();
function mlbBoard(date) {
  if (boardCache.has("mlb:" + date)) return boardCache.get("mlb:" + date);
  const b = loadJSON(resolve(DATA, "mlb", "boards", `${date}.json`));
  const idx = new Map();
  for (const l of (b?.leans || [])) idx.set(`${l.playerId}|${l.marketKey}|${l.line}`, l);
  boardCache.set("mlb:" + date, idx);
  return idx;
}
function l5l10(series, line, side) {
  if (!Array.isArray(series) || typeof line !== "number") return { l5: null, l10: null };
  const s = side === "over" ? (v) => v > line : (v) => v < line;
  const calc = (w) => { let d = 0, h = 0; for (const v of w) { if (v === line) continue; d++; if (s(v)) h++; } return d ? h / d : null; };
  return { l5: calc(series.slice(-5)), l10: calc(series.slice(-10)) };
}

function aggregate(rows, getKey, getOutcome) {
  const m = new Map();
  for (const r of rows) {
    const o = getOutcome(r); if (!decided(o)) continue;
    const k = getKey(r); if (k == null) continue;
    const c = m.get(k) || { w: 0, n: 0 }; c.n++; if (won(o)) c.w++; m.set(k, c);
  }
  return [...m.entries()].map(([k, v]) => ({ k, ...v, rate: v.w / v.n, lo: wilsonLo(v.w, v.n) }))
    .sort((a, b) => b.n - a.n);
}

// === MLB ===================================================================
const mlb = loadJSONL(resolve(DATA, "mlb", "results", "settled_leans.jsonl"));
for (const r of mlb) {
  const idx = mlbBoard(r.date);
  const bl = idx.get(`${r.playerId}|${r.marketKey}|${r.line}`);
  // board leans store per-side prices (oddsOver/oddsUnder), not a resolved
  // oddsForSide — pick the price for the leaned side.
  r._odds = bl ? (norm(r.lean) === "over" ? bl.oddsOver : bl.oddsUnder) : undefined;
  r._band = oddsBand(r._odds);
  const { l5, l10 } = l5l10(bl?.recentSeries, r.line, norm(r.lean));
  r._l5 = l5; r._l10 = l10;
}
const mlbDec = mlb.filter((r) => decided(r.outcome));
const O = (r) => r.outcome;
const mlbByMarket = aggregate(mlb, (r) => r.marketKey, O);
const mlbByBand = aggregate(mlb.filter((r) => r._band !== "unknown"), (r) => r._band, O);
const mlbBySide = aggregate(mlb, (r) => norm(r.lean), O);
const mlbByConf = aggregate(mlb, (r) => r.confidence, O);
const mlbByRole = aggregate(mlb, (r) => r.playerRole || "?", O);
const mlbByL5 = aggregate(mlb.filter((r) => r._l5 != null), (r) => {
  const h = Math.round(r._l5 * 5); return `L5_${h}of5`;
}, O);

// === NBA ===================================================================
const nba = loadJSONL(resolve(DATA, "results", "settled_leans.jsonl"));
const N = (r) => r.result;
const nbaByMarket = aggregate(nba, (r) => r.market, N);
const nbaBySide = aggregate(nba, (r) => norm(r.side), N);
const nbaByConf = aggregate(nba, (r) => r.confidence, N);

// === Card-level: % lost by exactly one leg + killer markets ================
const gradedDir = resolve(DATA, "parlays", "optimizer-graded");
let cards = 0, lost1 = 0, lostMulti = 0, wonCards = 0;
const killerMarket = new Map();
if (existsSync(gradedDir)) {
  for (const f of readdirSync(gradedDir).filter((x) => /^2026-\d\d-\d\d\.json$/.test(x))) {
    const g = loadJSON(resolve(gradedDir, f));
    for (const s of (g?.uniqueSlips || [])) {
      const st = norm(s.status); if (st !== "win" && st !== "loss") continue;
      cards++;
      if (st === "win") { wonCards++; continue; }
      const legs = s.legs || [];
      const losers = legs.filter((l) => lost(l.result ?? l.status ?? l.outcome));
      if (losers.length === 1) {
        lost1++;
        const mk = losers[0].market || "?"; killerMarket.set(mk, (killerMarket.get(mk) || 0) + 1);
      } else if (losers.length > 1) lostMulti++;
    }
  }
}

// === market reliability artifact (shrunk to a 50% prior; sample floor) =====
const RELIABILITY_PRIOR = 0.5, SHRINK_K = 60; // pull small samples toward 0.5
function reliability(items) {
  const out = {};
  for (const it of items) {
    const shrunk = (it.w + RELIABILITY_PRIOR * SHRINK_K) / (it.n + SHRINK_K);
    out[it.k] = { wins: it.w, decisive: it.n, rawHitRate: +it.rate.toFixed(4), shrunkHitRate: +shrunk.toFixed(4), wilsonLo: +it.lo.toFixed(4), enoughSample: it.n >= 100 };
  }
  return out;
}
const mlbRel = reliability(mlbByMarket), nbaRel = reliability(nbaByMarket);
// UI-ready insights (settled-only, sample-floored) for the public "what's
// working / what we're improving" note — honest, no fabrication.
const MKT_LABEL = {
  batter_hits: "MLB Hits", batter_total_bases: "MLB Total Bases",
  batter_hits_runs_rbis: "MLB H+R+RBI", pitcher_strikeouts: "MLB Strikeouts",
  PTS: "NBA Points", REB: "NBA Rebounds", AST: "NBA Assists",
};
const confidentMarkets = [
  ...Object.entries(mlbRel).map(([k, v]) => ({ k, ...v })),
  ...Object.entries(nbaRel).map(([k, v]) => ({ k, ...v })),
].filter((x) => x.enoughSample);
const strongest = confidentMarkets.filter((x) => x.shrunkHitRate > 0.5)
  .sort((a, b) => b.shrunkHitRate - a.shrunkHitRate)
  .map((x) => ({ market: x.k, label: MKT_LABEL[x.k] || x.k, hitRate: +(x.rawHitRate * 100).toFixed(1) }));
const weakest = confidentMarkets.filter((x) => x.shrunkHitRate < 0.5)
  .sort((a, b) => a.shrunkHitRate - b.shrunkHitRate)
  .map((x) => ({ market: x.k, label: MKT_LABEL[x.k] || x.k, hitRate: +(x.rawHitRate * 100).toFixed(1) }));
const oddsBandRates = Object.fromEntries(
  mlbByBand.filter((x) => x.n >= 100).map((x) => [x.k, { hitRate: +(x.rate * 100).toFixed(1), decisive: x.n }]),
);
const artifact = {
  _disclaimer: "Settled-only market reliability (shrunk to a 0.5 prior, k=60). Read-only research signal; sample-floored. Not a profit claim.",
  generatedAtNote: "stamped by the build that runs this audit",
  shrinkPrior: RELIABILITY_PRIOR, shrinkK: SHRINK_K, minSampleForConfident: 100,
  mlb: mlbRel, nba: nbaRel,
  insights: { strongestMarkets: strongest, weakestMarkets: weakest, oddsBandRates },
};

// === console summary =======================================================
const line = (a) => a.map((x) => `${x.k} ${pct(x.w, x.n)} (${x.w}/${x.n}, lo ${(100 * x.lo).toFixed(0)}%)`).join(" · ");
console.log("=== MLB research (settled) ===");
console.log("  by market:", line(mlbByMarket));
console.log("  by odds band:", line(mlbByBand));
console.log("  by side:", line(mlbBySide));
console.log("  by confidence:", line(mlbByConf));
console.log("  hitter/pitcher:", line(mlbByRole));
console.log("  by L5 bucket:", line(mlbByL5));
console.log("=== NBA research (settled) ===");
console.log("  by market:", line(nbaByMarket));
console.log("  by side:", line(nbaBySide));
console.log("  by confidence:", line(nbaByConf));
console.log("=== card-level ===");
console.log(`  cards decided ${cards} · won ${wonCards} (${pct(wonCards, cards)}) · lost-by-1-leg ${lost1} · lost-by-2+ ${lostMulti}`);
console.log(`  of losing cards, lost-by-exactly-one-leg: ${pct(lost1, cards - wonCards)}`);
console.log("  top killer markets (single-leg card kills):", [...killerMarket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v}`).join(" · "));

// === write artifacts =======================================================
if (WRITE) {
  mkdirSync(resolve(DATA, "audit"), { recursive: true });
  writeFileSync(resolve(DATA, "audit", "market-reliability.json"), JSON.stringify(artifact, null, 2));
  const m = [];
  m.push("# Hits & Misses Research — settled data (auto-generated)");
  m.push("");
  m.push("> `audit-hits-misses-research.mjs --write-report` · READ-ONLY · settled-only · no paid API · no fabrication.");
  m.push("> Rates show raw% (wins/decisive) and a Wilson 95% lower bound (`lo`) so small samples aren't over-read.");
  m.push("");
  const tbl = (title, items) => {
    m.push(`### ${title}`); m.push("| key | hit% | wins/decisive | Wilson lo |"); m.push("|---|---:|---:|---:|");
    for (const x of items) m.push(`| ${x.k} | ${pct(x.w, x.n)} | ${x.w}/${x.n} | ${(100 * x.lo).toFixed(0)}% |`);
    m.push("");
  };
  m.push("## MLB (settled leaned picks)");
  tbl("By market", mlbByMarket); tbl("By odds band", mlbByBand); tbl("By side", mlbBySide);
  tbl("By confidence", mlbByConf); tbl("Hitter vs pitcher", mlbByRole); tbl("By last-5 bucket", mlbByL5);
  m.push("## NBA (settled leaned picks)");
  tbl("By market", nbaByMarket); tbl("By side", nbaBySide); tbl("By confidence", nbaByConf);
  m.push("## Card-level (optimizer-graded)");
  m.push(`- cards decided: **${cards}** · won **${wonCards}** (${pct(wonCards, cards)}) · lost-by-1-leg **${lost1}** · lost-by-2+ **${lostMulti}**`);
  m.push(`- of losing cards, **${pct(lost1, cards - wonCards)}** lost by exactly one leg`);
  m.push(`- top single-leg killer markets: ${[...killerMarket.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} (${v})`).join(", ")}`);
  m.push("");
  m.push("*Read-only research. Market-reliability artifact: `app/public/data/audit/market-reliability.json` (shrunk to 0.5, k=60, sample floor 100).*");
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(resolve(DOCS, "hits-misses-research-latest.md"), m.join("\n"));
  console.log("\n[--write-report] wrote hits-misses-research-latest.md + market-reliability.json");
}
