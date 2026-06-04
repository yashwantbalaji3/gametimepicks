/**
 * audit-v2-dataset-inventory — READ-ONLY, deterministic inventory of all settled
 * validation data + a feature-availability matrix for v2. No paid API, no writes
 * except the docs report. Helps see exactly what evidence v2 has to work with.
 *
 * Run: cd app && npx tsx scripts/audit-v2-dataset-inventory.mjs [--write-report]
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const VALID = resolve(__dirname, "..", "..", "pipeline", "validation");
const REPORT = resolve(__dirname, "..", "..", "docs", "audits", "v2-dataset-inventory-latest.md");
const WRITE = (typeof process !== "undefined" ? process.argv : []).includes("--write-report");
const PUBLIC_ERA_START = "2026-05-27";
const EXCLUDED = new Set(["2026-05-25", "2026-05-26"]);
const DATE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

function jsonl(p) {
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function loadJSON(p) { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } }
function datesIn(d) { let f = []; try { f = readdirSync(d); } catch { f = []; } return f.map((x) => (DATE_RE.exec(x) || [])[1]).filter(Boolean).sort(); }
const inEra = (d) => d >= PUBLIC_ERA_START && !EXCLUDED.has(d);
const uniq = (a) => [...new Set(a)];
function countBy(a, f) { const m = {}; for (const x of a) { const k = f(x); m[k] = (m[k] || 0) + 1; } return m; }

function inventory() {
  // --- MLB settled leans ---
  const mlb = jsonl(resolve(VALID, "mlb_settled_leans.jsonl"));
  const mlbPub = mlb.filter((r) => inEra(r.date));
  const mlbOut = countBy(mlbPub.filter((r) => ["win", "loss"].includes((r.outcome || "").toLowerCase())), (r) => r.outcome.toLowerCase());
  const mlbPushPend = mlbPub.length - (mlbOut.win || 0) - (mlbOut.loss || 0);

  // --- NBA settled leans ---
  const nba = jsonl(resolve(VALID, "settled_leans.jsonl"));
  const nbaPub = nba.filter((r) => inEra(r.date));
  const nbaOut = countBy(nbaPub.filter((r) => ["win", "loss"].includes((r.result || "").toLowerCase())), (r) => r.result.toLowerCase());

  // --- boards ---
  const mlbBoards = datesIn(resolve(DATA, "mlb", "boards"));
  const nbaBoards = existsSync(resolve(DATA, "boards")) ? datesIn(resolve(DATA, "boards")) : [];
  // two-way odds completeness on a recent MLB board
  let mlbTwoWay = "n/a";
  const latestMlbBoard = mlbBoards.slice(-1)[0];
  if (latestMlbBoard) {
    const b = loadJSON(resolve(DATA, "mlb", "boards", `${latestMlbBoard}.json`));
    const leans = b?.leans || [];
    const tw = leans.filter((l) => typeof l.oddsOver === "number" && typeof l.oddsUnder === "number").length;
    mlbTwoWay = `${tw}/${leans.length} on ${latestMlbBoard}`;
  }

  // --- graded ---
  const graded = datesIn(resolve(DATA, "parlays", "optimizer-graded"));
  const gradedPub = graded.filter(inEra);

  return {
    mlb: {
      total: mlb.length, pub: mlbPub.length,
      dates: uniq(mlbPub.map((r) => r.date)).sort(),
      markets: countBy(mlbPub, (r) => r.marketKey),
      win: mlbOut.win || 0, loss: mlbOut.loss || 0, pushPend: mlbPushPend,
      hasModelProb: mlbPub.some((r) => typeof r.modelProbOver === "number"),
      hasOddsInline: mlbPub.some((r) => typeof r.oddsOver === "number"),
    },
    nba: {
      total: nba.length, pub: nbaPub.length,
      dates: uniq(nbaPub.map((r) => r.date)).sort(),
      markets: countBy(nbaPub, (r) => r.market),
      win: nbaOut.win || 0, loss: nbaOut.loss || 0,
      hasOddsInline: nbaPub.some((r) => typeof r.oddsOver === "number"),
    },
    boards: { mlb: mlbBoards, nba: nbaBoards, mlbTwoWay },
    graded: { all: graded, pub: gradedPub },
  };
}

// Feature availability for v2 segment search.
const FEATURES = [
  ["recentSeries (full season)", "AVAILABLE", "MLB board `leans[].recentSeries` (oldest→newest)"],
  ["true L5 / L10", "AVAILABLE", "derived from board recentSeries (MLB only; NBA ordering unverified → fail closed)"],
  ["Low gate (L5 5/5)", "AVAILABLE", "derived; gated as shadow_watchlist"],
  ["odds cutoff (≤ -150)", "AVAILABLE", "board oddsOver/oddsUnder"],
  ["model probability", "AVAILABLE", "settled_leans modelProbOver/Under"],
  ["market probability (de-vigged)", "AVAILABLE", "board impliedOver/Under → two-way de-vig"],
  ["home / away", "AVAILABLE", "board homeTeamAbbr/awayTeamAbbr vs playerTeamAbbr"],
  ["line bucket", "AVAILABLE", "board/settled line"],
  ["market type", "AVAILABLE", "marketKey (4 MLB markets)"],
  ["batter handedness", "MISSING", "no handedness field in any source"],
  ["pitcher handedness", "MISSING", "no handedness field"],
  ["platoon split", "MISSING (market-calibrated)", "needs handedness; prior study: market already prices it"],
  ["confirmed starter", "MISSING", "no confirmed-starter field"],
  ["park / weather / umpire", "MISSING", "not collected"],
  ["NBA injury / minutes / usage", "MISSING", "NBA pregame features not collected; board ordering unverified"],
  ["alternate lines", "MISSING", "provider request scope excludes *_alternate markets (see alternate-lines-readiness)"],
];

function render(inv) {
  const m = [];
  const L = (s) => m.push(s);
  L("# v2 Dataset Inventory (auto-generated)");
  L("");
  L("> `app/scripts/audit-v2-dataset-inventory.mjs --write-report` · READ-ONLY · deterministic · no paid API.");
  L("> What settled evidence v2 has, and which features are available vs missing.");
  L("");
  L("## Settled validation data (public era ≥ 2026-05-27; May 25/26 banned)");
  L("");
  L("### MLB settled leans (`pipeline/validation/mlb_settled_leans.jsonl`)");
  L(`- Rows: total ${inv.mlb.total}, public-era ${inv.mlb.pub}. Dates: ${inv.mlb.dates.join(", ")}`);
  L(`- Outcomes (public era): **${inv.mlb.win}W / ${inv.mlb.loss}L** · push/pending ${inv.mlb.pushPend}`);
  L(`- Markets: ${Object.entries(inv.mlb.markets).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  L(`- model probability: ${inv.mlb.hasModelProb ? "yes" : "no"} · odds inline: ${inv.mlb.hasOddsInline ? "yes" : "no (join board for odds/de-vig)"}`);
  L("");
  L("### NBA settled leans (`pipeline/validation/settled_leans.jsonl`)");
  L(`- Rows: total ${inv.nba.total}, public-era ${inv.nba.pub}. Dates: ${inv.nba.dates.join(", ") || "(none)"}`);
  L(`- Outcomes (public era): **${inv.nba.win}W / ${inv.nba.loss}L**`);
  L(`- Markets: ${Object.entries(inv.nba.markets).map(([k, v]) => `${k}=${v}`).join(", ") || "(none)"}`);
  L(`- odds inline: ${inv.nba.hasOddsInline ? "yes (oddsOver/Under)" : "no"}. NBA recent-form fails closed (ordering unverified).`);
  L("");
  L("### Boards & graded");
  L(`- MLB boards: ${inv.boards.mlb.length} dates (${inv.boards.mlb[0]} … ${inv.boards.mlb.slice(-1)[0]}). Two-way odds: ${inv.boards.mlbTwoWay}.`);
  L(`- NBA boards: ${inv.boards.nba.length} dates (${inv.boards.nba[0] ?? "—"} … ${inv.boards.nba.slice(-1)[0] ?? "—"}).`);
  L(`- optimizer-graded: ${inv.graded.all.length} dates; public-era ${inv.graded.pub.length} (${inv.graded.pub.join(", ")}).`);
  L("");
  L("## Leakage posture");
  L("- Settled-only (outcomes from the settled log); recent form sourced from THAT date's pregame board (no future leakage).");
  L("- May 25/26 + pre-era excluded by date filter. Per-slate board scoping (no cross-slate leakage).");
  L("");
  L("## Feature availability matrix");
  L("| Feature | Status | Source / note |");
  L("|---------|--------|---------------|");
  for (const [f, s, n] of FEATURES) L(`| ${f} | ${s} | ${n} |`);
  L("");
  L("## Implication");
  L("- The de-vigged unbiased MLB sample is the strongest evidence and is fully usable.");
  L("- New *features* (handedness, platoon, confirmed starter, park/weather, NBA pregame, alternate lines) are **missing** — they cannot be validated until collected; they are not under-sampled, they are absent.");
  L("- More *volume* (settled slates) is what the available recent-form gates need to clear the hardened launch gates.");
  L("");
  L("*Read-only; no public/model/data change.*");
  L("");
  return m.join("\n");
}

const inv = inventory();
console.log(`MLB settled pub=${inv.mlb.pub} (${inv.mlb.win}W/${inv.mlb.loss}L) dates=${inv.mlb.dates.length} | NBA pub=${inv.nba.pub} (${inv.nba.win}W/${inv.nba.loss}L) dates=${inv.nba.dates.length}`);
console.log(`MLB boards=${inv.boards.mlb.length} NBA boards=${inv.boards.nba.length} graded(pub)=${inv.graded.pub.length} | two-way: ${inv.boards.mlbTwoWay}`);
if (WRITE) { mkdirSync(dirname(REPORT), { recursive: true }); writeFileSync(REPORT, render(inv), "utf8"); console.log(`[--write-report] wrote ${REPORT}`); }
