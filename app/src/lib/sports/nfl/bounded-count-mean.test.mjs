import { test } from "node:test";
import assert from "node:assert/strict";
import { boundedCountProbabilities as probabilities, drawMeanPreservingBoundedCount as draw } from "./bounded-count-mean.mjs";

test("finite-count mean preserved throughout feasible range including high and boundary means", () => {
  for (const max of [0, 1, 3, 7, 20, 100]) for (const fraction of [0, 1e-8, 0.1, 0.5, 0.99, 1]) {
    const mean = max * fraction, p = probabilities(mean, max);
    assert.equal(p.length, max + 1);
    assert.ok(p.every(x => Number.isFinite(x) && x >= 0));
    assert.ok(Math.abs(p.reduce((s, x) => s + x, 0) - 1) < 1e-12);
    assert.ok(Math.abs(p.reduce((s, x, k) => s + x * k, 0) - mean) < 1e-9);
  }
});

test("rate-as-mean truncation has measurable downward bias; inversion removes it", () => {
  const weights = [1, 2, 2, 4 / 3];
  const oldMean = weights.reduce((s, w, k) => s + w * k, 0) / weights.reduce((s, w) => s + w, 0);
  assert.ok(oldMean < 1.6);
  assert.ok(Math.abs(probabilities(2, 3).reduce((s, p, k) => s + p * k, 0) - 2) < 1e-9);
});

test("endpoint draws and infeasible mean clipping obey scoring ceiling", () => {
  assert.equal(draw(() => 0, 0, 3), 0);
  assert.equal(draw(() => 0, 100, 3), 3);
  assert.equal(draw(() => 0.999999, 100, 3), 3);
  for (const args of [[NaN, 3], [-1, 3], [1, 1.5], [1, -1]]) assert.throws(() => probabilities(...args));
  assert.throws(() => draw(() => 1, 2, 3));
});
