import { test } from "node:test";
import assert from "node:assert/strict";
import { probabilityCalibration } from "./probability-calibration.mjs";
test("calibration conserves endpoints, decile boundaries and empty bins", () => {
  const r = probabilityCalibration([{ p: 0, hit: 0 }, { p: 1, hit: 1 }, { p: 0.1, hit: 1 }]);
  assert.equal(r.bins.length, 10);
  assert.equal(r.bins.reduce((s, b) => s + b.n, 0), 3);
  assert.equal(r.bins[0].n, 1); assert.equal(r.bins[1].n, 1); assert.equal(r.bins[9].n, 1);
  assert.equal(r.bins[2].observedRate, null);
  assert.ok(Math.abs(r.ece - 0.3) < 1e-12);
  assert.equal(probabilityCalibration([]).ece, null);
});
test("invalid probability and outcomes cannot make a calibration receipt", () => {
  for (const p of [-0.1, 1.1, NaN]) assert.throws(() => probabilityCalibration([{ p, hit: 1 }]));
  assert.throws(() => probabilityCalibration([{ p: 0.5, hit: 2 }]));
});
