/**
 * Tests for cricket projection helpers.
 *
 * Run: npx tsx --test app/src/lib/cricket-projection.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  americanToDecimal,
  impliedProb,
  removeVigTwoWay,
  formatProbPct,
  formatAmericanOdds,
  formatTotalLine,
} from "./cricket-projection.ts";

test("americanToDecimal handles +/-100 and beyond", () => {
  assert.equal(americanToDecimal(100), 2);
  assert.equal(americanToDecimal(-100), 2);
  assert.ok(Math.abs(americanToDecimal(-110) - 1.9091) < 0.001);
  assert.ok(Math.abs(americanToDecimal(150) - 2.5) < 0.001);
});

test("americanToDecimal returns null for nullish input", () => {
  assert.equal(americanToDecimal(null), null);
  assert.equal(americanToDecimal(undefined), null);
});

test("impliedProb converts American odds to fractional probability", () => {
  // -110 → decimal ~1.909 → prob ~0.5238
  const p = impliedProb(-110);
  assert.ok(p !== null && Math.abs(p - 0.5238) < 0.001);
  // +200 → decimal 3.0 → prob 0.3333
  const p2 = impliedProb(200);
  assert.ok(p2 !== null && Math.abs(p2 - 0.3333) < 0.001);
});

test("removeVigTwoWay normalizes to 1.0", () => {
  // -110 / -110 implies 0.5238 each, sum 1.0476 (4.76% vig)
  const pA = impliedProb(-110);
  const pB = impliedProb(-110);
  const { a, b } = removeVigTwoWay(pA, pB);
  assert.ok(Math.abs(a + b - 1) < 1e-9);
  assert.ok(Math.abs(a - 0.5) < 1e-9);
});

test("removeVigTwoWay handles asymmetric prices", () => {
  // Favorite -200 vs underdog +160 (chunky vig)
  const fav = impliedProb(-200);
  const dog = impliedProb(160);
  const { a, b } = removeVigTwoWay(fav, dog);
  assert.ok(Math.abs(a + b - 1) < 1e-9);
  assert.ok(a > 0.5);
  assert.ok(b < 0.5);
});

test("removeVigTwoWay handles zero-sum defensively", () => {
  const { a, b } = removeVigTwoWay(0, 0);
  assert.equal(a, 0.5);
  assert.equal(b, 0.5);
});

test("formatProbPct emits clean percent strings", () => {
  assert.equal(formatProbPct(0.5238), "52.4%");
  assert.equal(formatProbPct(0.5), "50.0%");
  assert.equal(formatProbPct(null), "—");
  assert.equal(formatProbPct(undefined), "—");
});

test("formatAmericanOdds prefixes + on positives", () => {
  assert.equal(formatAmericanOdds(150), "+150");
  assert.equal(formatAmericanOdds(-110), "-110");
  assert.equal(formatAmericanOdds(null), "—");
});

test("formatTotalLine drops trailing decimal when integer", () => {
  assert.equal(formatTotalLine(165.5), "165.5");
  assert.equal(formatTotalLine(167), "167");
  assert.equal(formatTotalLine(null), "—");
});
