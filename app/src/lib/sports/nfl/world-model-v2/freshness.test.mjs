/**
 * Refresh-noise guard: a forecast regeneration that only jitters the simulated 80% range must not re-simulate a game.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { stableHeads, HEAD_SIGMA_TOLERANCE } from "./freshness.mjs";

const prev = { mMean: 0, mSigma: 13.2652, tMean: 43, tSigma: 13.2652 };

test("sampling jitter in the 80% range keeps the previous heads (01:00Z 2026-10-09 case)", () => {
  const r = stableHeads(prev, { mMean: 0, mSigma: 13.6553, tMean: 43, tSigma: 13.2652 });
  assert.equal(r.reused, true);
  assert.deepEqual(r.heads, prev);
});

test("a moved median or a spread change beyond the tolerance is a new input", () => {
  assert.equal(stableHeads(prev, { ...prev, mMean: 1 }).reused, false, "median margin moved");
  assert.equal(stableHeads(prev, { ...prev, tMean: 44 }).reused, false, "median total moved");
  assert.equal(stableHeads(prev, { ...prev, tSigma: prev.tSigma + HEAD_SIGMA_TOLERANCE }).reused, false, "a real spread change");
  assert.equal(stableHeads(null, prev).reused, false, "no previous run: simulate");
});
