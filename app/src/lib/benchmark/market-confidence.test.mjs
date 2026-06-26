/**
 * Tests for the Market Confidence Index. Deterministic. Verifies: only-available-inputs are averaged
 * (missing inputs disclosed, never treated as 0), movement nudges but doesn't dominate, and the honest
 * one-snapshot case (movement + calibration excluded).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { marketConfidence, cardConfidence } from "./market-confidence.ts";

test("a strong, market-agreeing leg scores high; only available inputs are used", () => {
  const m = marketConfidence({ modelProb: 0.8, marketProb: 0.78 });
  assert.ok(m.score >= 60, `strong leg scores >=60, got ${m.score}`);
  assert.deepEqual(m.inputsUsed, ["probStrength", "marketAgreement"]);
  assert.match(m.note, /pending data: movement, calibration/);
  assert.equal(m.components.movement, null);
  assert.equal(m.components.calibration, null);
});

test("a coin-flip leg scores low (probStrength ~0)", () => {
  const m = marketConfidence({ modelProb: 0.5, marketProb: 0.5 });
  assert.ok(m.score < 40, `coin-flip scores low, got ${m.score}`);
  assert.equal(m.band, "low");
});

test("model disagreeing with the market lowers confidence vs agreeing", () => {
  const agree = marketConfidence({ modelProb: 0.7, marketProb: 0.7 });
  const disagree = marketConfidence({ modelProb: 0.7, marketProb: 0.55 });
  assert.ok(agree.score > disagree.score, "agreement scores higher than disagreement");
});

test("shortening line nudges confidence up; drifting nudges down (needs >=2 captures)", () => {
  const base = { modelProb: 0.65, marketProb: 0.65 };
  const shortening = marketConfidence({ ...base, movement: { steps: 3, impliedProbDelta: 0.05, direction: "shortening" } });
  const drifting = marketConfidence({ ...base, movement: { steps: 3, impliedProbDelta: -0.05, direction: "drifting" } });
  const flat = marketConfidence(base);
  assert.ok(shortening.score > flat.score, "shortening lifts confidence");
  assert.ok(drifting.score < flat.score, "drifting lowers confidence");
  // movement never dominates: a 5pp move shouldn't swing the score more than its 0.20 weight allows.
  assert.ok(Math.abs(shortening.score - drifting.score) <= 20, "movement nudges, never dominates");
});

test("a single capture does NOT count as movement (honest opening-only)", () => {
  const m = marketConfidence({ modelProb: 0.65, marketProb: 0.65, movement: { steps: 1, impliedProbDelta: 0, direction: "flat" } });
  assert.equal(m.components.movement, null, "1 capture → movement excluded");
  assert.match(m.note, /pending data:.*movement/);
});

test("calibration is included only when provided (never fabricated)", () => {
  const without = marketConfidence({ modelProb: 0.7, marketProb: 0.7 });
  const withCal = marketConfidence({ modelProb: 0.7, marketProb: 0.7, historicalCalibration: 0.9 });
  assert.equal(without.components.calibration, null);
  assert.equal(withCal.components.calibration, 0.9);
  assert.ok(withCal.inputsUsed.includes("calibration"));
});

test("cardConfidence is the mean of leg MCIs", () => {
  const a = marketConfidence({ modelProb: 0.8, marketProb: 0.78 });
  const b = marketConfidence({ modelProb: 0.55, marketProb: 0.55 });
  assert.equal(cardConfidence([a, b]), Math.round((a.score + b.score) / 2));
  assert.equal(cardConfidence([]), 0);
});
