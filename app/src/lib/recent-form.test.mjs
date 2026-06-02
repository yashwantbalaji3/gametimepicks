/**
 * Tests for recent-form (L10) helpers (PR 4 — Bank Builder L10 transparency).
 * L10 is computed from real recentSeries (pregame-safe), fail-closed, and is
 * never a performance claim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  legL10HitRate,
  legRecentFormLabel,
  slipRecentFormSummary,
  recentSeriesKey,
  indexRecentSeries,
  attachRecentSeries,
  MIN_RECENT_GAMES,
} from "./recent-form.ts";

test("legL10HitRate (Over): counts games above the line; ties excluded", () => {
  // hits 0.5 line: values >0.5 are hits. [1,0,2,0,2] → 3 hits / 5 decisive
  const l = legL10HitRate({ recentSeries: [1, 0, 2, 0, 2], line: 0.5, side: "Over" });
  assert.deepEqual(l, { hits: 3, decisive: 5, rate: 3 / 5 });
});

test("legL10HitRate (Under): counts games below the line", () => {
  const l = legL10HitRate({ recentSeries: [1, 2, 0, 0, 1], line: 1.5, side: "Under" });
  // below 1.5: 1,0,0,1 = 4 of 5
  assert.equal(l.hits, 4);
  assert.equal(l.decisive, 5);
});

test("legL10HitRate: integer-line ties are pushes (excluded from denominator)", () => {
  // line 2 (integer); values equal to 2 are pushes
  const l = legL10HitRate({ recentSeries: [3, 2, 1, 2, 4], line: 2, side: "Over" });
  // ties (2,2) excluded → decisive 3 (3,1,4); hits >2: 3,4 = 2
  assert.deepEqual(l, { hits: 2, decisive: 3, rate: 2 / 3 });
});

test("legL10HitRate: fail-closed (too few games / no line / bad side)", () => {
  assert.equal(legL10HitRate({ recentSeries: [1, 2], line: 0.5, side: "Over" }), null); // < MIN_RECENT_GAMES
  assert.equal(legL10HitRate({ recentSeries: [1, 2, 3], line: null, side: "Over" }), null);
  assert.equal(legL10HitRate({ recentSeries: [1, 2, 3], line: 0.5, side: "Pass" }), null);
  assert.equal(legL10HitRate({ line: 0.5, side: "Over" }), null); // no series
  assert.equal(legL10HitRate(null), null);
  assert.ok(MIN_RECENT_GAMES >= 3);
});

test("legRecentFormLabel renders L10 x/y or em-dash, never a win claim", () => {
  assert.equal(legRecentFormLabel({ recentSeries: [1, 0, 2, 0, 2], line: 0.5, side: "Over" }), "L10 3/5");
  assert.equal(legRecentFormLabel({ recentSeries: [1], line: 0.5, side: "Over" }), "L10 —");
});

test("slipRecentFormSummary averages legs with data + flags completeness", () => {
  const slip = {
    legs: [
      { recentSeries: [1, 1, 1, 1, 1], line: 0.5, side: "Over" }, // rate 1.0
      { recentSeries: [0, 0, 0, 0, 0], line: 0.5, side: "Over" }, // rate 0.0
    ],
  };
  const s = slipRecentFormSummary(slip);
  assert.equal(s.avgRate, 0.5);
  assert.equal(s.legsWithData, 2);
  assert.equal(s.totalLegs, 2);
  assert.equal(s.complete, true);
});

test("slipRecentFormSummary: partial data → not complete; null avg when none", () => {
  const partial = {
    legs: [
      { recentSeries: [1, 1, 1], line: 0.5, side: "Over" },
      { recentSeries: [1], line: 0.5, side: "Over" }, // no data
    ],
  };
  const s = slipRecentFormSummary(partial);
  assert.equal(s.legsWithData, 1);
  assert.equal(s.totalLegs, 2);
  assert.equal(s.complete, false);
  assert.equal(slipRecentFormSummary({ legs: [] }).avgRate, null);
});

// --- enrichment (attach recentSeries from the optimizer legPool) -----------
test("recentSeriesKey is null unless all identity fields present", () => {
  assert.equal(recentSeriesKey({ playerId: 1, market: "batter_hits", line: 0.5, side: "Over" }), "1|batter_hits|0.5|over");
  assert.equal(recentSeriesKey({ playerId: null, market: "x", line: 0.5, side: "Over" }), null);
  assert.equal(recentSeriesKey({ playerId: 1, market: "x", line: null, side: "Over" }), null);
  assert.equal(recentSeriesKey(null), null);
});

test("attachRecentSeries fills missing recentSeries from the index (pure)", () => {
  // optimizer-style source with recentSeries
  const optLegs = [
    { playerId: 1, market: "batter_hits", line: 0.5, side: "Over", recentSeries: [1, 0, 2, 0, 2] },
  ];
  const index = indexRecentSeries(optLegs);
  // snapshot-style slip whose leg lacks recentSeries
  const snapshotSlips = [
    { slipId: "s1", legs: [{ playerId: 1, market: "batter_hits", line: 0.5, side: "Over" }] },
  ];
  const out = attachRecentSeries(snapshotSlips, index);
  assert.deepEqual(out[0].legs[0].recentSeries, [1, 0, 2, 0, 2], "recentSeries attached by identity join");
  // original input is not mutated
  assert.equal(snapshotSlips[0].legs[0].recentSeries, undefined);
  // and now L10 is computable on the enriched leg
  assert.equal(legL10HitRate(out[0].legs[0]).hits, 3);
});

test("attachRecentSeries leaves legs without a match unchanged", () => {
  const index = indexRecentSeries([]);
  const slips = [{ slipId: "s", legs: [{ playerId: 9, market: "x", line: 1.5, side: "Over" }] }];
  const out = attachRecentSeries(slips, index);
  assert.equal(out[0].legs[0].recentSeries, undefined);
});

test("attachRecentSeries does not overwrite legs that already have recentSeries", () => {
  const index = indexRecentSeries([{ playerId: 1, market: "m", line: 0.5, side: "Over", recentSeries: [9, 9, 9] }]);
  const slips = [{ slipId: "s", legs: [{ playerId: 1, market: "m", line: 0.5, side: "Over", recentSeries: [1, 1, 1] }] }];
  const out = attachRecentSeries(slips, index);
  assert.deepEqual(out[0].legs[0].recentSeries, [1, 1, 1]);
});
