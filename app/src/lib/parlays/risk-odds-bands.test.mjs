import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getRiskBucketForCombinedOdds, isCombinedOddsInRiskBucket, isLegPriceAllowed, legPriceRejectReason,
} from "./risk-odds-bands.ts";

test("combined-odds buckets are non-overlapping with correct boundaries", () => {
  for (const o of [-200, -110, 100]) assert.equal(getRiskBucketForCombinedOdds(o), "low", `${o} → Low`);
  for (const o of [101, 200, 300]) assert.equal(getRiskBucketForCombinedOdds(o), "medium", `${o} → Medium`);
  for (const o of [301, 450, 600]) assert.equal(getRiskBucketForCombinedOdds(o), "high", `${o} → High`);
  for (const o of [601, 1000, 5000]) assert.equal(getRiskBucketForCombinedOdds(o), "longshot", `${o} → Longshot`);
  // shorter than the Low floor → no bucket (too short to be a sensible parlay)
  assert.equal(getRiskBucketForCombinedOdds(-250), null, "-250 rejected");
  assert.equal(getRiskBucketForCombinedOdds(-500), null, "-500 rejected");
});

test("boundaries belong to exactly one bucket (no double-counting)", () => {
  for (const o of [-200, -110, 100, 101, 200, 300, 301, 450, 600, 601, 1000]) {
    const buckets = ["low", "medium", "high", "longshot"].filter((b) => isCombinedOddsInRiskBucket(o, b));
    assert.equal(buckets.length, 1, `${o} belongs to exactly one bucket (got ${buckets})`);
  }
  assert.equal(["low", "medium", "high", "longshot"].filter((b) => isCombinedOddsInRiskBucket(-250, b)).length, 0, "-250 in no bucket");
});

test("individual leg guard: reject favorites shorter than -500, allow down to -500", () => {
  assert.equal(isLegPriceAllowed(-1000, "low"), false, "-1000 rejected");
  assert.equal(isLegPriceAllowed(-700, "medium"), false, "-700 rejected");
  assert.equal(isLegPriceAllowed(-500, "low"), true, "-500 allowed");
  assert.equal(isLegPriceAllowed(-450, "low"), true, "-450 allowed");
  assert.equal(legPriceRejectReason(-1000, "low"), "leg_too_short_price");
});

test("individual leg guard: reject underdogs above +1200 unless an explicitly justified Longshot", () => {
  assert.equal(isLegPriceAllowed(1300, "high"), false, "+1300 rejected for non-longshot");
  assert.equal(isLegPriceAllowed(1300, "longshot", false), false, "+1300 rejected for unjustified longshot");
  assert.equal(isLegPriceAllowed(1300, "longshot", true), true, "+1300 allowed for justified longshot");
  assert.equal(isLegPriceAllowed(900, "high"), true, "+900 allowed");
  assert.equal(legPriceRejectReason(1300, "high"), "leg_too_long_price");
  assert.equal(legPriceRejectReason(900, "high"), null);
});
