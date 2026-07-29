/**
 * SPRINT 048 — the calibration layer must not become a performance claim.
 *
 * WHY THIS EXISTS
 * Calibration is the most misrepresentable thing this repository has ever shipped. The measured result
 * is narrow and easy to overstate by accident: Platt improved out-of-sample Brier by 0.0104 and moved
 * the mean stated probability onto the observed rate — and the calibrated model STILL scores worse
 * than the de-vigged market (0.2455 vs 0.2413).
 *
 * "Our probabilities are now accurate" is true. "Our model is now accurate" is not. One word apart,
 * and only one of them is supported. So this guards the boundary in three ways:
 *
 *   1. the layers stay separate and `raw` is never overwritten;
 *   2. the disclosure sentence always states the limitation alongside the benefit;
 *   3. no source file in the calibration area may contain market-beating language.
 *
 * Run: npx tsx --test src/lib/mlb/calibration/calibration-claims.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  applyPlatt,
  buildProbabilityLayers,
  calibrationDisclosure,
  deVigTwoWay,
} from "./probability-layers.ts";

/** The real fitted parameters from the Sprint 047 backtest. */
const PLATT = { a: 0.5710847015699214, b: -0.22247426879950416, trainRows: 14938 };

const PROVENANCE = {
  method: "platt",
  trainedThrough: "2026-06-25",
  trainRows: 14938,
  measuredBrierImprovement: 0.0104,
  stillBehindMarket: true,
};

// ── the layers stay apart ──────────────────────────────────────────────────────

test("raw is never overwritten by calibration", () => {
  const l = buildProbabilityLayers({
    rawProbability: 0.75, side: "over", impliedOver: 0.55, impliedUnder: 0.52,
    calibrator: PLATT, provenance: PROVENANCE,
  });
  assert.equal(l.raw, 0.75, "raw must survive verbatim — it is the evidence");
  assert.notEqual(l.calibrated, l.raw, "the calibrator must actually change this value");
  assert.equal(l.displayedSource, "calibrated");
});

test("calibration pulls an overconfident probability toward the middle", () => {
  // The measured defect: the model says 75%, reality is nearer 50%.
  const l = buildProbabilityLayers({
    rawProbability: 0.75, side: "over", calibrator: PLATT, provenance: PROVENANCE,
  });
  assert.ok(l.calibrated < l.raw, `expected shrinkage, got ${l.calibrated} from ${l.raw}`);
  assert.ok(l.calibrated > 0.5, "but it must not overshoot past even money");
});

test("a low raw probability is pulled UP, not merely shrunk", () => {
  const l = buildProbabilityLayers({ rawProbability: 0.2, side: "over", calibrator: PLATT, provenance: PROVENANCE });
  assert.ok(l.calibrated > l.raw, `expected upward correction, got ${l.calibrated} from ${l.raw}`);
});

test("calibration is monotone — it must never reorder two predictions", () => {
  const probes = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];
  const mapped = probes.map((p) => applyPlatt(p, PLATT));
  for (let i = 1; i < mapped.length; i += 1) {
    assert.ok(mapped[i] > mapped[i - 1], `not monotone at ${probes[i]}: ${mapped}`);
  }
});

test("without a calibrator the displayed value is raw, and says so", () => {
  const l = buildProbabilityLayers({
    rawProbability: 0.75, side: "over",
    calibrator: null, provenance: { ...PROVENANCE, method: "none" },
  });
  assert.equal(l.calibrated, null);
  assert.equal(l.displayed, 0.75);
  assert.equal(l.displayedSource, "raw", "an uncalibrated number must not be presented as corrected");
});

test("the market layer is de-vigged, and absent when it cannot be", () => {
  const l = buildProbabilityLayers({
    rawProbability: 0.6, side: "over", impliedOver: 0.55, impliedUnder: 0.52,
    calibrator: PLATT, provenance: PROVENANCE,
  });
  assert.ok(Math.abs(l.market - 0.55 / 1.07) < 1e-9, "market must be normalised, not raw");

  const oneSided = buildProbabilityLayers({
    rawProbability: 0.6, side: "over", impliedOver: 0.55, impliedUnder: null,
    calibrator: PLATT, provenance: PROVENANCE,
  });
  assert.equal(oneSided.market, null, "a one-sided market cannot be de-vigged and must be null");
});

test("de-vigged probabilities sum to one and retain the overround", () => {
  const f = deVigTwoWay(0.55, 0.52);
  assert.ok(Math.abs(f.over + f.under - 1) < 1e-12);
  assert.ok(f.overround > 1, "the hold must be retained so the de-vig stays auditable");
});

test("calibration never produces an out-of-range probability", () => {
  for (const p of [0, 1e-12, 0.5, 1 - 1e-12, 1]) {
    const v = applyPlatt(p, PLATT);
    assert.ok(Number.isFinite(v) && v > 0 && v < 1, `applyPlatt(${p}) = ${v}`);
  }
});

// ── the claim ──────────────────────────────────────────────────────────────────

test("the disclosure states the limitation in the same breath as the benefit", () => {
  const text = calibrationDisclosure(PROVENANCE);
  assert.match(text, /more accurate/, "must state what calibration does");
  assert.match(text, /does not mean the model out-predicts/i, "must state what it does NOT do");
  assert.match(text, /14,938/, "must carry the sample size");
  assert.match(text, /2026-06-25/, "must carry the training cutoff");
});

test("the disclosure drops the market caveat only when the measurement supports it", () => {
  const ahead = calibrationDisclosure({ ...PROVENANCE, stillBehindMarket: false });
  assert.doesNotMatch(ahead, /does not mean the model out-predicts/i);
  // And it still never asserts superiority — absence of the caveat is not a claim.
  assert.doesNotMatch(ahead, /better than the (sportsbook|market)/i);
});

test("an uncalibrated disclosure admits it plainly", () => {
  const text = calibrationDisclosure({ ...PROVENANCE, method: "none" });
  assert.match(text, /have not been calibrated/i);
});

test("no file in the calibration area contains market-beating language", () => {
  // The banned list is deliberately broad. Every one of these has appeared in this codebase before and
  // been removed by an earlier sprint; the cost of a false positive is renaming a comment.
  const BANNED = [
    /\bbeat(s|ing)? the (market|sportsbook|book)\b/i,
    /\boutperform(s|ing)? the (market|sportsbook|book)\b/i,
    /\bedge\b/i,
    /\bguarantee(d|s)?\b/i,
    /\bprofitab(le|ility)\b/i,
    /\block\b/i,
    /\bsure thing\b/i,
    /\bproven (advantage|superiority)\b/i,
  ];
  const dir = path.dirname(new URL(import.meta.url).pathname);
  const failures = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(ts|tsx|mjs)$/.test(f)) continue;
    if (f === "calibration-claims.test.mjs") continue; // this file names the banned terms on purpose
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    for (const re of BANNED) {
      const m = src.match(re);
      if (m) failures.push(`${f}: "${m[0]}"`);
    }
  }
  assert.deepEqual(failures, [], `market-beating language in the calibration layer:\n  ${failures.join("\n  ")}`);
});

test("the guard would actually catch a violation", () => {
  // A banned-word scan that matches nothing passes forever. Prove the pattern has teeth.
  const sample = "Our calibrated model now beats the market on every scoring rule.";
  assert.match(sample, /\bbeat(s|ing)? the (market|sportsbook|book)\b/i);
});
