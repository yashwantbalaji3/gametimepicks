/**
 * EPL settlement-contract guards (Program 146 · evening R3).
 *
 * Every rule here was paid for once already in another sport: the 90-minute rule (World Cup
 * knockouts), final-without-scores (StatsAPI postponed games), decisive = W+L only, and populations
 * that must reconcile to zero gap. The guards make sure EPL inherits the lessons rather than
 * re-learning them on real money.
 *
 * Run: npx tsx --test src/lib/sports/epl/settlement-contract.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { gradeEplLeg, settleEplSlate, EPL_SETTLEMENT_CONTRACT_VERSION, OUTCOMES } from "./settlement-contract.mjs";

const FT = (h, a) => ({ fixtureId: "f1", status: "FULL_TIME", homeGoalsFT: h, awayGoalsFT: a });

test("match_result grades all three sides from the FT score", () => {
  assert.equal(gradeEplLeg({ market: "match_result", side: "home" }, FT(2, 1)).outcome, "WIN");
  assert.equal(gradeEplLeg({ market: "match_result", side: "away" }, FT(2, 1)).outcome, "LOSS");
  assert.equal(gradeEplLeg({ market: "match_result", side: "draw" }, FT(1, 1)).outcome, "WIN");
  assert.equal(gradeEplLeg({ market: "match_result", side: "home" }, FT(0, 0)).outcome, "LOSS");
});

test("total_goals: over/under and the exact-line PUSH", () => {
  assert.equal(gradeEplLeg({ market: "total_goals", side: "over", line: 2.5 }, FT(2, 1)).outcome, "WIN");
  assert.equal(gradeEplLeg({ market: "total_goals", side: "under", line: 2.5 }, FT(2, 1)).outcome, "LOSS");
  assert.equal(gradeEplLeg({ market: "total_goals", side: "over", line: 3 }, FT(2, 1)).outcome, "PUSH");
  assert.equal(gradeEplLeg({ market: "total_goals", side: "under", line: 3 }, FT(2, 1)).outcome, "PUSH");
});

test("THE STATSAPI LESSON · FULL_TIME without integer goals is quarantined, never guessed", () => {
  for (const bad of [FT(null, 1), FT(2, null), FT(2.5, 1), FT(-1, 0)]) {
    const g = gradeEplLeg({ market: "match_result", side: "home" }, bad);
    assert.equal(g.outcome, "VOID_PENDING_REVIEW", JSON.stringify(bad));
    assert.match(g.reason, /quarantined, never guessed/);
  }
});

test("only FULL_TIME grades — every other status voids with the status named", () => {
  for (const status of ["POSTPONED", "ABANDONED", "SUSPENDED", "IN_PLAY", "NOT_STARTED"]) {
    const g = gradeEplLeg({ market: "match_result", side: "home" }, { fixtureId: "f1", status, homeGoalsFT: 2, awayGoalsFT: 1 });
    assert.equal(g.outcome, "VOID_PENDING_REVIEW", status);
    assert.ok(g.reason.includes(status));
  }
  // A missing result entirely also voids — a batch settler must not throw mid-slate.
  assert.equal(gradeEplLeg({ market: "match_result", side: "home" }, undefined).outcome, "VOID_PENDING_REVIEW");
});

test("an unknown market or malformed leg voids with the contract version named", () => {
  const g = gradeEplLeg({ market: "both_teams_to_score", side: "yes" }, FT(1, 1));
  assert.equal(g.outcome, "VOID_PENDING_REVIEW");
  assert.ok(g.reason.includes(`v${EPL_SETTLEMENT_CONTRACT_VERSION}`));
  assert.equal(gradeEplLeg({ market: "total_goals", side: "over" }, FT(1, 1)).outcome, "VOID_PENDING_REVIEW", "missing line");
  assert.equal(gradeEplLeg({ market: "match_result", side: "banker" }, FT(1, 1)).outcome, "VOID_PENDING_REVIEW", "unknown side");
});

test("batch settlement: decisive = W+L only, and the population reconciles to zero gap", () => {
  const legs = [
    { fixtureId: "f1", market: "match_result", side: "home" },          // WIN
    { fixtureId: "f1", market: "total_goals", side: "over", line: 3 },  // PUSH (3 goals)
    { fixtureId: "f2", market: "match_result", side: "away" },          // void (postponed)
    { fixtureId: "f1", market: "match_result", side: "draw" },          // LOSS
  ];
  const results = { f1: FT(2, 1), f2: { fixtureId: "f2", status: "POSTPONED", homeGoalsFT: null, awayGoalsFT: null } };
  const { summary } = settleEplSlate(legs, results);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.pushes, 1);
  assert.equal(summary.voids, 1);
  assert.equal(summary.decisive, 2, "decisive excludes pushes and voids — the standing denominator rule");
  assert.equal(summary.reconciles, true, "wins+losses+pushes+voids must equal total, gap zero");
});

test("every outcome the contract can emit is in the shared vocabulary", () => {
  for (const o of ["WIN", "LOSS", "PUSH", "VOID_PENDING_REVIEW"]) assert.ok(OUTCOMES.includes(o));
});
