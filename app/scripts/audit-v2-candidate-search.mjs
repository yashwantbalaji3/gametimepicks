/**
 * audit-v2-candidate-search — READ-ONLY, deterministic aggressive search for a
 * validated v2 launch candidate over the UNBIASED all-priced-props sample.
 *
 * Every priced + settled lean is joined to the pregame board for the two-sided
 * market so we can DE-VIG and test whether any feature family beats the
 * de-vigged market. `launch_candidate` is gated by the FULL launch criteria in
 * `src/lib/v2-candidate-gates.ts` — it CANNOT be emitted from a naive 95% CI
 * alone (multiple-comparisons correction, adjusted p-value, date-split
 * stability, and no single-date overdependence are all required). A segment
 * that clears only the naive CI is `shadow_watchlist` (promising, unconfirmed).
 *
 * DATA (all local, no paid API, deterministic):
 *   pipeline/validation/mlb_settled_leans.jsonl  — every settled MLB lean
 *   app/public/data/mlb/boards/<date>.json       — oddsOver/Under, impliedOver/Under, recentSeries
 *   pipeline/validation/settled_leans.jsonl      — settled NBA leans (odds inline)
 *
 * PUBLIC ERA only (>= 2026-05-27); May 25/26 BANNED; settled-only; no leakage.
 *
 * Run: cd app && npx tsx scripts/audit-v2-candidate-search.mjs [--write-report]
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { classifyCandidate, DEFAULT_GATES } from "../src/lib/v2-candidate-gates.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const VALID = resolve(__dirname, "..", "..", "pipeline", "validation");
const REPORT_PATH = resolve(__dirname, "..", "..", "docs", "audits", "v2-candidate-search-latest.md");
const WRITE_REPORT = (typeof process !== "undefined" ? process.argv : []).includes("--write-report");

const PUBLIC_ERA_START = "2026-05-27";
const EXCLUDED_DATES = new Set(["2026-05-25", "2026-05-26"]);
const LOW_MAX_AMERICAN = -150;

// ---------------------------------------------------------------------------
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
const inEra = (d) => typeof d === "string" && d >= PUBLIC_ERA_START && !EXCLUDED_DATES.has(d);
const americanToImplied = (o) =>
  typeof o === "number" && Number.isFinite(o) && o !== 0
    ? (o < 0 ? -o / (-o + 100) : 100 / (o + 100))
    : null;
const pctS = (w, n) => (n > 0 ? `${Math.round((100 * w) / n)}%` : "—");
const f1 = (x) => (x == null ? "—" : (100 * x).toFixed(1) + "%");
const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

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

function boardIndex(date) {
  const b = loadJSON(resolve(DATA, "mlb", "boards", `${date}.json`));
  const idx = new Map();
  if (!b || !Array.isArray(b.leans)) return idx;
  for (const ln of b.leans) {
    if (ln.playerId == null || !(ln.marketKey || ln.market)) continue;
    const key = `${ln.playerId}|${ln.marketKey || ln.market}|${ln.line}`;
    if (!idx.has(key)) idx.set(key, ln);
  }
  return idx;
}

function buildMlbSample() {
  const settled = loadJSONL(resolve(VALID, "mlb_settled_leans.jsonl")).filter((r) => inEra(r.date));
  const byDate = new Map();
  const legs = [];
  let matched = 0, noBoard = 0, decided = 0;
  for (const r of settled) {
    const out = (r.outcome || "").toLowerCase();
    if (out !== "win" && out !== "loss") continue;
    decided++;
    if (!byDate.has(r.date)) byDate.set(r.date, boardIndex(r.date));
    const bl = byDate.get(r.date).get(`${r.playerId}|${r.marketKey}|${r.line}`) || null;
    if (!bl) { noBoard++; continue; }
    matched++;
    const io = bl.impliedOver, iu = bl.impliedUnder;
    const sumImp = (typeof io === "number" && typeof iu === "number") ? io + iu : null;
    const side = r.lean;
    const devig = sumImp ? (side === "Over" ? io : iu) / sumImp : null;
    legs.push({
      date: r.date, market: r.marketKey, side, win: out === "win",
      devig, confidence: r.confidence, edgePct: r.edgePct, line: r.line,
      l5h: windowHits(bl.recentSeries, 5, r.line, side),
      l10h: windowHits(bl.recentSeries, 10, r.line, side),
      oddsForSide: side === "Over" ? bl.oddsOver : bl.oddsUnder,
    });
  }
  return { legs, decided, matched, noBoard, dates: [...byDate.keys()].sort() };
}

function buildNbaSample() {
  const rows = loadJSONL(resolve(VALID, "settled_leans.jsonl")).filter((r) => inEra(r.date));
  const legs = [];
  for (const r of rows) {
    const res = (r.result || "").toLowerCase();
    if (res !== "win" && res !== "loss") continue;
    const io = americanToImplied(r.oddsOver), iu = americanToImplied(r.oddsUnder);
    const sumImp = io != null && iu != null ? io + iu : null;
    const side = r.side;
    const devig = sumImp ? (side === "Over" ? io : iu) / sumImp : null;
    legs.push({ date: r.date, market: r.market, side, win: res === "win", devig });
  }
  return { legs, dates: [...new Set(legs.map((l) => l.date))].sort() };
}

/** Build a CandidateInput (for v2-candidate-gates) from a leg list. Uses only
 *  legs with a de-vig (two-sided market) available. */
function toInput(legs, edgeOrConfidenceDriven) {
  const m = legs.filter((l) => l.devig != null);
  const byDate = new Map();
  let sumDevig = 0, varDevig = 0, w = 0;
  for (const l of m) {
    sumDevig += l.devig;
    varDevig += l.devig * (1 - l.devig);
    if (l.win) w++;
    const c = byDate.get(l.date) || { date: l.date, n: 0, w: 0, sumDevig: 0 };
    c.n++; if (l.win) c.w++; c.sumDevig += l.devig;
    byDate.set(l.date, c);
  }
  return {
    n: m.length, w, sumDevig, varDevig,
    perDate: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    edgeOrConfidenceDriven: !!edgeOrConfidenceDriven,
    leakageClean: true, // settled-only, per-slate board scoping, May25/26 excluded
  };
}

// ---------------------------------------------------------------------------
function analyze() {
  const mlb = buildMlbSample();
  const nba = buildNbaSample();
  const overallN = mlb.legs.filter((l) => l.devig != null).length;

  // Define every searched segment FIRST so numTests (for Bonferroni) is exact.
  const segs = [];
  const add = (name, legs, edgeDriven = false) => segs.push({ name, legs, edgeDriven });

  add("mlb_all_priced_overall", mlb.legs);
  add("mlb_side_over", mlb.legs.filter((l) => l.side === "Over"));
  add("mlb_side_under", mlb.legs.filter((l) => l.side === "Under"));
  for (const mk of [...new Set(mlb.legs.map((l) => l.market))].sort())
    add(`mlb_market_${mk}`, mlb.legs.filter((l) => l.market === mk));
  for (const c of ["High", "Medium", "Low"])
    add(`mlb_conf_${c.toLowerCase()}`, mlb.legs.filter((l) => l.confidence === c), true);
  const ipb = [
    ["lt40", (l) => l.devig != null && l.devig < 0.4],
    ["40to50", (l) => l.devig != null && l.devig >= 0.4 && l.devig < 0.5],
    ["50to60", (l) => l.devig != null && l.devig >= 0.5 && l.devig < 0.6],
    ["60to70", (l) => l.devig != null && l.devig >= 0.6 && l.devig < 0.7],
    ["ge70", (l) => l.devig != null && l.devig >= 0.7],
  ];
  for (const [lab, fn] of ipb) add(`mlb_devig_${lab}`, mlb.legs.filter(fn));
  const eb = [
    ["neg", (l) => typeof l.edgePct === "number" && l.edgePct < 0],
    ["0to5", (l) => typeof l.edgePct === "number" && l.edgePct >= 0 && l.edgePct < 5],
    ["5to15", (l) => typeof l.edgePct === "number" && l.edgePct >= 5 && l.edgePct < 15],
    ["ge15", (l) => typeof l.edgePct === "number" && l.edgePct >= 15],
  ];
  for (const [lab, fn] of eb) add(`mlb_edge_${lab}`, mlb.legs.filter(fn), true);
  add("mlb_recentform_L5_5of5", mlb.legs.filter((l) => l.l5h === 5));
  add("mlb_recentform_L5_4plus", mlb.legs.filter((l) => l.l5h != null && l.l5h >= 4));
  add("mlb_recentform_L10_8plus", mlb.legs.filter((l) => l.l10h != null && l.l10h >= 8));
  add("mlb_low_gate_5of5_and_-150", mlb.legs.filter((l) => l.l5h === 5 && typeof l.oddsForSide === "number" && l.oddsForSide <= LOW_MAX_AMERICAN));
  add("nba_all_priced_overall", nba.legs);

  const numTests = segs.length;
  const cfg = { ...DEFAULT_GATES, overallN, numTests, alpha: 0.05, minPositiveDateFrac: 0.7, marginProp: 0.03 };

  const results = segs.map((s) => {
    const input = toInput(s.legs, s.edgeDriven);
    const r = classifyCandidate(input, cfg);
    return { name: s.name, ...r };
  });

  return { mlb, nba, overallN, numTests, cfg, results };
}

// ---------------------------------------------------------------------------
function render(a) {
  const launch = a.results.filter((r) => r.verdict === "launch_candidate");
  const watch = a.results.filter((r) => r.verdict === "shadow_watchlist");
  const m = [];
  const L = (s) => m.push(s);
  L("# v2 Candidate Search — Aggressive Unbiased Validation (auto-generated)");
  L("");
  L("> `app/scripts/audit-v2-candidate-search.mjs --write-report` · READ-ONLY · deterministic · **no paid API · no live wiring**.");
  L("> Unbiased **all-priced** settled sample joined to the pregame board for proper **de-vigging**. Public era only; May 25/26 banned; settled-only.");
  L("> `launch_candidate` requires the FULL gate set in `src/lib/v2-candidate-gates.ts` (Bonferroni-corrected CI + adjusted p + date stability + no single-date overdependence). A naive-95%-only pass is `shadow_watchlist`.");
  L("");
  L(`## GLOBAL: ${launch.length ? `**${launch.length} launch_candidate(s) — STOP for operator review**` : "no launch_candidate"}${watch.length ? ` · ${watch.length} shadow_watchlist` : ""}`);
  L("");
  L("## Sample & correction");
  L(`- MLB unbiased settled legs (public era): decided **${a.mlb.decided}**, board-matched (de-vig) **${a.mlb.matched}**, no-board ${a.mlb.noBoard}. Dates: ${a.mlb.dates.join(", ")}.`);
  L(`- NBA settled legs (public era, odds inline): **${a.nba.legs.length}**. Dates: ${a.nba.dates.join(", ") || "(none)"}.`);
  L(`- Segments searched (multiple-comparisons family size): **${a.numTests}** → Bonferroni two-sided z = **${a.cfg ? "" : ""}${(a.results[0]?.correctedZ ?? 0).toFixed(3)}** (vs naive 1.960).`);
  L(`- Gates: bucket n ≥ ${a.cfg.minBucketN}; overall ≥ ${a.cfg.minOverallN} (= ${a.overallN}); naive **and** corrected Wilson lower bound > mean de-vig; adjusted p < ${a.cfg.alpha}; ≥${Math.round(a.cfg.minPositiveDateFrac * 100)}% positive dates; no single-date overdependence.`);
  L("");
  L("## Candidate table");
  L("| Candidate | Verdict | N | Win% | naive CI | corr CI | de-vig | edge | p-adj | dates+ |");
  L("|-----------|---------|--:|----:|:--------:|:-------:|:-----:|:----:|:-----:|:-----:|");
  for (const r of a.results) {
    const naive = `${Math.round(r.naiveCI.lo * 100)}–${Math.round(r.naiveCI.hi * 100)}%`;
    const corr = `${Math.round(r.correctedCI.lo * 100)}–${Math.round(r.correctedCI.hi * 100)}%`;
    const edge = `${r.edge >= 0 ? "+" : ""}${(r.edge * 100).toFixed(1)}pp`;
    const padj = r.pAdj >= 0.9995 ? "1.00" : r.pAdj.toFixed(3);
    L(`| \`${r.name}\` | \`${r.verdict}\` | ${r.n} | ${pctS(r.w, r.n)} | ${naive} | ${corr} | ${f1(r.meanDevig)} | ${edge} | ${padj} | ${r.positiveDates}/${r.totalDates} |`);
  }
  L("");
  if (launch.length) {
    L("## ⚠️ launch_candidate(s) — DO NOT WIRE; operator review required");
    for (const r of launch) L(`- \`${r.name}\`: ${pctS(r.w, r.n)} (N=${r.n}); corrected CI ${Math.round(r.correctedCI.lo * 100)}–${Math.round(r.correctedCI.hi * 100)}% vs de-vig ${f1(r.meanDevig)}; p-adj ${r.pAdj.toFixed(4)}.`);
  } else {
    L("## Conclusion: no launch candidate");
    L("No feature family clears the full launch gate set on the unbiased de-vigged sample. Keep v2 shadow-only; gather more settled slates.");
  }
  if (watch.length) {
    L("");
    L("## shadow_watchlist (beats naive CI; fails ≥1 launch gate — track, do not wire)");
    for (const r of watch) {
      L(`- \`${r.name}\`: ${pctS(r.w, r.n)} (N=${r.n}) vs de-vig ${f1(r.meanDevig)} (edge ${r.edge >= 0 ? "+" : ""}${(r.edge * 100).toFixed(1)}pp). Failed gates: ${r.failedGates.join(", ")}. naive CI ${Math.round(r.naiveCI.lo * 100)}–${Math.round(r.naiveCI.hi * 100)}%, corrected ${Math.round(r.correctedCI.lo * 100)}–${Math.round(r.correctedCI.hi * 100)}%, p-adj ${r.pAdj.toFixed(3)}, dates+ ${r.positiveDates}/${r.totalDates}.`);
    }
  }
  L("");
  L("## Reading this");
  L("- **edge** = win rate − mean de-vigged market probability of the chosen side.");
  L("- A genuine edge needs BOTH the naive and the Bonferroni-corrected CI lower bound above de-vig, an adjusted p below the threshold, stability across dates, and no single date carrying the result.");
  L("- `shadow_watchlist` = clears the naive 95% CI but fails ≥1 launch gate (typically the multiple-comparisons correction) → promising but unconfirmed; keep tracking.");
  L("- `mlb_edge_*` / `mlb_conf_*` are flagged edge/confidence-driven and can never be launch candidates (those signals are anti-/non-predictive and must not be sold as quality).");
  L("");
  L("*Overwritten by the script. Do not hand-edit. Gate logic + tests: `src/lib/v2-candidate-gates.ts` (+ `.test.mjs`).*");
  L("");
  return m.join("\n");
}

// ---------------------------------------------------------------------------
const a = analyze();
console.log("V2 CANDIDATE SEARCH — unbiased all-priced, de-vigged, multiplicity-corrected. READ-ONLY.");
console.log(`MLB decided=${a.mlb.decided} matched=${a.mlb.matched} | NBA=${a.nba.legs.length} | overallN=${a.overallN} | segments(numTests)=${a.numTests} | corrZ=${(a.results[0]?.correctedZ ?? 0).toFixed(3)}`);
const launch = a.results.filter((r) => r.verdict === "launch_candidate");
console.log(`GLOBAL: ${launch.length ? launch.length + " LAUNCH_CANDIDATE(S)" : "no launch_candidate"}`);
for (const r of a.results)
  console.log(`  ${r.name} | ${r.verdict} | N=${r.n} | ${pctS(r.w, r.n)} | naive ${Math.round(r.naiveCI.lo * 100)}-${Math.round(r.naiveCI.hi * 100)} | corr ${Math.round(r.correctedCI.lo * 100)}-${Math.round(r.correctedCI.hi * 100)} | devig ${f1(r.meanDevig)} | padj ${r.pAdj.toFixed(3)} | dates ${r.positiveDates}/${r.totalDates}${r.failedGates.length ? " | fail:" + r.failedGates.join(",") : ""}`);
if (WRITE_REPORT) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, render(a), "utf8");
  console.log(`\n[--write-report] wrote ${REPORT_PATH}`);
}
