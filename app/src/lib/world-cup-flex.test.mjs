import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadWorldCupFlexLeg, flexReturn } from "./world-cup-flex.ts";

test("flexReturn computes paper return + profit ($728.76 @ -270 ≈ $998.67 / +$269.91)", () => {
  const { ret, profit } = flexReturn(728.76, -270);
  assert.ok(Math.abs(ret - 998.67) < 0.5, `ret ${ret}`);
  assert.ok(Math.abs(profit - 269.91) < 0.5, `profit ${profit}`);
});

test("flex leg, when present, is a Low-risk model-favorite — and NOT an excluded leg", () => {
  const leg = loadWorldCupFlexLeg();
  if (!leg) return; // null is valid (no flex-grade leg on the slate)
  assert.equal(leg.riskTier, "Low");
  assert.ok(leg.modelProbability >= 0.6, `model ${leg.modelProbability}`);
  // Excluded by the rules: South Africa or Draw (High), Over 2.5 (High)
  assert.notEqual(leg.pickLabel, "South Africa or Draw");
  assert.notEqual(leg.pickLabel, "Over 2.5");
  assert.equal(typeof leg.americanOdds, "number");
});

test("Flex Card must NOT touch the official Bank Builder (bankroll $728.76, Step 3, pending, no nextPick)", () => {
  const p = path.join(process.cwd(), "public", "data", "bank-builder", "public-summary-latest.json");
  const s = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(s.currentBankrollUnits, 728.76);
  assert.equal(s.currentProgressionStep, 3);
  // Official ladder candidate stays pending — no published nextPick.
  assert.ok(s.nextPick == null || s.nextPick === undefined, "nextPick must be absent (pending)");
});
