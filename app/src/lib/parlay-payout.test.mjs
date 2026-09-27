/**
 * Tests for the stake-based parlay payout helper. Pure math; mirrors
 * combinedParlayPayoutPer100's "null when any leg has missing odds"
 * contract so callers can't accidentally render a fabricated payout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_STAKE,
  MAX_STAKE,
  MIN_STAKE,
  projectedPayoutForStake,
  sanitizeStake,
  STAKE_STATE,
  combinedDecimalFromLegs,
  payoutFromDecimal,
  validateStake,
} from "./parlay-payout.ts";
import { americanToDecimal, decimalToAmerican } from "./odds-math.ts";

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

/* ── §13 PAYOUT PRECISION + INPUT VALIDATION ────────────────────────────────────────────────── */

test("§13 regression: +133 / -130 on $100 returns $412.23, not $412.00", () => {
  const legs = [{ oddsForSide: 133 }, { oddsForSide: -130 }];
  const dec = combinedDecimalFromLegs(legs);
  /* The exact figure from the founder's report. */
  assert.equal(payoutFromDecimal(dec, 100).totalReturn, 412.23);
  assert.equal(payoutFromDecimal(dec, 100).profit, 312.23);

  /* And the path that produced the wrong number, pinned so it cannot come back: the combined
     American price quantises to +312, and a payout built from THAT loses $0.23. */
  const roundTripped = americanToDecimal(decimalToAmerican(dec));
  assert.equal(payoutFromDecimal(roundTripped, 100).totalReturn, 412.0);
  assert.notEqual(
    payoutFromDecimal(dec, 100).totalReturn,
    payoutFromDecimal(roundTripped, 100).totalReturn,
    "if these ever agree, the test slip no longer exercises the round-trip and must be replaced",
  );
});

test("§13: precision is retained internally and rounded exactly once, at the display", () => {
  const legs = [{ oddsForSide: 133 }, { oddsForSide: -130 }];
  const dec = combinedDecimalFromLegs(legs);
  assert.ok(String(dec).length > 6, "the internal multiplier keeps its tail");
  /* Scaling by 3 then rounding must equal rounding the exact product — i.e. no intermediate round. */
  assert.equal(payoutFromDecimal(dec, 300).totalReturn, Math.round(dec * 300 * 100) / 100);
  /* A 1000× stake would drift by dollars if an intermediate value had been rounded to cents. */
  assert.equal(payoutFromDecimal(dec, 1000).totalReturn, 4122.31);
});

test("§13: American ⇄ decimal round-trips for representable prices", () => {
  for (const a of [-300, -200, -150, -130, -110, 100, 120, 133, 150, 250, 400]) {
    assert.equal(decimalToAmerican(americanToDecimal(a)), a, `${a} must survive a round trip`);
  }
});

test("§13: combinedDecimalFromLegs is null when ANY leg price is missing", () => {
  assert.equal(combinedDecimalFromLegs([{ oddsForSide: 133 }, { oddsForSide: null }]), null);
  assert.equal(combinedDecimalFromLegs([]), null);
  /* A partial product is a smaller, CONFIDENT number — worse than no number. */
  assert.notEqual(combinedDecimalFromLegs([{ oddsForSide: 133 }, { oddsForSide: null }]), 2.33);
});

test("§13: a negative stake yields NO payout and an explicit message", () => {
  const v = validateStake("-50");
  assert.equal(v.state, STAKE_STATE.NEGATIVE);
  assert.equal(v.stake, null, "nothing to compute with");
  assert.match(v.message, /cannot be negative/i);
  /* The defect: it must not become a confident $0.00. */
  assert.equal(payoutFromDecimal(4.12, v.stake ?? 0), null);
});

test("§13: the enumerated stake cases each get their own state", () => {
  assert.equal(validateStake("100").state, STAKE_STATE.OK);          // positive whole
  assert.equal(validateStake("12.50").stake, 12.5);                   // cents
  assert.equal(validateStake("12.50").state, STAKE_STATE.OK);
  assert.equal(validateStake("0").state, STAKE_STATE.ZERO);           // zero
  assert.equal(validateStake("-1").state, STAKE_STATE.NEGATIVE);      // negative
  assert.equal(validateStake("abc").state, STAKE_STATE.NOT_A_NUMBER); // non-number
  assert.equal(validateStake("").state, STAKE_STATE.EMPTY);           // untouched field
  assert.equal(validateStake("1e999").state, STAKE_STATE.NOT_A_NUMBER, "Infinity is not a stake");
  assert.equal(validateStake("999999999").state, STAKE_STATE.LOWERED_TO_MAX); // extreme
});

test("§13: a clamp is REPORTED, never silent — the reader must know which number was used", () => {
  const low = validateStake("0.50");
  assert.equal(low.state, STAKE_STATE.RAISED_TO_MIN);
  assert.equal(low.stake, MIN_STAKE);
  assert.match(low.message, /\$1/, "the message names the stake actually used");

  const high = validateStake(MAX_STAKE + 1);
  assert.equal(high.state, STAKE_STATE.LOWERED_TO_MAX);
  assert.equal(high.stake, MAX_STAKE);
  assert.ok(high.message, "a silent clamp answers a different question than the one asked");

  /* OK and EMPTY are the only states with nothing to say. */
  assert.equal(validateStake("25").message, null);
  assert.equal(validateStake("").message, null);
});

test("§13: cents in the stake survive into the payout", () => {
  const dec = combinedDecimalFromLegs([{ oddsForSide: -110 }]);
  const v = validateStake("12.34");
  assert.equal(v.stake, 12.34);
  assert.equal(payoutFromDecimal(dec, v.stake).totalReturn, Math.round(dec * 12.34 * 100) / 100);
});

test("§13: the payout component reads the full decimal, not the American price", () => {
  const src = readFileSync(new URL("../components/ui/stake-payout-input.tsx", import.meta.url), "utf8");
  assert.match(src, /combinedDecimal: number;/, "the precise multiplier is a required prop");
  assert.doesNotMatch(src, /americanToDecimal\(combinedAmerican\)/, "the lossy round-trip must not return");
  assert.doesNotMatch(src, /sanitizeStake\(raw\) \?\? 0/, "`?? 0` is what rendered a rejected stake as $0.00");
  assert.match(src, /payoutFromDecimal\(combinedDecimal/, "payout comes from the canonical function");
});

test("§13: every card producer supplies a combined decimal", () => {
  const src = readFileSync(new URL("./normalize.ts", import.meta.url), "utf8");
  const declared = (src.match(/combinedAmericanOdds:/g) ?? []).length;
  const precise = (src.match(/combinedDecimal:/g) ?? []).length;
  assert.ok(declared >= 4, "the producers this guard covers must actually be present");
  assert.equal(precise, declared, "a producer that sets a price but no multiplier reintroduces the defect");
});

test("§13 second surface: the custom generator carries the precise multiplier too", async () => {
  const { computeCombinedDecimalOdds, computeCombinedAmericanOdds } = await import("./custom-parlay.ts");
  const legs = [{ oddsForSide: 133 }, { oddsForSide: -130 }];
  const dec = computeCombinedDecimalOdds(legs);
  assert.equal(computeCombinedAmericanOdds(legs), 312, "the American form still quantises");
  /* Profit per $100 as the card now renders it, vs what the round-trip produced. */
  assert.equal(Number(((dec - 1) * 100).toFixed(2)), 312.23);
  assert.notEqual(Number(((dec - 1) * 100).toFixed(2)), 312.0, "the round-trip figure must be gone");

  /* Same fail-closed rule, and the two fields must agree about EXISTENCE so a card cannot show a
     price with no multiplier or the reverse. */
  const partial = [{ oddsForSide: 133 }, { oddsForSide: null }];
  assert.equal(computeCombinedDecimalOdds(partial), null);
  assert.equal(computeCombinedAmericanOdds(partial), null);
  assert.equal(computeCombinedDecimalOdds([]), null);
  assert.equal(computeCombinedAmericanOdds([]), null);
});

test("§13: the custom card computes profit from the decimal, not the American price", () => {
  const src = readFileSync(new URL("../components/custom-parlay-generator.tsx", import.meta.url), "utf8");
  assert.match(src, /_profitPer100\(slip\.combinedDecimal\)/, "profit reads the precise multiplier");
  assert.doesNotMatch(src, /const decimal = americanToDecimal\(american\)/, "the round-trip helper must not return");
});
