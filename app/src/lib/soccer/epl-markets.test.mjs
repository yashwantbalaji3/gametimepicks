/**
 * MATCH_RESULT_1X2 — the draw is a real outcome, and a two-way payload is never one.
 *
 * Run: npx tsx --test src/lib/soccer/epl-markets.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  MATCH_RESULT_OUTCOMES,
  devigThreeWay,
  readMatchResult1x2,
} from "./epl-markets.ts";

const TOL = 1e-12;

test("no-vig probabilities sum to one", () => {
  for (const quote of [
    { HOME: -125, DRAW: 260, AWAY: 340 },
    { HOME: 150, DRAW: 240, AWAY: 175 },
    { HOME: -400, DRAW: 480, AWAY: 900 },
    { HOME: 100, DRAW: 100, AWAY: 100 },
  ]) {
    const r = readMatchResult1x2(quote);
    assert.equal(r.status, "OK", JSON.stringify(quote));
    const sum = MATCH_RESULT_OUTCOMES.reduce((acc, o) => acc + r.noVig[o], 0);
    assert.ok(Math.abs(sum - 1) < TOL, `sum ${sum} for ${JSON.stringify(quote)}`);
    for (const o of MATCH_RESULT_OUTCOMES) assert.ok(r.noVig[o] > 0 && r.noVig[o] < 1);
  }
});

test("the overround is measured from the raw prices, and exceeds 1 on a real three-way market", () => {
  const r = readMatchResult1x2({ HOME: -125, DRAW: 260, AWAY: 340 });
  assert.equal(r.status, "OK");
  const rawSum = MATCH_RESULT_OUTCOMES.reduce((acc, o) => acc + r.rawImplied[o], 0);
  assert.ok(Math.abs(r.overround - rawSum) < TOL);
  assert.ok(r.overround > 1, `overround ${r.overround} should carry the book's margin`);
  // De-vig only rescales: the ORDER of the three outcomes is unchanged.
  const byRaw = [...MATCH_RESULT_OUTCOMES].sort((a, b) => r.rawImplied[b] - r.rawImplied[a]);
  const byNoVig = [...MATCH_RESULT_OUTCOMES].sort((a, b) => r.noVig[b] - r.noVig[a]);
  assert.deepEqual(byNoVig, byRaw);
});

test("a missing draw fails closed — a two-way market is not a soccer result market", () => {
  for (const quote of [
    { HOME: -125, DRAW: null, AWAY: 340 },
    { HOME: null, DRAW: 260, AWAY: 340 },
    { HOME: -125, DRAW: 260, AWAY: null },
  ]) {
    const r = readMatchResult1x2(quote);
    assert.equal(r.status, "INCOMPLETE_THREE_WAY");
    assert.equal(r.noVig, null);
    assert.equal(r.overround, null);
  }
});

test("a two-way h2h would inflate home and away if it were accepted", () => {
  // Same home/away prices, once with the draw and once without. The refusal is what stops the second
  // reading — which would put ~28 percentage points of draw probability onto the two clubs.
  const withDraw = readMatchResult1x2({ HOME: -125, DRAW: 260, AWAY: 340 });
  const withoutDraw = readMatchResult1x2({ HOME: -125, DRAW: null, AWAY: 340 });
  assert.equal(withDraw.status, "OK");
  assert.equal(withoutDraw.status, "INCOMPLETE_THREE_WAY");
  assert.ok(withDraw.noVig.DRAW > 0.2, "the draw carries real probability that cannot be dropped silently");
});

test("a price of zero is malformed, not even money", () => {
  const r = readMatchResult1x2({ HOME: 0, DRAW: 260, AWAY: 340 });
  assert.equal(r.status, "MALFORMED_PRICE");
  assert.equal(r.noVig, null);
});

test("devigThreeWay refuses degenerate and non-finite input", () => {
  assert.equal(devigThreeWay(0, 0, 0), null);
  assert.equal(devigThreeWay(-1, 0.5, 0.5), null, "the three must sum above zero");
  assert.equal(devigThreeWay(Number.NaN, 0.3, 0.3), null);
  assert.equal(devigThreeWay(Number.POSITIVE_INFINITY, 0.3, 0.3), null);
});

test("devigThreeWay preserves ratios", () => {
  const d = devigThreeWay(0.5, 0.3, 0.4);
  assert.ok(Math.abs(d.home + d.draw + d.away - 1) < TOL);
  assert.ok(Math.abs(d.home / d.draw - 0.5 / 0.3) < 1e-12);
});

test("the reading carries the prices it came from, so a surface never re-parses a payload", () => {
  const quote = { HOME: -125, DRAW: 260, AWAY: 340 };
  assert.deepEqual(readMatchResult1x2(quote).prices, quote);
});
