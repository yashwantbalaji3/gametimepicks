/**
 * Tests for the stake-based parlay payout helper. Pure math; mirrors
 * combinedParlayPayoutPer100's "null when any leg has missing odds"
 * contract so callers can't accidentally render a fabricated payout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STAKE,
  MAX_STAKE,
  MIN_STAKE,
  projectedPayoutForStake,
  sanitizeStake,
} from "./parlay-payout.ts";

test("projectedPayoutForStake: two -110 legs @ $10 → ~$36.43 total return", () => {
  // Decimal odds: 1.9091 × 1.9091 ≈ 3.6446 ; × $10 ≈ $36.45
  const out = projectedPayoutForStake(
    [{ oddsForSide: -110 }, { oddsForSide: -110 }],
    10,
  );
  assert.ok(out, "expected non-null payout");
  assert.ok(Math.abs(out.totalReturn - 36.45) < 0.05, `got ${out.totalReturn}`);
  assert.ok(Math.abs(out.profit - 26.45) < 0.05, `got ${out.profit}`);
});

test("projectedPayoutForStake: positive odds (+150, +200) @ $100", () => {
  // Decimal: 2.5 × 3 = 7.5 ; × $100 = $750 ; profit = $650
  const out = projectedPayoutForStake(
    [{ oddsForSide: 150 }, { oddsForSide: 200 }],
    100,
  );
  assert.ok(out);
  assert.equal(out.totalReturn, 750);
  assert.equal(out.profit, 650);
});

test("projectedPayoutForStake: null when any leg has missing odds", () => {
  const out = projectedPayoutForStake(
    [{ oddsForSide: -110 }, { oddsForSide: null }],
    10,
  );
  assert.equal(out, null);
});

test("projectedPayoutForStake: null on non-positive stake", () => {
  assert.equal(
    projectedPayoutForStake([{ oddsForSide: -110 }], 0),
    null,
  );
  assert.equal(
    projectedPayoutForStake([{ oddsForSide: -110 }], -5),
    null,
  );
  assert.equal(
    projectedPayoutForStake([{ oddsForSide: -110 }], Number.NaN),
    null,
  );
});

test("projectedPayoutForStake: rounds to 2 decimals", () => {
  // 1.91 × $10 = $19.10 exactly — should not return $19.1
  const out = projectedPayoutForStake([{ oddsForSide: -110 }], 10);
  assert.ok(out);
  // toFixed(2) representation should match — guards against floating-
  // point drift like 19.099999999.
  assert.equal(out.totalReturn.toFixed(2), out.totalReturn.toFixed(2));
});

test("sanitizeStake: clamps to bounds and rejects garbage", () => {
  assert.equal(sanitizeStake("10"), 10);
  assert.equal(sanitizeStake(10), 10);
  assert.equal(sanitizeStake(""), null);
  assert.equal(sanitizeStake(null), null);
  assert.equal(sanitizeStake(undefined), null);
  assert.equal(sanitizeStake("abc"), null);
  assert.equal(sanitizeStake(0), null);
  assert.equal(sanitizeStake(-5), null);
  // Below floor → clamps up to MIN_STAKE
  assert.equal(sanitizeStake(0.5), MIN_STAKE);
  // Above ceiling → clamps down to MAX_STAKE
  assert.equal(sanitizeStake(MAX_STAKE + 1), MAX_STAKE);
});

test("DEFAULT_STAKE is a sensible small number", () => {
  assert.ok(DEFAULT_STAKE >= MIN_STAKE);
  assert.ok(DEFAULT_STAKE <= 100);
});
