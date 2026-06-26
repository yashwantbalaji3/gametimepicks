/**
 * Tests for the model-learning calibration metrics. Deterministic; known closed-form values.
 * Confirms the honest-empty guarantee (no fabricated score) and the Brier/log-loss/ECE math.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { brierScore, logLoss, calibrationBins, summarize } from "./calibration.ts";

const approx = (a, b, eps = 1e-3) => Math.abs(a - b) < eps;

test("empty observations → n:0, null metrics (never fabricated)", () => {
  const s = summarize([]);
  assert.equal(s.n, 0);
  assert.equal(s.brier, null);
  assert.equal(s.logLoss, null);
  assert.equal(s.calibrationError, null);
  assert.deepEqual(s.bins, []);
  assert.equal(brierScore([]), null);
  assert.equal(logLoss([]), null);
});

test("Brier score matches hand calculation", () => {
  // preds 0.9 (hit), 0.2 (miss): (0.9-1)^2=0.01, (0.2-0)^2=0.04 → mean 0.025
  const b = brierScore([{ predictedProb: 0.9, outcome: 1 }, { predictedProb: 0.2, outcome: 0 }]);
  assert.ok(approx(b, 0.025), `got ${b}`);
});

test("a perfectly-confident-correct model scores ~0 on both metrics", () => {
  const obs = [{ predictedProb: 1, outcome: 1 }, { predictedProb: 0, outcome: 0 }];
  assert.ok(brierScore(obs) < 1e-6);
  assert.ok(logLoss(obs) < 1e-6, "clamped, near zero");
});

test("log loss punishes confident wrong predictions hard", () => {
  const good = logLoss([{ predictedProb: 0.9, outcome: 1 }]);
  const bad = logLoss([{ predictedProb: 0.1, outcome: 1 }]);
  assert.ok(bad > good, "confident-wrong has higher log loss");
});

test("calibration bins report empirical vs predicted gap", () => {
  // four 0.5 preds, two hit → empirical 0.5, gap 0 in the 0.5 bin
  const bins = calibrationBins([
    { predictedProb: 0.5, outcome: 1 }, { predictedProb: 0.5, outcome: 0 },
    { predictedProb: 0.5, outcome: 1 }, { predictedProb: 0.5, outcome: 0 },
  ], 10);
  const bin = bins.find((b) => b.n > 0);
  assert.equal(bin.n, 4);
  assert.ok(approx(bin.empirical, 0.5));
  assert.ok(approx(bin.gap, 0));
});

test("summarize computes ECE weighted by bin population", () => {
  // overconfident: predicts 0.9 four times, only 2 hit (empirical 0.5) → |0.5-0.9| ≈ 0.4 ECE
  const s = summarize([
    { predictedProb: 0.9, outcome: 1 }, { predictedProb: 0.9, outcome: 0 },
    { predictedProb: 0.9, outcome: 1 }, { predictedProb: 0.9, outcome: 0 },
  ], 10);
  assert.equal(s.n, 4);
  assert.ok(approx(s.empiricalRate, 0.5));
  assert.ok(s.calibrationError > 0.35, `ECE ${s.calibrationError}`);
});
