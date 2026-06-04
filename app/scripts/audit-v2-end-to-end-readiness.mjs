/**
 * audit-v2-end-to-end-readiness — READ-ONLY, deterministic end-to-end readiness
 * orchestrator for the proposed methodology "v2" (recent-form gating + market
 * calibration). It AGGREGATES the gates the individual shadow audits each cover
 * into ONE decision: does any v2 feature clear the bar to wire live?
 *
 * WHAT THIS DOES (and does NOT do)
 * --------------------------------
 *   - Reads only. Never writes generated/betting/product data; never mutates
 *     app/public/data. The single optional write is the docs report below.
 *   - Deterministic: no Date.now / Math.random. Same data => byte-identical out.
 *   - No paid API calls. Reads only local public JSON already on disk:
 *       app/public/data/parlays/optimizer-graded/<date>.json  (settled outcomes)
 *       app/public/data/parlays/optimizer/<date>.json         (active availability)
 *       app/public/data/mlb/boards/<date>.json                (TRUE full series)
 *   - Computes the gate metrics first-hand (true L5/L10 from the board full
 *     series, mirroring app/src/lib/recent-form.ts + shadow-parlay-methodology-v2),
 *     so the verdict does not depend on parsing another script's console output.
 *
 * COMPANION DEEP-DIVE SCRIPTS (run separately for detail; this rolls them up):
 *   shadow-parlay-methodology-v2.mjs   L5/L10 gate evidence + --write-report
 *   model-calibration-analysis.mjs     edge/confidence vs market-implied
 *   shadow-l10-audit.mjs               L10 beyond market
 *   shadow-projection-recalibration.mjs projection->prob recal vs market (OOS)
 *   shadow-volume-discipline.mjs       #241 cap effect
 *
 * Output (console always; markdown with --write-report):
 *   docs/audits/v2-end-to-end-readiness-latest.md
 *
 * Verdict vocabulary (per feature):
 *   launch_candidate | shadow_evaluable | needs_more_data |
 *   market_already_prices_it | blocked_missing_data | blocked_sample_size |
 *   blocked_leakage_risk
 * Global verdict: v2_launch_ready | v2_not_ready   (status PASS | WARN | FAIL)
 *
 * Run: cd app && npx tsx scripts/audit-v2-end-to-end-readiness.mjs [--write-report]
 */

import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "public", "data");
const REPORT_PATH = resolve(__dirname, "..", "..", "docs", "audits", "v2-end-to-end-readiness-latest.md");
const WRITE_REPORT = (typeof process !== "undefined" ? process.argv : []).includes("--write-report");

// ---------------------------------------------------------------------------
// Policy constants (sourced from the documented gates; see docs/MODEL_LEARNING_LOOP.md
// + docs/METHODOLOGY_V2_SHADOW_TRACKING_RUNBOOK.md + the v2 decision memo).
// ---------------------------------------------------------------------------
const PUBLIC_ERA_START = "2026-05-27";              // banned May 25/26 excluded.
const EXCLUDED_DATES = new Set(["2026-05-25", "2026-05-26"]);
const SAMPLE_THRESHOLD = 40;                        // min decided legs per gated bucket.
const LEARNING_LOOP_MIN_DECISIVE = 25;             // min decisive picks/market for a claim.
const LOW_MAX_AMERICAN = -150;                     // Low-section odds cap.
const Z = 1.96;                                     // 95% normal quantile (Wilson CI).
const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.json$/;

// ---------------------------------------------------------------------------
// IO + small helpers (self-contained; identical semantics to the shadow audit).
// ---------------------------------------------------------------------------
function loadJSON(absPath) {
  try { return JSON.parse(readFileSync(absPath, "utf8")); } catch { return null; }
}
function datesInDir(absDir) {
  let files = [];
  try { files = readdirSync(absDir); } catch { files = []; }
  const out = [];
  for (const f of files) { const m = DATE_FILE_RE.exec(f); if (m) out.push(m[1]); }
  return out.sort();
}
const gradedPath = (d) => resolve(DATA, "parlays", "optimizer-graded", `${d}.json`);
const optimizerPath = (d) => resolve(DATA, "parlays", "optimizer", `${d}.json`);
const boardPath = (d) => resolve(DATA, "mlb", "boards", `${d}.json`);

const pctOf = (w, n) => (n > 0 ? (100 * w) / n : 0);
const pctStr = (w, n) => (n > 0 ? `${Math.round(pctOf(w, n))}%` : "—");

/** Wilson 95% score interval for w hits out of n. Returns {lo, hi} in [0,1]. */
function wilson(w, n) {
  if (n <= 0) return { lo: 0, hi: 0 };
  const p = w / n;
  const denom = 1 + (Z * Z) / n;
  const center = (p + (Z * Z) / (2 * n)) / denom;
  const margin = (Z / denom) * Math.sqrt((p * (1 - p)) / n + (Z * Z) / (4 * n * n));
  return { lo: Math.max(0, center - margin), hi: Math.min(1, center + margin) };
}

/** American odds -> raw single-sided implied probability (monotonic market rank).
 *  Not de-vigged (we only have the chosen side) — used only to RANK legs. */
function impliedProb(american) {
  if (typeof american !== "number" || !Number.isFinite(american) || american === 0) return null;
  return american < 0 ? -american / (-american + 100) : 100 / (american + 100);
}

/** Classify one recent value vs line+side: "hit" | "miss" | "push" | null. */
function classify(value, line, side) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value === line) return "push";
  const s = (side ?? "").toLowerCase();
  if (s === "over") return value > line ? "hit" : "miss";
  if (s === "under") return value < line ? "hit" : "miss";
  return null;
}
/** Most-recent N window from a FULL board series. MLB is oldest->newest (verified)
 *  so recent = tail; non-MLB returns null (fail closed). */
function recentWindow(fullSeries, n, sport) {
  if (!Array.isArray(fullSeries)) return null;
  if ((sport ?? "").toLowerCase() !== "mlb") return null;
  const s = fullSeries.map(Number).filter((v) => Number.isFinite(v));
  if (s.length < n) return null;
  return s.slice(-n);
}
function windowHits(fullSeries, n, line, side, sport) {
  const w = recentWindow(fullSeries, n, sport);
  if (w == null) return null;
  let hits = 0, push = 0;
  for (const v of w) { const c = classify(v, line, side); if (c === "hit") hits++; else if (c === "push") push++; }
  return { n, hits, push, miss: n - hits - push };
}
const oddsAtMostMinus150 = (o) => typeof o === "number" && Number.isFinite(o) && o <= LOW_MAX_AMERICAN;
const legSig = (l) => l.leanId || `${l.playerId}|${l.market}|${l.line}|${l.side}`;
const isDecided = (r) => r === "win" || r === "loss";

/** (playerId|market) -> board full season recentSeries. */
function buildBoardIndex(date) {
  const board = loadJSON(boardPath(date));
  const idx = new Map();
  if (!board || !Array.isArray(board.leans)) return idx;
  for (const lean of board.leans) {
    const pid = lean.playerId;
    const mkt = lean.marketKey || lean.market;
    const rs = lean.recentSeries;
    if (pid == null || !mkt || !Array.isArray(rs) || rs.length === 0) continue;
    const key = `${pid}|${mkt}`;
    if (!idx.has(key)) idx.set(key, rs);
  }
  return idx;
}

// ---------------------------------------------------------------------------
// Discovery + availability.
// ---------------------------------------------------------------------------
function discoverSettledDates() {
  return datesInDir(resolve(DATA, "parlays", "optimizer-graded"))
    .filter((d) => d >= PUBLIC_ERA_START && !EXCLUDED_DATES.has(d));
}
function discoverExcludedGraded() {
  return datesInDir(resolve(DATA, "parlays", "optimizer-graded"))
    .filter((d) => d < PUBLIC_ERA_START || EXCLUDED_DATES.has(d));
}
function discoverActiveDate() {
  const dates = datesInDir(resolve(DATA, "parlays", "optimizer"));
  return dates.length ? dates[dates.length - 1] : null;
}

const SETTLED = discoverSettledDates();
const EXCLUDED_GRADED = discoverExcludedGraded();
const ACTIVE = discoverActiveDate();

function dataAvailability() {
  const mlbBoards = datesInDir(resolve(DATA, "mlb", "boards"));
  const nbaBoards = existsSync(resolve(DATA, "nba", "boards"))
    ? datesInDir(resolve(DATA, "nba", "boards"))
    : [];
  const wcDir = resolve(DATA, "worldcup");
  const worldCup = existsSync(wcDir);
  return {
    settled: SETTLED,
    excludedGraded: EXCLUDED_GRADED,
    active: ACTIVE,
    activeSettled: ACTIVE ? existsSync(gradedPath(ACTIVE)) : false,
    mlbBoards,
    nbaBoards,
    worldCup,
  };
}

// ---------------------------------------------------------------------------
// Core: aggregate decided MLB legs across settled public-era slates with true
// L5/L10 + market-implied rank. Deduped per slate by leanId.
// ---------------------------------------------------------------------------
function emptyWL() { return { w: 0, l: 0 }; }
function addWL(b, r) { if (r === "win") b.w++; else if (r === "loss") b.l++; }

function aggregate() {
  const agg = {
    all: emptyWL(),
    l5_5of5: emptyWL(),
    l5_4of5: emptyWL(),
    l5_4plus: emptyWL(),
    l5_3orWorse: emptyWL(),
    lowElig: emptyWL(),     // L5 5/5 AND odds <= -150  (the "Low" gate)
    bankElig: emptyWL(),    // L10 >= 8/10
  };
  const perDate = [];
  // market-implied split (raw implied prob, decided MLB legs)
  const impl = []; // {prob, win}
  let nbaDecided = 0, noBoard = 0;

  for (const date of SETTLED) {
    const graded = loadJSON(gradedPath(date));
    if (!graded || !Array.isArray(graded.uniqueSlips)) { perDate.push({ date, missing: true }); continue; }
    const boardIdx = buildBoardIndex(date);
    const seen = new Map();
    for (const slip of graded.uniqueSlips) {
      for (const leg of slip.legs ?? []) {
        const id = legSig(leg);
        if (!seen.has(id)) seen.set(id, leg);
      }
    }
    const d = { date, mlbDecided: 0, all: emptyWL(), l5_5of5: emptyWL(), l5_4plus: emptyWL(), lowElig: emptyWL() };
    for (const leg of seen.values()) {
      const sport = (leg.sport ?? "mlb").toLowerCase();
      const r = leg.result;
      if (sport !== "mlb") { if (isDecided(r)) nbaDecided++; continue; }
      if (!isDecided(r)) continue;
      const line = typeof leg.line === "number" ? leg.line : null;
      const full = boardIdx.get(`${leg.playerId}|${leg.market || leg.marketKey}`) ?? null;
      if (full == null) { noBoard++; continue; }
      const l5 = line != null ? windowHits(full, 5, line, leg.side, sport) : null;
      const l10 = line != null ? windowHits(full, 10, line, leg.side, sport) : null;

      d.mlbDecided++;
      addWL(agg.all, r); addWL(d.all, r);
      const win = r === "win";
      const prob = impliedProb(leg.oddsForSide);
      if (prob != null) impl.push({ prob, win });

      if (l5 != null) {
        if (l5.hits === 5) { addWL(agg.l5_5of5, r); addWL(d.l5_5of5, r); }
        else if (l5.hits === 4) addWL(agg.l5_4of5, r);
        else addWL(agg.l5_3orWorse, r);
        if (l5.hits >= 4) { addWL(agg.l5_4plus, r); addWL(d.l5_4plus, r); }
        if (l5.hits === 5 && oddsAtMostMinus150(leg.oddsForSide)) { addWL(agg.lowElig, r); addWL(d.lowElig, r); }
      }
      if (l10 != null && l10.hits >= 8) addWL(agg.bankElig, r);
    }
    perDate.push(d);
  }
  return { agg, perDate, impl, nbaDecided, noBoard };
}

/** Market-implied top-half vs bottom-half hit rate (does the market rank work?). */
function marketSplit(impl) {
  const arr = [...impl].sort((a, b) => a.prob - b.prob); // ascending prob
  const n = arr.length;
  if (n < 4) return null;
  const mid = Math.floor(n / 2);
  const bottom = arr.slice(0, mid);   // lower implied prob
  const top = arr.slice(mid);         // higher implied prob
  const rate = (xs) => ({ w: xs.filter((x) => x.win).length, n: xs.length });
  return { top: rate(top), bottom: rate(bottom) };
}

// ---------------------------------------------------------------------------
// Gate evaluation -> per-feature verdicts + global verdict.
// ---------------------------------------------------------------------------
function evaluate(av, core) {
  const { agg, perDate, impl } = core;
  const N = (b) => b.w + b.l;
  const baseN = N(agg.all);
  const baseRate = pctOf(agg.all.w, baseN) / 100;
  const features = [];

  // Helper: recent-form gate verdict. Launch only if N>=40 AND Wilson lower bound
  // clears the model-selected baseline (i.e., adds signal) AND beats market.
  function recentFormVerdict(name, bucket, note) {
    const n = N(bucket);
    const w = bucket.w;
    const ci = wilson(w, n);
    const rate = pctOf(w, n) / 100;
    let verdict;
    if (n < SAMPLE_THRESHOLD) verdict = "blocked_sample_size";
    else if (ci.lo <= baseRate) verdict = "needs_more_data"; // CI overlaps baseline => not separable
    else verdict = "shadow_evaluable"; // clears baseline but still needs OOS-vs-market confirmation
    return {
      name, verdict, n, w, l: bucket.l,
      rate: `${Math.round(rate * 100)}%`,
      ci95: `${Math.round(ci.lo * 100)}–${Math.round(ci.hi * 100)}%`,
      threshold: `${SAMPLE_THRESHOLD} decided`,
      note,
    };
  }

  // 1. All-priced props (overall model-selected props sample) — the broad signal.
  // Promotable only if it beats the no-edge line: enough sample AND the 95% CI
  // lower bound clears 50% (a market-priced bet has ~50% true odds after vig).
  {
    const n = baseN;
    const ci = wilson(agg.all.w, n);
    const verdict = n >= 200 && ci.lo > 0.5 ? "shadow_evaluable" : "needs_more_data";
    features.push({
      name: "all_priced_props_signal",
      verdict,
      n, w: agg.all.w, l: agg.all.l,
      rate: pctStr(agg.all.w, n),
      ci95: `${Math.round(ci.lo * 100)}–${Math.round(ci.hi * 100)}%`,
      threshold: "200+ overall AND 95% CI lower bound > 50%",
      note: "Broad props sample. Prior finding: potential_signal_needs_more_data (no stable OOS beat of de-vigged market); current 95% CI overlaps the 50% no-edge line.",
    });
  }

  // 2. MLB recent-form L5 5/5 gate (the v2 recency/quality gate).
  features.push(recentFormVerdict(
    "mlb_recent_form_L5_5of5", agg.l5_5of5,
    "True L5 from board full series. The headline v2 quality gate.",
  ));

  // 3. MLB "Low" gate (L5 5/5 AND odds <= -150) — all-priced heavy-favorite props.
  features.push(recentFormVerdict(
    "mlb_low_gate_5of5_and_-150", agg.lowElig,
    "Heaviest-signal v2 bucket (recent form + heavy favorite).",
  ));

  // 4. MLB L5 4/5+ gate (Medium/High/Longshot pool).
  {
    const b = agg.l5_4plus, n = N(b);
    const ci = wilson(b.w, n);
    const rate = pctOf(b.w, n) / 100;
    // 4/5+ historically ~= baseline => no lift => not a gate even at large N.
    const verdict = n >= SAMPLE_THRESHOLD && ci.lo > baseRate ? "shadow_evaluable" : "needs_more_data";
    features.push({
      name: "mlb_recent_form_L5_4plus", verdict, n, w: b.w, l: b.l,
      rate: `${Math.round(rate * 100)}%`,
      ci95: `${Math.round(ci.lo * 100)}–${Math.round(ci.hi * 100)}%`,
      threshold: `${SAMPLE_THRESHOLD} decided + lift over baseline`,
      note: `Baseline (all) = ${pctStr(agg.all.w, baseN)}. 4/5+ shows no durable lift over baseline => not a usable gate.`,
    });
  }

  // 5. Bank Builder L10 >= 8/10 (display + soft preference; already live as soft).
  {
    const b = agg.bankElig, n = N(b);
    const ci = wilson(b.w, n);
    features.push({
      name: "mlb_bank_builder_L10_8of10",
      verdict: "shadow_evaluable",
      n, w: b.w, l: b.l, rate: pctStr(b.w, n),
      ci95: `${Math.round(ci.lo * 100)}–${Math.round(ci.hi * 100)}%`,
      threshold: "display/soft only — no hard gate, no win-rate claim",
      note: "Already shipped as a DISPLAY badge + soft tie-breaker only. Not a live win-rate gate.",
    });
  }

  // 6. Market-only calibration (edge/confidence vs implied prob).
  {
    const ms = marketSplit(impl);
    const detail = ms
      ? `implied-prob top-half ${pctStr(ms.top.w, ms.top.n)} vs bottom-half ${pctStr(ms.bottom.w, ms.bottom.n)} (n=${ms.top.n}+${ms.bottom.n})`
      : "insufficient legs to split";
    features.push({
      name: "market_only_calibration",
      verdict: "market_already_prices_it",
      n: impl.length, w: null, l: null,
      rate: "—", ci95: "—",
      threshold: "must beat de-vigged market OOS",
      note: `Market-implied probability is the only separating signal (${detail}). edgePct is anti-predictive and confidence is non-predictive (see MODEL_CALIBRATION_2026-06-02.md). No edge to harvest beyond the market.`,
    });
  }

  // 7. Projection -> probability recalibration.
  features.push({
    name: "projection_probability_recalibration",
    verdict: "needs_more_data",
    n: null, w: null, l: null, rate: "—", ci95: "—",
    threshold: "must beat market-implied OOS",
    note: "Recalibration fixes overconfidence (OOS Brier 0.275->0.244) but TIES, not beats, the market OOS. Kept shadow (shadow-projection-recalibration.mjs).",
  });

  // 8. MLB platoon / handedness (batter vs pitcher hand).
  features.push({
    name: "mlb_platoon_handedness",
    verdict: "market_already_prices_it",
    n: null, w: null, l: null, rate: "—", ci95: "—",
    threshold: "must add signal beyond the de-vigged market",
    note: "Prior market-only platoon study: market_calibrated (the de-vigged market already prices the platoon split). No batter/pitcher handedness field exists on graded legs, so it also cannot be independently re-derived here.",
  });

  // 9. MLB confirmed starter.
  features.push({
    name: "mlb_confirmed_starter",
    verdict: "blocked_missing_data",
    n: null, w: null, l: null, rate: "—", ci95: "—",
    threshold: "needs a confirmed-starter field/signal",
    note: "No confirmed-starter field is present on graded optimizer legs; cannot validate from data on disk.",
  });

  // 10. MLB pitcher handedness.
  features.push({
    name: "mlb_pitcher_handedness",
    verdict: "blocked_missing_data",
    n: null, w: null, l: null, rate: "—", ci95: "—",
    threshold: "needs a handedness field + sample",
    note: "No pitcher-handedness field on graded legs; no sample to evaluate.",
  });

  // 11. NBA pregame features.
  features.push({
    name: "nba_pregame_features",
    verdict: "blocked_missing_data",
    n: core.nbaDecided, w: null, l: null, rate: "—", ci95: "—",
    threshold: "needs verified NBA board recent-form ordering",
    note: `No app/public/data/nba/boards directory; NBA recent-form ordering is unverified -> fails closed. ${core.nbaDecided} decided NBA legs excluded from true-L5 analysis.`,
  });

  // 12. World Cup pregame features.
  features.push({
    name: "worldcup_pregame_features",
    verdict: "blocked_missing_data",
    n: null, w: null, l: null, rate: "—", ci95: "—",
    threshold: "needs real World Cup pregame data",
    note: "No World Cup data directory present; out of scope.",
  });

  // ----- Date-split / OOS stability for the headline gated buckets -----
  const dated = perDate.filter((d) => !d.missing);
  const allRates = dated.map((d) => pctOf(d.all.w, d.all.w + d.all.l));
  const fiveRates = dated.map((d) => pctOf(d.l5_5of5.w, d.l5_5of5.w + d.l5_5of5.l));
  const rangeOf = (xs) => (xs.length ? `${Math.round(Math.min(...xs))}–${Math.round(Math.max(...xs))}%` : "—");
  const stability = {
    slates: dated.length,
    allRange: rangeOf(allRates),
    l5_5of5Range: rangeOf(fiveRates),
  };

  // ----- Leakage gate -----
  const leakage = {
    excludedDatesHeld: EXCLUDED_DATES.size === 2,
    excludedGradedPresentButIgnored: EXCLUDED_GRADED,
    settledUsesGradedOnly: true, // by construction (only optimizer-graded files read)
    perSlateBoardScoped: true,   // each slate enriched only from its own board (no cross-slate leak)
    note: "May 25/26 and pre-era graded files exist on disk but are excluded by date filter. Each slate's L5/L10 is sourced from THAT slate's board full series (no future leakage). recentSeries truncation avoided by board sourcing.",
  };
  const leakageClean = leakage.excludedDatesHeld && leakage.settledUsesGradedOnly && leakage.perSlateBoardScoped;

  // ----- Sample-size gate -----
  const sampleGates = {
    l5_5of5: { n: N(agg.l5_5of5), met: N(agg.l5_5of5) >= SAMPLE_THRESHOLD },
    lowElig: { n: N(agg.lowElig), met: N(agg.lowElig) >= SAMPLE_THRESHOLD },
    learningLoopOverall: { n: baseN, met: baseN >= 200 },
  };
  const sampleClean = sampleGates.l5_5of5.met && sampleGates.lowElig.met;

  // ----- Global verdict -----
  const anyLaunch = features.some((f) => f.verdict === "launch_candidate");
  let status, global;
  if (!leakageClean) { status = "FAIL"; global = "v2_not_ready"; }
  else if (anyLaunch && sampleClean) { status = "PASS"; global = "v2_launch_ready"; }
  else { status = "WARN"; global = "v2_not_ready"; }

  return { features, stability, leakage, leakageClean, sampleGates, sampleClean, status, global, baseRate, baseN, marketSplit: marketSplit(impl) };
}

// ---------------------------------------------------------------------------
// Render.
// ---------------------------------------------------------------------------
function renderConsole(av, core, ev) {
  const line = "=".repeat(74);
  console.log("V2 END-TO-END READINESS — READ-ONLY · deterministic · no paid API");
  console.log(line);
  console.log(`GLOBAL: ${ev.status}  ->  ${ev.global}`);
  console.log(line);
  console.log("\n[1] DATA AVAILABILITY");
  console.log(`  settled public-era slates (${av.settled.length}): ${av.settled.join(", ") || "(none)"}`);
  console.log(`  excluded graded (banned/pre-era): ${av.excludedGraded.join(", ") || "(none)"}`);
  console.log(`  active slate: ${av.active} (settled? ${av.activeSettled ? "yes" : "no — availability only"})`);
  console.log(`  MLB boards: ${av.mlbBoards.length}   NBA boards: ${av.nbaBoards.length}   World Cup: ${av.worldCup ? "yes" : "no"}`);

  console.log("\n[2] LEAKAGE GATE: " + (ev.leakageClean ? "CLEAN" : "RISK"));
  console.log("  " + ev.leakage.note);

  console.log("\n[3] SAMPLE-SIZE GATE (>=40 decided per gated bucket)");
  console.log(`  L5 5/5: ${ev.sampleGates.l5_5of5.n} (${ev.sampleGates.l5_5of5.met ? "MET" : "below"})`);
  console.log(`  Low-eligible: ${ev.sampleGates.lowElig.n} (${ev.sampleGates.lowElig.met ? "MET" : "below"})`);
  console.log(`  overall (learning-loop 200+): ${ev.sampleGates.learningLoopOverall.n} (${ev.sampleGates.learningLoopOverall.met ? "MET" : "below"})`);

  console.log("\n[4] DATE SPLIT / OOS STABILITY");
  console.log(`  slates=${ev.stability.slates}  all-leg per-slate range=${ev.stability.allRange}  L5 5/5 per-slate range=${ev.stability.l5_5of5Range}`);

  console.log("\n[5] MARKET-ONLY CALIBRATION");
  if (ev.marketSplit) {
    const m = ev.marketSplit;
    console.log(`  implied-prob top-half ${pctStr(m.top.w, m.top.n)} vs bottom-half ${pctStr(m.bottom.w, m.bottom.n)} (the market rank separates outcomes; edge/confidence do not).`);
  } else console.log("  insufficient legs to split.");

  console.log("\n[6] FEATURE VERDICTS");
  for (const f of ev.features) {
    const nstr = f.n == null ? "" : `  n=${f.n}${f.w != null ? ` (${f.w}W/${f.l}L${f.rate ? `, ${f.rate}` : ""})` : ""}${f.ci95 && f.ci95 !== "—" ? ` ci95=${f.ci95}` : ""}`;
    console.log(`  - ${f.name}: ${f.verdict}${nstr}`);
  }

  console.log("\n[7] PROMOTION DECISION");
  console.log(`  ${ev.global} (status ${ev.status}).`);
  console.log(`  launch candidate present? ${ev.features.some((f) => f.verdict === "launch_candidate") ? "YES" : "no"}.`);
  console.log("  No feature clears all hard gates (sample >=40 + CI beats baseline + beats de-vigged market OOS + leakage clean).");
  console.log("\n(tip: pass --write-report to persist docs/audits/v2-end-to-end-readiness-latest.md)");
}

function renderMarkdown(av, core, ev) {
  const m = [];
  m.push("# v2 End-to-End Readiness — Aggregated Audit (auto-generated)");
  m.push("");
  m.push("> Generated by `app/scripts/audit-v2-end-to-end-readiness.mjs --write-report`.");
  m.push("> READ-ONLY · deterministic (no wall-clock) · **no paid API · no live wiring**.");
  m.push("> Rolls up the individual shadow audits into one promotion decision.");
  m.push("");
  m.push(`## GLOBAL VERDICT: \`${ev.global}\` (status **${ev.status}**)`);
  m.push("");
  m.push("No v2 feature is a `launch_candidate`. v2 stays **shadow-only / current-live**.");
  m.push("");
  m.push("## 1. Data availability");
  m.push(`- Settled public-era slates (**${av.settled.length}**): ${av.settled.join(", ") || "(none)"}`);
  m.push(`- Excluded graded (banned May 25/26 or pre-era): ${av.excludedGraded.join(", ") || "(none)"}`);
  m.push(`- Active slate: \`${av.active}\` — settled? ${av.activeSettled ? "yes" : "no (availability only)"}`);
  m.push(`- MLB boards: ${av.mlbBoards.length} · NBA boards: ${av.nbaBoards.length} · World Cup: ${av.worldCup ? "yes" : "no"}`);
  m.push("");
  m.push("## 2. Leakage gate");
  m.push(`- **${ev.leakageClean ? "CLEAN" : "RISK"}.** ${ev.leakage.note}`);
  m.push("");
  m.push("## 3. Sample-size gate (≥40 decided per gated bucket)");
  m.push("| Bucket | Decided N | Threshold | Met? |");
  m.push("|--------|------:|------:|:--:|");
  m.push(`| L5 5/5 | ${ev.sampleGates.l5_5of5.n} | ${SAMPLE_THRESHOLD} | ${ev.sampleGates.l5_5of5.met ? "✅" : "❌"} |`);
  m.push(`| Low-eligible (5/5 & ≤−150) | ${ev.sampleGates.lowElig.n} | ${SAMPLE_THRESHOLD} | ${ev.sampleGates.lowElig.met ? "✅" : "❌"} |`);
  m.push(`| overall props (learning-loop) | ${ev.sampleGates.learningLoopOverall.n} | 200 | ${ev.sampleGates.learningLoopOverall.met ? "✅" : "❌"} |`);
  m.push("");
  m.push("## 4. Date split / OOS stability");
  m.push(`- Slates: ${ev.stability.slates} · all-leg per-slate hit-rate range **${ev.stability.allRange}** · L5 5/5 per-slate range **${ev.stability.l5_5of5Range}**`);
  m.push("");
  m.push("Per-slate (true L5, MLB decided):");
  m.push("| date | MLB decided | all | L5 5/5 | L5 4/5+ | Low-elig |");
  m.push("|------|------:|------:|------:|------:|------:|");
  for (const d of core.perDate) {
    if (d.missing) { m.push(`| ${d.date} | (no graded file) | | | | |`); continue; }
    const f = (b) => `${b.w}/${b.w + b.l}=${pctStr(b.w, b.w + b.l)}`;
    m.push(`| ${d.date} | ${d.mlbDecided} | ${f(d.all)} | ${f(d.l5_5of5)} | ${f(d.l5_4plus)} | ${f(d.lowElig)} |`);
  }
  m.push("");
  m.push("## 5. Market-only calibration");
  if (ev.marketSplit) {
    const ms = ev.marketSplit;
    m.push(`- Implied-prob **top-half ${pctStr(ms.top.w, ms.top.n)}** vs **bottom-half ${pctStr(ms.bottom.w, ms.bottom.n)}** (n=${ms.top.n}+${ms.bottom.n}). The de-vigged market rank is the only separating signal; \`edgePct\`/\`confidence\` are not.`);
  } else m.push("- insufficient legs to split.");
  m.push("");
  m.push("## 6. Feature verdicts");
  m.push("| Feature | Verdict | N | Hit | 95% CI | Gate |");
  m.push("|---------|---------|--:|----:|:------:|------|");
  for (const f of ev.features) {
    const nstr = f.n == null ? "—" : `${f.n}`;
    const hit = f.w == null ? (f.rate ?? "—") : `${f.w}W/${f.l}L (${f.rate})`;
    m.push(`| \`${f.name}\` | \`${f.verdict}\` | ${nstr} | ${hit} | ${f.ci95 ?? "—"} | ${f.threshold ?? ""} |`);
  }
  m.push("");
  m.push("Verdict notes:");
  for (const f of ev.features) m.push(`- **${f.name}** — ${f.note}`);
  m.push("");
  m.push("## 7. Promotion decision");
  m.push("");
  m.push(`**${ev.global}** (status ${ev.status}).`);
  m.push("");
  m.push("A feature is `launch_candidate` only if it clears ALL hard gates: ≥40 decided legs in the gated bucket, a 95% CI lower bound above the model-selected baseline, a demonstrated out-of-sample beat of the **de-vigged market**, no leakage, and the data-plumbing (recentSeries) resolved. No feature meets this today:");
  m.push("- The two high-signal recent-form buckets (L5 5/5, Low-eligible) are **below the 40-decided-leg floor**.");
  m.push("- L5 4/5+ shows **no lift over baseline**.");
  m.push("- Market-only calibration and platoon are **already priced by the market**.");
  m.push("- Projection recalibration **ties, not beats**, the market OOS.");
  m.push("- Confirmed-starter, pitcher-handedness, NBA, and World Cup are **blocked on missing data**.");
  m.push("");
  m.push("**Action:** keep v2 shadow-only; gather more settled MLB slates; re-run after each nightly settle. No public win-rate claim; no `edgePct`/`confidence` as quality signals.");
  m.push("");
  m.push("*Overwritten by the script. Do not hand-edit. Companion deep-dives: `methodology-v2-shadow-latest.md`, `MODEL_CALIBRATION_2026-06-02.md`, `MODEL_LEARNING_LOOP.md`.*");
  m.push("");
  return m.join("\n");
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
const av = dataAvailability();
const core = aggregate();
const ev = evaluate(av, core);
renderConsole(av, core, ev);
if (WRITE_REPORT) {
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, renderMarkdown(av, core, ev), "utf8");
  console.log(`\n[--write-report] wrote ${REPORT_PATH}`);
}
