/**
 * audit-v2-learning-feedback — READ-ONLY internal learning audit. Builds a
 * per-leg dataset from SETTLED slates only and reports what the model gets right
 * vs wrong, gated by the hardened launch criteria (`classifyCandidate`). It NEVER
 * publishes claims, NEVER edits data, and NEVER uses active-slate outcomes
 * (there are none — the active slate is excluded by construction).
 *
 * Inputs (all already on disk; no paid API):
 *   pipeline/validation/mlb_settled_leans.jsonl   — settled MLB leans
 *   pipeline/validation/settled_leans.jsonl       — settled NBA leans
 *   app/public/data/mlb/boards/<date>.json        — odds/implied/recentSeries
 *   app/public/data/parlays/optimizer-summary.json — baseline records
 *
 * Output: docs/audits/v2-learning-feedback-latest.md
 * Run: cd app && npx tsx scripts/audit-v2-learning-feedback.mjs [--date YYYY-MM-DD] [--write-report]
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { classifyCandidate, DEFAULT_GATES } from "../src/lib/v2-candidate-gates.ts";
import { classifyV2WatchlistLeg, ENABLE_V2_SHADOW_CANDIDATE } from "../src/lib/v2-watchlist-rules.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const VALID = resolve(__dirname, "..", "..", "pipeline", "validation");
const DOCS = resolve(__dirname, "..", "..", "docs", "audits");
const argv = typeof process !== "undefined" ? process.argv : [];
const WRITE = argv.includes("--write-report");
const di = argv.indexOf("--date");
const ACTIVE_DATE = di >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(argv[di + 1] || "") ? argv[di + 1] : null;

const PUBLIC_ERA_START = "2026-05-27";
const EXCLUDED_DATES = new Set(["2026-05-25", "2026-05-26"]);
const inEra = (d) => typeof d === "string" && d >= PUBLIC_ERA_START && !EXCLUDED_DATES.has(d);

function loadJSONL(path) {
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* skip */ }
  }
  return out;
}
function loadJSON(path) { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } }
const americanToImplied = (o) =>
  typeof o === "number" && Number.isFinite(o) && o !== 0
    ? (o < 0 ? -o / (-o + 100) : 100 / (o + 100))
    : null;

function windowHits(series, n, line, side) {
  if (!Array.isArray(series)) return null;
  const s = series.map(Number).filter(Number.isFinite);
  if (s.length < n || typeof line !== "number") return null;
  const w = s.slice(-n);
  const sd = (side || "").toLowerCase();
  let hits = 0;
  for (const v of w) { if (v === line) continue; if (sd === "over" ? v > line : v < line) hits++; }
  return hits;
}

function mlbBoardIndex(date) {
  const b = loadJSON(resolve(DATA, "mlb", "boards", `${date}.json`));
  const idx = new Map();
  if (b && Array.isArray(b.leans)) {
    for (const l of b.leans) {
      const key = `${l.playerId ?? l.playerName}|${l.marketKey ?? l.market}|${l.line}`;
      idx.set(key, l);
    }
  }
  return idx;
}

// --- build the settled per-leg dataset (SETTLED dates only) ----------------
function buildDataset() {
  const legs = [];
  const boardCache = new Map();
  const mlbSettled = loadJSONL(resolve(VALID, "mlb_settled_leans.jsonl")).filter((r) => inEra(r.date));
  for (const r of mlbSettled) {
    // mlb_settled_leans.jsonl shape: outcome=Win/Loss, marketKey, lean=Over/Under.
    const res = (r.outcome || r.result || "").toLowerCase();
    if (res !== "win" && res !== "loss") continue; // decided only — pending/push excluded
    if (ACTIVE_DATE && r.date === ACTIVE_DATE) continue; // leakage guard: never the active slate
    const market = r.marketKey ?? r.market;
    const side = r.lean || r.side;
    if (!boardCache.has(r.date)) boardCache.set(r.date, mlbBoardIndex(r.date));
    const bl = boardCache.get(r.date).get(`${r.playerId ?? r.playerName}|${market}|${r.line}`) || {};
    const io = americanToImplied(bl.oddsOver) ?? bl.impliedOver;
    const iu = americanToImplied(bl.oddsUnder) ?? bl.impliedUnder;
    const sumImp = (io != null && iu != null) ? io + iu : null;
    const devig = sumImp ? (side === "Over" ? io : iu) / sumImp : null;
    legs.push({
      sport: "mlb", date: r.date, market, side, win: res === "win",
      devig, confidence: r.confidence, edgePct: r.edgePct, line: r.line,
      modelProb: side === "Over" ? r.modelProbOver : r.modelProbUnder,
      l5h: windowHits(bl.recentSeries, 5, r.line, side),
      l10h: windowHits(bl.recentSeries, 10, r.line, side),
    });
  }
  const nbaSettled = loadJSONL(resolve(VALID, "settled_leans.jsonl")).filter((r) => inEra(r.date));
  for (const r of nbaSettled) {
    const res = (r.result || "").toLowerCase();
    if (res !== "win" && res !== "loss") continue;
    if (ACTIVE_DATE && r.date === ACTIVE_DATE) continue;
    const side = r.side || r.lean;
    const io = americanToImplied(r.oddsOver) ?? r.impliedOver;
    const iu = americanToImplied(r.oddsUnder) ?? r.impliedUnder;
    const sumImp = (io != null && iu != null) ? io + iu : null;
    const devig = sumImp ? (side === "Over" ? io : iu) / sumImp : null;
    legs.push({ sport: "nba", date: r.date, market: r.market, side, win: res === "win", devig,
      confidence: r.confidence, edgePct: r.edgePct, line: r.line, modelProb: null, l5h: null, l10h: null });
  }
  return legs;
}

// --- segment → CandidateInput → classifyCandidate --------------------------
function segment(legs, { edgeOrConfidenceDriven = false } = {}, overallN, numTests) {
  const m = legs.filter((l) => l.devig != null); // need two-sided market for de-vig comparison
  const byDate = new Map();
  let n = 0, w = 0, sumDevig = 0, varDevig = 0;
  for (const l of m) {
    n++; if (l.win) w++; sumDevig += l.devig; varDevig += l.devig * (1 - l.devig);
    const c = byDate.get(l.date) || { date: l.date, n: 0, w: 0, sumDevig: 0 };
    c.n++; if (l.win) c.w++; c.sumDevig += l.devig; byDate.set(l.date, c);
  }
  if (n === 0) return null;
  const input = {
    n, w, sumDevig, varDevig, perDate: [...byDate.values()],
    edgeOrConfidenceDriven, leakageClean: true,
  };
  const cfg = { ...DEFAULT_GATES, overallN, numTests };
  return classifyCandidate(input, cfg);
}

function fmtPct(x) { return x == null ? "—" : `${(100 * x).toFixed(1)}%`; }

// --- baseline records from optimizer-summary -------------------------------
function baselineRecords() {
  const s = loadJSON(resolve(DATA, "parlays", "optimizer-summary.json")) || {};
  const sumSect = (map) => {
    const a = { wins: 0, losses: 0, pushes: 0, pending: 0 };
    for (const v of Object.values(map || {})) { a.wins += v.wins || 0; a.losses += v.losses || 0; a.pushes += v.pushes || 0; a.pending += v.pending || 0; }
    const dec = a.wins + a.losses;
    return { ...a, decisive: dec, hitRate: dec ? a.wins / dec : null };
  };
  return {
    generated: s.lifetime || null,
    published: sumSect(s.byPublicSection?.lifetime),
    bySport: s.bySportBucket?.lifetime || null,
  };
}

// --- active-slate watchlist (NO outcomes — informational only) -------------
function activeWatchlist(date) {
  if (!date) return null;
  const b = loadJSON(resolve(DATA, "mlb", "boards", `${date}.json`));
  if (!b || !Array.isArray(b.leans)) return null;
  const actionable = b.leans.filter((l) => l.lean === "Over" || l.lean === "Under");
  let flagged = 0;
  const byMarket = {};
  for (const l of actionable) {
    const tags = classifyV2WatchlistLeg({
      sport: "mlb", market: l.marketKey ?? l.market, side: l.lean, line: l.line,
      oddsForSide: l.lean === "Over" ? l.oddsOver : l.oddsUnder,
      l5hits: windowHits(l.recentSeries, 5, l.line, l.lean),
    });
    if (tags.length) { flagged++; byMarket[l.marketKey ?? l.market] = (byMarket[l.marketKey ?? l.market] || 0) + 1; }
  }
  return { date, actionable: actionable.length, flagged, byMarket };
}

// ---------------------------------------------------------------------------
const legs = buildDataset();
const mlb = legs.filter((l) => l.sport === "mlb");
const nba = legs.filter((l) => l.sport === "nba");
const dates = [...new Set(legs.map((l) => l.date))].sort();
const overallN = legs.filter((l) => l.devig != null).length;

// Segments to learn from (declared up front → numTests for Bonferroni).
const segs = [];
const add = (key, ls, opts) => { const r = segment(ls, opts || {}, overallN, NUMTESTS); if (r) segs.push({ key, ...r }); };
// markets
const mlbMarkets = [...new Set(mlb.map((l) => l.market))];
const nbaMarkets = [...new Set(nba.map((l) => l.market))];
// odds (de-vig) bands, model-prob bands, L5/L10, line bands, home/away unavailable
const devigBands = [["lt50", (l) => l.devig != null && l.devig < 0.5], ["50to60", (l) => l.devig >= 0.5 && l.devig < 0.6], ["60to70", (l) => l.devig >= 0.6 && l.devig < 0.7], ["ge70", (l) => l.devig >= 0.7]];
const mpBands = [["mp_lt50", (l) => l.modelProb != null && l.modelProb < 0.5], ["mp_50to60", (l) => l.modelProb >= 0.5 && l.modelProb < 0.6], ["mp_60to70", (l) => l.modelProb >= 0.6 && l.modelProb < 0.7], ["mp_ge70", (l) => l.modelProb != null && l.modelProb >= 0.7]];
const l5Bands = [["l5_5of5", (l) => l.l5h === 5], ["l5_4of5", (l) => l.l5h === 4], ["l5_le3", (l) => l.l5h != null && l.l5h <= 3]];
const lineBands = [["line_le0_5", (l) => typeof l.line === "number" && l.line <= 0.5], ["line_1_5", (l) => l.line === 1.5], ["line_ge2_5", (l) => typeof l.line === "number" && l.line >= 2.5]];
const NUMTESTS = mlbMarkets.length + nbaMarkets.length + devigBands.length + mpBands.length + l5Bands.length + lineBands.length + 2;

add("mlb_all", mlb); add("nba_all", nba);
for (const mk of mlbMarkets) add(`mlb_market_${mk}`, mlb.filter((l) => l.market === mk));
for (const mk of nbaMarkets) add(`nba_market_${mk}`, nba.filter((l) => l.market === mk));
for (const [lab, fn] of devigBands) add(`mlb_devig_${lab}`, mlb.filter(fn));
for (const [lab, fn] of mpBands) add(`${lab}`, mlb.filter(fn));
for (const [lab, fn] of l5Bands) add(`mlb_${lab}`, mlb.filter(fn));
for (const [lab, fn] of lineBands) add(`mlb_${lab}`, mlb.filter(fn));

const launchCandidates = segs.filter((s) => s.verdict === "launch_candidate");
const watchlist = segs.filter((s) => s.verdict === "shadow_watchlist");
const base = baselineRecords();
const aw = activeWatchlist(ACTIVE_DATE);

// --- console summary -------------------------------------------------------
console.log(`V2 learning feedback — ${dates.length} settled dates (${dates[0]}…${dates[dates.length - 1]})`);
console.log(`  decided legs: MLB ${mlb.length}, NBA ${nba.length} | de-vig-able overall N=${overallN}`);
console.log(`  baseline lifetime: generated ${base.generated?.wins}W/${base.generated?.losses}L (${fmtPct(base.generated?.hitRate)}) · published ${base.published.wins}W/${base.published.losses}L (${fmtPct(base.published.hitRate)})`);
console.log(`  LAUNCH CANDIDATES (corrected gates): ${launchCandidates.length}`);
console.log(`  shadow_watchlist segments: ${watchlist.length}`);
for (const s of watchlist) console.log(`    - ${s.key}: N=${s.n} ${Math.round(100 * s.rate)}% devig ${fmtPct(s.meanDevig)} padj=${s.pAdj.toFixed(3)} dates ${s.positiveDates}/${s.totalDates} fail:${s.failedGates.join(",")}`);
for (const s of launchCandidates) console.log(`    !! LAUNCH CANDIDATE ${s.key}: N=${s.n} ${Math.round(100 * s.rate)}% devig ${fmtPct(s.meanDevig)} padj=${s.pAdj.toFixed(3)}`);
if (aw) console.log(`  active-slate watchlist ${aw.date}: ${aw.flagged}/${aw.actionable} legs flagged (informational; ENABLE_V2_SHADOW_CANDIDATE=${ENABLE_V2_SHADOW_CANDIDATE})`);

if (WRITE) {
  const m = [];
  m.push("# V2 Learning Feedback (auto-generated)");
  m.push("");
  m.push("> `audit-v2-learning-feedback.mjs --write-report` · READ-ONLY · settled slates only · no paid API · no live wiring · no public claims.");
  m.push("");
  m.push("## 1. Dataset coverage");
  m.push(`- Settled dates: ${dates.length} (${dates[0]} → ${dates[dates.length - 1]}), public era ≥ ${PUBLIC_ERA_START}, excluding ${[...EXCLUDED_DATES].join(", ")}.`);
  m.push(`- Decided legs (win/loss only; pending + pushes excluded): MLB ${mlb.length}, NBA ${nba.length}.`);
  m.push(`- De-vig-able legs (two-sided market): overall N = ${overallN}.`);
  m.push("");
  m.push("## 2. Leakage guard");
  m.push(`- Active slate ${ACTIVE_DATE ?? "(none passed)"} is EXCLUDED from the learning dataset by construction.`);
  m.push("- Only settled win/loss outcomes are used; no future labels; the active-slate watchlist (section 9) carries NO outcomes.");
  m.push("");
  m.push("## 3. Baseline records (lifetime, public era)");
  m.push(`- Generated pool: ${base.generated?.wins}W / ${base.generated?.losses}L / ${base.generated?.pending} pending — ${fmtPct(base.generated?.hitRate)}.`);
  m.push(`- Published cards: ${base.published.wins}W / ${base.published.losses}L / ${base.published.pending} pending — ${fmtPct(base.published.hitRate)}.`);
  if (base.bySport) for (const [k, v] of Object.entries(base.bySport)) m.push(`- By sport ${k}: ${v.wins}W / ${v.losses}L — ${fmtPct(v.hitRate)}.`);
  m.push("");
  m.push("## 4. Feature inventory");
  m.push("- Available: sport, market, side, win/loss, de-vig (two-sided MLB/NBA), confidence, edgePct, line, modelProb (MLB), recentSeries L5/L10 (MLB).");
  m.push("- Missing / unreliable: home/away split (not in settled lean rows), NBA modelProb/recentSeries (board shape differs), batter handedness/platoon, confirmed-starter.");
  m.push("");
  m.push("## 5–8. Hit/miss learning by segment (hardened gates)");
  m.push(`Bonferroni numTests = ${NUMTESTS}. Each segment classified by \`classifyCandidate\` (de-vig baseline, naive + corrected CI, adjusted p, date-split stability, single-date dependence).`);
  m.push("");
  m.push("| segment | N | rate | de-vig | corrCI.lo | pAdj | dates+ | stable | verdict |");
  m.push("|---------|--:|-----:|-------:|----------:|-----:|-------:|:------:|---------|");
  for (const s of segs.sort((a, b) => b.n - a.n)) {
    m.push(`| ${s.key} | ${s.n} | ${Math.round(100 * s.rate)}% | ${fmtPct(s.meanDevig)} | ${fmtPct(s.correctedCI.lo)} | ${s.pAdj.toFixed(3)} | ${s.positiveDates}/${s.totalDates} | ${s.stable ? "y" : "n"} | ${s.verdict} |`);
  }
  m.push("");
  m.push("## 8. Action recommendations");
  m.push(`- **Launch candidates (corrected gates): ${launchCandidates.length}.** ${launchCandidates.length === 0 ? "Keep V2 internal." : "STOP — operator review required (see flagged rows)."}`);
  m.push(`- Shadow watchlist (clears naive CI only, fails ≥1 hard gate): ${watchlist.map((s) => s.key).join(", ") || "none"}.`);
  m.push("- Everything else: needs_more_data / market_already_prices_it / blocked / rejected — not actionable.");
  m.push("");
  m.push("## 9. Active-slate watchlist (informational, NO outcomes)");
  if (aw) {
    m.push(`- ${aw.date}: ${aw.flagged} of ${aw.actionable} actionable legs match a watchlist rule. By market: ${JSON.stringify(aw.byMarket)}.`);
    m.push(`- \`ENABLE_V2_SHADOW_CANDIDATE = ${ENABLE_V2_SHADOW_CANDIDATE}\` → watchlist is internal only; it changes NO public output and makes NO recommendation.`);
  } else {
    m.push("- No active date passed (`--date`), or no board — watchlist not computed.");
  }
  m.push("");
  m.push("*Read-only. No model/projection/optimizer/grading/data change. V2 not wired live.*");
  mkdirSync(DOCS, { recursive: true });
  writeFileSync(resolve(DOCS, "v2-learning-feedback-latest.md"), m.join("\n"), "utf8");
  console.log("[--write-report] wrote v2-learning-feedback-latest.md");
}
