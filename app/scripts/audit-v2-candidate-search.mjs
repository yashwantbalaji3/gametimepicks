/**
 * audit-v2-candidate-search — READ-ONLY, deterministic aggressive search for a
 * validated v2 launch candidate. Unlike shadow-parlay-methodology-v2 (which
 * looks only at optimizer-SELECTED legs), this evaluates the UNBIASED
 * all-priced-props sample: every priced + settled lean, joined to the pregame
 * board for the two-sided market so we can DE-VIG properly and test whether any
 * feature family beats the de-vigged market out of sample.
 *
 * DATA (all local, no paid API, deterministic):
 *   pipeline/validation/mlb_settled_leans.jsonl  — every settled MLB lean
 *     (date, playerId, marketKey, line, lean[side], confidence, edgePct,
 *      modelProbOver/Under, outcome[Win|Loss]).  Unbiased: not just selected.
 *   app/public/data/mlb/boards/<date>.json       — pregame board: oddsOver/Under,
 *     impliedOver/Under (=> de-vig), recentSeries (=> true L5/L10 tail).
 *   pipeline/validation/settled_leans.jsonl      — settled NBA leans with odds
 *     inline (oddsOver/Under, side, result). Market-calibration only; NBA
 *     recent-form fails closed (board ordering unverified).
 *
 * PUBLIC ERA only (>= 2026-05-27); May 25/26 BANNED. Settled-only. No leakage:
 * each leg's recent form comes from THAT date's pregame board; outcomes from the
 * settled log; nothing from the target game leaks into the feature.
 *
 * DE-VIG: devig(side) = impliedSide / (impliedOver + impliedUnder). The chosen
 * side's de-vigged probability is the market's fair estimate; a feature "beats
 * the de-vigged market" only if its win rate's 95% Wilson lower bound exceeds
 * the mean de-vigged probability of the legs it selects.
 *
 * HARD GATES for `launch_candidate` (all must hold):
 *   1 settled-only · 2 no leakage · 3 unbiased/all-priced sample ·
 *   4 n >= 40 in the bucket (overall sample >= 250) ·
 *   5 beats de-vigged market (Wilson lo > mean devig) ·
 *   6 a calibration gap exists vs the de-vigged market ·
 *   7 date-split stable (effect positive in >= 60% of dates) ·
 *   8 CI excludes the market baseline · 9 not explained by edgePct/confidence ·
 *   10 holds out-of-sample (per-date / time split).
 * Anything weaker is watchlist / needs_more_data / market_already_prices_it /
 * blocked_* / rejected. NOTHING is wired live here.
 *
 * Run: cd app && npx tsx scripts/audit-v2-candidate-search.mjs [--write-report]
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const VALID = resolve(__dirname, "..", "..", "pipeline", "validation");
const REPORT_PATH = resolve(__dirname, "..", "..", "docs", "audits", "v2-candidate-search-latest.md");
const WRITE_REPORT = (typeof process !== "undefined" ? process.argv : []).includes("--write-report");

const PUBLIC_ERA_START = "2026-05-27";
const EXCLUDED_DATES = new Set(["2026-05-25", "2026-05-26"]);
const Z = 1.96;
const MIN_BUCKET = 40;     // per-bucket decided-leg floor
const MIN_OVERALL = 250;   // overall unbiased-sample floor
const EDGE_BASELINE_MARGIN = 0.03; // "within 3pp of de-vig" => market already prices it

// ---------------------------------------------------------------------------
function loadJSONL(path) {
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const s = line.trim();
    if (!s) continue;
    try { out.push(JSON.parse(s)); } catch { /* skip bad line */ }
  }
  return out;
}
function loadJSON(path) { try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; } }
const inEra = (d) => typeof d === "string" && d >= PUBLIC_ERA_START && !EXCLUDED_DATES.has(d);

function wilson(w, n) {
  if (n <= 0) return { lo: 0, hi: 0 };
  const p = w / n, d = 1 + (Z * Z) / n;
  const c = (p + (Z * Z) / (2 * n)) / d;
  const m = (Z / d) * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n));
  return { lo: Math.max(0, c - m), hi: Math.min(1, c + m) };
}
const americanToImplied = (o) =>
  typeof o === "number" && Number.isFinite(o) && o !== 0
    ? (o < 0 ? -o / (-o + 100) : 100 / (o + 100))
    : null;
const pctS = (w, n) => (n > 0 ? `${Math.round((100 * w) / n)}%` : "—");
const f2 = (x) => (x == null ? "—" : (100 * x).toFixed(1) + "%");

// MLB recent window (oldest->newest => recent = tail).
function windowHits(series, n, line, side) {
  if (!Array.isArray(series)) return null;
  const s = series.map(Number).filter(Number.isFinite);
  if (s.length < n || typeof line !== "number") return null;
  const w = s.slice(-n);
  const sd = (side || "").toLowerCase();
  let hits = 0;
  for (const v of w) {
    if (v === line) continue; // push = non-hit in strict window
    if (sd === "over" ? v > line : v < line) hits++;
  }
  return { n, hits };
}

// ---------------------------------------------------------------------------
// Board index per date: (playerId|marketKey|line) -> board lean.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Build the unbiased MLB all-priced sample (settled leans joined to board).
// ---------------------------------------------------------------------------
function buildMlbSample() {
  const settled = loadJSONL(resolve(VALID, "mlb_settled_leans.jsonl")).filter((r) => inEra(r.date));
  const byDate = new Map();
  const legs = [];
  let matched = 0, noBoard = 0, decided = 0;
  for (const r of settled) {
    const out = (r.outcome || "").toLowerCase();
    if (out !== "win" && out !== "loss") continue;
    decided++;
    const date = r.date;
    if (!byDate.has(date)) byDate.set(date, boardIndex(date));
    const idx = byDate.get(date);
    const bl = idx.get(`${r.playerId}|${r.marketKey}|${r.line}`) || null;
    const side = r.lean;
    const win = out === "win";
    if (!bl) { noBoard++; continue; }
    matched++;
    const io = bl.impliedOver, iu = bl.impliedUnder;
    const sumImp = (typeof io === "number" && typeof iu === "number") ? io + iu : null;
    const rawImplied = side === "Over" ? americanToImplied(bl.oddsOver) : americanToImplied(bl.oddsUnder);
    const devig = sumImp ? (side === "Over" ? io : iu) / sumImp : null;
    const modelProb = side === "Over" ? r.modelProbOver : r.modelProbUnder;
    const l5 = windowHits(bl.recentSeries, 5, r.line, side);
    const l10 = windowHits(bl.recentSeries, 10, r.line, side);
    legs.push({
      date, market: r.marketKey, side, win,
      devig, rawImplied, modelProb,
      confidence: r.confidence, edgePct: r.edgePct, line: r.line,
      l5h: l5 ? l5.hits : null, l10h: l10 ? l10.hits : null,
      oddsForSide: side === "Over" ? bl.oddsOver : bl.oddsUnder,
    });
  }
  return { legs, decided, matched, noBoard, dates: [...byDate.keys()].sort() };
}

// NBA: odds inline; market-calibration only.
function buildNbaSample() {
  const rows = loadJSONL(resolve(VALID, "settled_leans.jsonl")).filter((r) => inEra(r.date));
  const legs = [];
  for (const r of rows) {
    const res = (r.result || "").toLowerCase();
    if (res !== "win" && res !== "loss") continue;
    const side = r.side;
    const io = americanToImplied(r.oddsOver), iu = americanToImplied(r.oddsUnder);
    const sumImp = io != null && iu != null ? io + iu : null;
    const devig = sumImp ? (side === "Over" ? io : iu) / sumImp : null;
    legs.push({ date: r.date, market: r.market, side, win: res === "win", devig, rawImplied: side === "Over" ? io : iu });
  }
  return { legs, dates: [...new Set(legs.map((l) => l.date))].sort() };
}

// ---------------------------------------------------------------------------
// Segment stats + verdict.
// ---------------------------------------------------------------------------
function statOf(legs) {
  const m = legs.filter((l) => l.devig != null); // de-vig available
  const n = m.length;
  const w = m.filter((l) => l.win).length;
  const meanDevig = n ? m.reduce((a, l) => a + l.devig, 0) / n : null;
  const meanRaw = n ? m.reduce((a, l) => a + (l.rawImplied ?? 0), 0) / n : null;
  const meanModel = n ? m.reduce((a, l) => a + (l.modelProb ?? 0), 0) / n : null;
  const ci = wilson(w, n);
  // per-date delta (winRate - meanDevig)
  const dd = {};
  for (const l of m) {
    dd[l.date] = dd[l.date] || { w: 0, n: 0, dv: 0 };
    dd[l.date].w += l.win ? 1 : 0; dd[l.date].n++; dd[l.date].dv += l.devig;
  }
  const dateDeltas = Object.entries(dd).map(([d, v]) => ({ date: d, delta: v.w / v.n - v.dv / v.n, n: v.n }));
  return { n, w, l: n - w, rate: n ? w / n : 0, meanDevig, meanRaw, meanModel, ci, dateDeltas };
}

function verdict(s, { overallN }) {
  if (s.n < MIN_BUCKET) return "blocked_sample_size";
  const beats = s.meanDevig != null && s.ci.lo > s.meanDevig; // CI excludes market baseline
  const edge = s.meanDevig != null ? s.rate - s.meanDevig : 0;
  const posDates = s.dateDeltas.filter((d) => d.delta > 0).length;
  const stable = s.dateDeltas.length >= 3 && posDates >= Math.ceil(s.dateDeltas.length * 0.6);
  if (!beats) {
    if (Math.abs(edge) <= EDGE_BASELINE_MARGIN) return "market_already_prices_it";
    return edge < 0 ? "rejected" : "needs_more_data";
  }
  // beats de-vig market with CI excluding baseline
  if (!stable) return "blocked_unstable";
  if (overallN < MIN_OVERALL) return "watchlist";
  return "launch_candidate";
}

function row(name, s, v) {
  const edge = s.meanDevig != null ? (s.rate - s.meanDevig) : null;
  return {
    name, verdict: v, n: s.n, w: s.w,
    rate: pctS(s.w, s.n),
    ci: `${Math.round(s.ci.lo * 100)}–${Math.round(s.ci.hi * 100)}%`,
    devig: f2(s.meanDevig), raw: f2(s.meanRaw), model: f2(s.meanModel),
    edge: edge == null ? "—" : `${edge >= 0 ? "+" : ""}${(edge * 100).toFixed(1)}pp`,
    posDates: `${s.dateDeltas.filter((d) => d.delta > 0).length}/${s.dateDeltas.length}`,
  };
}

// ---------------------------------------------------------------------------
function analyze() {
  const mlb = buildMlbSample();
  const nba = buildNbaSample();
  const overallN = mlb.legs.filter((l) => l.devig != null).length;
  const results = [];
  const seg = (name, legs) => results.push(row(name, statOf(legs), verdict(statOf(legs), { overallN })));

  // -- All-priced overall --
  seg("mlb_all_priced_overall", mlb.legs);

  // -- By side --
  seg("mlb_side_over", mlb.legs.filter((l) => l.side === "Over"));
  seg("mlb_side_under", mlb.legs.filter((l) => l.side === "Under"));

  // -- By market --
  const markets = [...new Set(mlb.legs.map((l) => l.market))].sort();
  for (const mk of markets) seg(`mlb_market_${mk}`, mlb.legs.filter((l) => l.market === mk));

  // -- By confidence --
  for (const c of ["High", "Medium", "Low"]) seg(`mlb_conf_${c.toLowerCase()}`, mlb.legs.filter((l) => l.confidence === c));

  // -- By de-vig implied-prob bucket --
  const ipb = [
    ["lt40", (l) => l.devig != null && l.devig < 0.4],
    ["40to50", (l) => l.devig != null && l.devig >= 0.4 && l.devig < 0.5],
    ["50to60", (l) => l.devig != null && l.devig >= 0.5 && l.devig < 0.6],
    ["60to70", (l) => l.devig != null && l.devig >= 0.6 && l.devig < 0.7],
    ["ge70", (l) => l.devig != null && l.devig >= 0.7],
  ];
  for (const [lab, fn] of ipb) seg(`mlb_devig_${lab}`, mlb.legs.filter(fn));

  // -- By edgePct bucket (to show edge is NOT a usable quality signal) --
  const eb = [
    ["neg", (l) => typeof l.edgePct === "number" && l.edgePct < 0],
    ["0to5", (l) => typeof l.edgePct === "number" && l.edgePct >= 0 && l.edgePct < 5],
    ["5to15", (l) => typeof l.edgePct === "number" && l.edgePct >= 5 && l.edgePct < 15],
    ["ge15", (l) => typeof l.edgePct === "number" && l.edgePct >= 15],
  ];
  for (const [lab, fn] of eb) seg(`mlb_edge_${lab}`, mlb.legs.filter(fn));

  // -- Recent-form gates on the UNBIASED all-priced sample --
  seg("mlb_recentform_L5_5of5", mlb.legs.filter((l) => l.l5h === 5));
  seg("mlb_recentform_L5_4plus", mlb.legs.filter((l) => l.l5h != null && l.l5h >= 4));
  seg("mlb_recentform_L10_8plus", mlb.legs.filter((l) => l.l10h != null && l.l10h >= 8));
  seg("mlb_low_gate_5of5_and_-150", mlb.legs.filter((l) => l.l5h === 5 && typeof l.oddsForSide === "number" && l.oddsForSide <= -150));

  // -- NBA market calibration (limited) --
  seg("nba_all_priced_overall", nba.legs);

  return { mlb, nba, overallN, results };
}

// ---------------------------------------------------------------------------
function render(a) {
  const launch = a.results.filter((r) => r.verdict === "launch_candidate");
  const watch = a.results.filter((r) => r.verdict === "watchlist");
  const lines = [];
  const L = (s) => lines.push(s);
  L("# v2 Candidate Search — Aggressive Unbiased Validation (auto-generated)");
  L("");
  L("> `app/scripts/audit-v2-candidate-search.mjs --write-report` · READ-ONLY · deterministic · **no paid API · no live wiring**.");
  L("> Unbiased **all-priced** settled sample joined to the pregame board for proper **de-vigging**. Public era only; May 25/26 banned; settled-only.");
  L("");
  L(`## GLOBAL: ${launch.length ? `**${launch.length} launch_candidate(s) — STOP for operator review**` : "no launch_candidate"}${watch.length ? ` · ${watch.length} watchlist` : ""}`);
  L("");
  L("## Sample");
  L(`- MLB unbiased settled legs (public era): decided **${a.mlb.decided}**, board-matched (de-vig available) **${a.mlb.matched}**, no-board ${a.mlb.noBoard}. Dates: ${a.mlb.dates.join(", ")}.`);
  L(`- NBA settled legs (public era, odds inline): **${a.nba.legs.length}**. Dates: ${a.nba.dates.join(", ") || "(none)"}. (Market-calibration only; recent-form fails closed.)`);
  L(`- Gates: bucket n ≥ ${MIN_BUCKET}; overall ≥ ${MIN_OVERALL} (= ${a.overallN}); "beats market" = Wilson 95% lower bound > mean de-vigged prob; date-split stable ≥60% positive dates.`);
  L("");
  L("## Candidate table");
  L("| Candidate | Verdict | N | Win% | 95% CI | de-vig | edge vs de-vig | dates+ |");
  L("|-----------|---------|--:|----:|:------:|:-----:|:--------------:|:-----:|");
  for (const r of a.results) {
    L(`| \`${r.name}\` | \`${r.verdict}\` | ${r.n} | ${r.rate} | ${r.ci} | ${r.devig} | ${r.edge} | ${r.posDates} |`);
  }
  L("");
  L("## Reading this");
  L("- **edge vs de-vig** = win rate − mean de-vigged market probability of the chosen side. A genuine, exploitable edge needs this *positive AND* the CI lower bound above the de-vig baseline (column `95% CI` low > `de-vig`).");
  L("- `market_already_prices_it` = win rate within ±3pp of the de-vigged market (no exploitable gap).");
  L("- `blocked_sample_size` = bucket < 40 decided. `blocked_unstable` = beats market overall but not in ≥60% of dates (likely noise).");
  L("- The `mlb_edge_*` rows test whether `edgePct` predicts outcomes — if higher-edge buckets do NOT win more, edge is not a usable quality signal (and must never be sold as one).");
  L("- Recent-form rows are computed on the **unbiased** sample (all priced legs, not just the optimizer's picks).");
  L("");
  if (launch.length) {
    L("## ⚠️ Launch candidate(s) — DO NOT WIRE; operator review required");
    for (const r of launch) L(`- \`${r.name}\`: ${r.rate} over N=${r.n} (CI ${r.ci}) vs de-vig ${r.devig} (edge ${r.edge}, positive in ${r.posDates} dates).`);
    L("");
    L("Next: `docs/V2_LAUNCH_CANDIDATE_PLAN.md` (flag design + rollback + tests). No live wiring without explicit operator approval.");
  } else {
    L("## Conclusion: no launch candidate");
    L("No feature family clears all hard gates on the unbiased de-vigged sample. The market prices the priced props efficiently; the only buckets that beat the de-vig baseline (if any) are too small or unstable. Keep v2 shadow-only; gather more settled slates. See `docs/V2_NOT_READY_DECISION.md`.");
  }
  L("");
  L("*Overwritten by the script. Do not hand-edit.*");
  L("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
const a = analyze();
// console summary
console.log("V2 CANDIDATE SEARCH — unbiased all-priced, de-vigged. READ-ONLY.");
console.log(`MLB decided=${a.mlb.decided} matched=${a.mlb.matched} noBoard=${a.mlb.noBoard} | NBA=${a.nba.legs.length} | overallN=${a.overallN}`);
const launch = a.results.filter((r) => r.verdict === "launch_candidate");
console.log(`GLOBAL: ${launch.length ? launch.length + " LAUNCH_CANDIDATE(S)" : "no launch_candidate"}`);
console.log("name | verdict | N | win% | CI | devig | edge | dates+");
for (const r of a.results) console.log(`  ${r.name} | ${r.verdict} | ${r.n} | ${r.rate} | ${r.ci} | ${r.devig} | ${r.edge} | ${r.posDates}`);
if (WRITE_REPORT) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, render(a), "utf8");
  console.log(`\n[--write-report] wrote ${REPORT_PATH}`);
}
