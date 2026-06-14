import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadWorldCupFlexLeg, flexReturn, loadOfficialStep3Candidate } from "./world-cup-flex.ts";

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

test("Flex Card must NOT touch the official Bank Builder (settled: $10,376.17, Step 5, no nextPick)", () => {
  const p = path.join(process.cwd(), "public", "data", "bank-builder", "public-summary-latest.json");
  const s = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.equal(s.currentBankrollUnits, 10376.17);
  assert.equal(s.currentProgressionStep, 5);
  // No published nextPick — the Road to $10K is complete, there is no further card to stake.
  assert.ok(s.nextPick == null || s.nextPick === undefined, "nextPick must be absent (run complete)");
});

test("official Step-3 candidate, when present: 2 WC legs, real odds, >= $1,400, no correlation, stake locked", () => {
  const c = loadOfficialStep3Candidate(728.76);
  if (!c) return; // decline (null) is a valid outcome
  assert.equal(c.legs.length, 2);
  assert.equal(c.stake, 728.76);
  assert.ok(c.projectedReturn >= 1400, `return ${c.projectedReturn} must hit the $1,400 floor`);
  assert.equal(c.targetMin, 1400);
  // Both legs real, model-favored, and from DIFFERENT matches (no same-game correlation)
  for (const l of c.legs) {
    assert.equal(typeof l.americanOdds, "number");
    assert.ok(l.modelProbability >= 0.55, `leg model ${l.modelProbability}`);
  }
  assert.notEqual(String(c.legs[0].matchId), String(c.legs[1].matchId));
  // Combined model prob is the product (honest parlay math), profit = return - stake
  assert.ok(Math.abs(c.combinedModelProbability - c.legs[0].modelProbability * c.legs[1].modelProbability) < 1e-9);
  assert.ok(Math.abs(c.projectedProfit - (c.projectedReturn - c.stake)) < 0.02);
});

test("official Step-3 candidate uses team markets only (no player props / no MLB)", () => {
  const c = loadOfficialStep3Candidate(728.76);
  if (!c) return;
  const teamMarkets = new Set(["double_chance", "moneyline_90", "match_total_goals", "match_total_corners"]);
  for (const l of c.legs) assert.ok(teamMarkets.has(l.market), `non-team market ${l.market}`);
});

test("official Step-3 legs carry mini-fixture flag data + regulation flag", () => {
  const c = loadOfficialStep3Candidate(728.76);
  if (!c) return;
  for (const l of c.legs) {
    // Match teams come straight from the projection rows.
    assert.equal(typeof l.homeTeam, "string");
    assert.equal(typeof l.awayTeam, "string");
    assert.ok(l.homeTeam.length > 0 && l.awayTeam.length > 0, "leg carries both match teams");
    // ISO codes resolve from teams.json for real WC sides (≤3 chars), or are
    // an empty string we degrade to a monogram — never fabricated.
    assert.ok(l.homeCode.length <= 3 && l.awayCode.length <= 3, "flag codes are ISO-ish or empty");
    // moneyline_90 + double_chance are 90-minute regulation markets.
    assert.equal(l.regulationOnly, l.market === "moneyline_90" || l.market === "double_chance");
  }
});
