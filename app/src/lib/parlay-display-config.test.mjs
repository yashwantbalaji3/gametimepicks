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

test("PR #115: visible-per-lane cap for safe lanes is 5 (up from 2)", () => {
  // User asked for "at least 5 suggested parlays per risk level
  // per sport when data supports it". The cap rises to 5; the
  // display selector still rotates for diversity so the visible 5
  // are not just the top-5 raw scores when alternatives exist.
  assert.equal(VISIBLE_PER_LANE_SAFE, 5);
});

test("PR #115: visible cap inside the longshot lane is 4", () => {
  // Spec G in PR #110 required aggressive visible cap <= 4. We
  // hold at 4 now (was 2 under the tightest interpretation).
  assert.equal(VISIBLE_PER_LANE_HV, 4);
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
