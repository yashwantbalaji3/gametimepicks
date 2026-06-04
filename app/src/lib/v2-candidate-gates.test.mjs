/**
 * Tests for v2-candidate-gates — proves `launch_candidate` cannot be emitted
 * from a naive 95% CI alone, and that multiple-comparisons correction, date
 * stability, and single-date overdependence each block a launch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyCandidate,
  correctedZ,
  wilson,
  DEFAULT_GATES,
} from "./v2-candidate-gates.ts";

/** Build a CandidateInput from per-date (n,w) cells with a uniform de-vig. */
function build(dates, devig) {
  const n = dates.reduce((a, d) => a + d.n, 0);
  const w = dates.reduce((a, d) => a + d.w, 0);
  const sumDevig = n * devig;
  const varDevig = n * devig * (1 - devig);
  return {
    n,
    w,
    sumDevig,
    varDevig,
    perDate: dates.map((d, i) => ({
      date: `d${i}`,
      n: d.n,
      w: d.w,
      sumDevig: d.n * devig,
    })),
    edgeOrConfidenceDriven: false,
    leakageClean: true,
  };
}
const cfg = (overallN, over = {}) => ({
  ...DEFAULT_GATES,
  overallN,
  numTests: 24,
  ...over,
});

test("correctedZ widens with more tests (Bonferroni)", () => {
  assert.ok(correctedZ(1) > 1.9 && correctedZ(1) < 2.0); // ~1.96
  assert.ok(correctedZ(24) > 2.9); // ~3.08
  assert.ok(correctedZ(24) > correctedZ(1));
});

test("real MLB Low gate: naive CI passes but corrected fails -> shadow_watchlist, NOT launch", () => {
  // Actual 7-slate Low-gate per-date data (L5 5/5 & odds<=-150), de-vig ~0.62.
  const input = build(
    [
      { n: 11, w: 6 },
      { n: 10, w: 7 },
      { n: 16, w: 12 },
      { n: 21, w: 16 },
      { n: 11, w: 4 },
      { n: 25, w: 21 },
      { n: 35, w: 27 },
    ],
    0.62,
  );
  const r = classifyCandidate(input, cfg(3356));
  assert.equal(r.n, 129);
  assert.equal(r.w, 93);
  assert.equal(r.beatsNaive, true, "naive 95% lower should beat de-vig");
  assert.equal(r.beatsCorrected, false, "corrected CI lower should NOT beat de-vig");
  assert.notEqual(r.verdict, "launch_candidate");
  assert.equal(r.verdict, "shadow_watchlist");
  assert.ok(r.failedGates.includes("corrected_ci"));
});

test("strong, large, consistent bucket -> launch_candidate (all gates pass)", () => {
  const input = build(
    Array.from({ length: 8 }, () => ({ n: 50, w: 30 })), // 60% vs de-vig 50%
    0.5,
  );
  const r = classifyCandidate(input, cfg(400));
  assert.equal(r.beatsNaive, true);
  assert.equal(r.beatsCorrected, true);
  assert.ok(r.pAdj < 0.05, "adjusted p should pass");
  assert.equal(r.stable, true);
  assert.equal(r.singleDateDependent, false);
  assert.equal(r.verdict, "launch_candidate");
  assert.deepEqual(r.failedGates, []);
});

test("date volatility blocks launch (overall strong but only 2/8 dates positive)", () => {
  const input = build(
    [
      { n: 40, w: 20 }, // 50% — not positive
      { n: 40, w: 20 },
      { n: 40, w: 20 },
      { n: 40, w: 20 },
      { n: 40, w: 20 },
      { n: 40, w: 20 },
      { n: 80, w: 60 }, // 75% — positive
      { n: 80, w: 60 }, // 75% — positive
    ],
    0.5,
  );
  const r = classifyCandidate(input, cfg(400));
  assert.equal(r.beatsNaive, true);
  assert.equal(r.stable, false, "only 2/8 dates positive -> unstable");
  assert.notEqual(r.verdict, "launch_candidate");
  assert.equal(r.verdict, "shadow_watchlist");
  assert.ok(r.failedGates.includes("date_stability"));
});

test("single-date overdependence blocks launch", () => {
  // one monster date carries the edge; removing it breaks the naive edge.
  const input = build(
    [
      { n: 60, w: 58 }, // 97% — monster
      { n: 40, w: 21 }, // 52.5%
      { n: 40, w: 21 },
      { n: 40, w: 21 },
    ],
    0.5,
  );
  const r = classifyCandidate(input, cfg(400));
  assert.equal(r.beatsNaive, true);
  assert.equal(r.singleDateDependent, true, "removing best date breaks edge");
  assert.notEqual(r.verdict, "launch_candidate");
  assert.equal(r.verdict, "shadow_watchlist");
  assert.ok(r.failedGates.includes("single_date_overdependence"));
});

test("edge/confidence-driven segment can never launch", () => {
  const input = {
    ...build(Array.from({ length: 8 }, () => ({ n: 50, w: 30 })), 0.5),
    edgeOrConfidenceDriven: true,
  };
  const r = classifyCandidate(input, cfg(400));
  assert.equal(r.beatsNaive, true);
  assert.notEqual(r.verdict, "launch_candidate");
  assert.ok(r.failedGates.includes("edge_or_confidence_driven"));
});

test("below bucket-N floor -> blocked_sample_size", () => {
  const input = build([{ n: 10, w: 9 }, { n: 10, w: 9 }], 0.5);
  const r = classifyCandidate(input, cfg(400));
  assert.equal(r.verdict, "blocked_sample_size");
});

test("win rate within margin of de-vig -> market_already_prices_it", () => {
  const input = build(
    [
      { n: 50, w: 25 },
      { n: 50, w: 26 },
      { n: 50, w: 25 },
      { n: 50, w: 25 },
    ],
    0.5,
  ); // ~50.5% vs 50%
  const r = classifyCandidate(input, cfg(400));
  assert.equal(r.beatsNaive, false);
  assert.equal(r.verdict, "market_already_prices_it");
});

test("clearly below de-vig -> rejected", () => {
  const input = build(
    [
      { n: 50, w: 20 },
      { n: 50, w: 21 },
      { n: 50, w: 20 },
      { n: 50, w: 20 },
    ],
    0.55,
  ); // ~40% vs 55%
  const r = classifyCandidate(input, cfg(400));
  assert.equal(r.verdict, "rejected");
});

test("overall-N floor blocks launch even if bucket is strong", () => {
  const input = build(Array.from({ length: 8 }, () => ({ n: 50, w: 30 })), 0.5);
  const r = classifyCandidate(input, cfg(100)); // overallN below 250
  assert.notEqual(r.verdict, "launch_candidate");
  assert.ok(r.failedGates.includes("overall_n"));
});

test("leakage failure is a hard block", () => {
  const input = {
    ...build(Array.from({ length: 8 }, () => ({ n: 50, w: 30 })), 0.5),
    leakageClean: false,
  };
  const r = classifyCandidate(input, cfg(400));
  assert.equal(r.verdict, "blocked_leakage_risk");
});

test("wilson interval is ordered and bounded", () => {
  const ci = wilson(93, 129, 1.96);
  assert.ok(ci.lo >= 0 && ci.hi <= 1 && ci.lo < ci.hi);
});
