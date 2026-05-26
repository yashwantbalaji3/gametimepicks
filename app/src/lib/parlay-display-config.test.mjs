/**
 * Locks the Parlay Lab homepage display contract introduced by
 * PR #110 safety filters A + B. These constants are the single
 * source of truth for "what lanes are visible by default" and
 * "how many slips per lane" — regressing them would silently undo
 * the May 25 audit response.
 *
 * Run: npx tsx --test app/src/lib/parlay-display-config.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HIGH_VARIANCE_DEFAULT_OPEN,
  HIGH_VARIANCE_PROFILE,
  MAX_OFFICIAL_LEG_COUNT,
  SAFE_RISK_ORDER,
  VISIBLE_PER_LANE_HV,
  VISIBLE_PER_LANE_SAFE,
  isAllowedOfficialSlip,
} from "./parlay-display-config.ts";

test("PR #110 A: safe lanes are Conservative, Balanced, Star Power", () => {
  assert.deepEqual(SAFE_RISK_ORDER, ["conservative", "balanced", "star_power"]);
});

test("PR #110 A: safe lanes never include the longshot lane", () => {
  assert.ok(
    !SAFE_RISK_ORDER.includes("aggressive"),
    "Aggressive/longshot must NEVER live in SAFE_RISK_ORDER",
  );
});

test("PR #110 A: visible-per-lane cap for safe lanes is 2", () => {
  assert.equal(VISIBLE_PER_LANE_SAFE, 2,
    "Safe lanes must cap at 2 visible (down from 3) per the 5/25 audit");
});

test("PR #110 G: visible-per-lane cap inside the longshot lane is also 2", () => {
  assert.equal(VISIBLE_PER_LANE_HV, 2,
    "High-variance lane visible cap must stay <= 4 from spec G; we use 2");
  assert.ok(VISIBLE_PER_LANE_HV <= 4,
    "Spec G requires aggressive visible cap <= 4");
});

test("PR #110 B: the high-variance profile is the aggressive lane", () => {
  assert.equal(HIGH_VARIANCE_PROFILE, "aggressive");
});

test("PR #110 B: high-variance lane is HIDDEN by default", () => {
  assert.equal(HIGH_VARIANCE_DEFAULT_OPEN, false,
    "Longshot lane must default to collapsed so it never appears " +
      "as a peer to the safer lanes on first paint");
});

test("PR #110 G: max official leg count is 4 (5-leg slips suppressed)", () => {
  assert.equal(MAX_OFFICIAL_LEG_COUNT, 4,
    "5-leg slips went 0-14 on 5/25; official suggestions cap at 4");
});

test("PR #110 G: isAllowedOfficialSlip rejects 5+ leg slips and empties", () => {
  // Helper to build a slip-like object with N legs.
  const slipWith = (n) => ({ legs: Array.from({ length: n }, () => ({})) });
  assert.equal(isAllowedOfficialSlip(slipWith(1)), true, "1-leg is allowed");
  assert.equal(isAllowedOfficialSlip(slipWith(2)), true, "2-leg is allowed");
  assert.equal(isAllowedOfficialSlip(slipWith(4)), true, "4-leg is allowed");
  assert.equal(isAllowedOfficialSlip(slipWith(5)), false, "5-leg is NOT allowed");
  assert.equal(isAllowedOfficialSlip(slipWith(6)), false, "6-leg is NOT allowed");
  assert.equal(isAllowedOfficialSlip(slipWith(0)), false, "0-leg is NOT allowed");
  assert.equal(isAllowedOfficialSlip({}), false, "missing legs treated as 0");
});
