/**
 * Guards for the Moonshot ladder.
 *
 * The load-bearing property is that Moonshot and Bank Builder share ONE rule about what a loss
 * means. Two products drawn as the same ladder must not settle differently.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  MOONSHOT_GOAL,
  MOONSHOT_LADDER,
  MOONSHOT_SEED,
  MOONSHOT_STEP_COUNT,
  climbProbability,
  impliedRungProbability,
  moonshotRequiredPrice,
  moonshotRungs,
  moonshotStepForBalance,
} from "./moonshot-ladder.mjs";
import { rungProjection, settleRung } from "../bank-builder/rung-economics.mjs";

test("the ladder is the founder's spec, exactly", () => {
  assert.equal(MOONSHOT_SEED, 25);
  assert.equal(MOONSHOT_GOAL, 1000);
  assert.deepEqual(
    MOONSHOT_LADDER.map((r) => [r.day, r.start, r.goal]),
    [["Day 1", 25, 100], ["Day 2", 100, 400], ["Day 3", 400, 1000]],
  );
});

test("each rung's start is the previous rung's goal — no gap, no overlap", () => {
  let carried = MOONSHOT_SEED;
  for (const r of MOONSHOT_LADDER) {
    assert.equal(r.start, carried, `rung ${r.step} must be entered at $${carried}`);
    carried = r.goal;
  }
  assert.equal(carried, MOONSHOT_GOAL, "the last rung lands exactly on the crown");
});

test("the required price is derived from the rung, never typed beside it", () => {
  assert.equal(moonshotRequiredPrice(1), 300); // 25 → 100
  assert.equal(moonshotRequiredPrice(2), 300); // 100 → 400
  assert.equal(moonshotRequiredPrice(3), 150); // 400 → 1000
  assert.equal(moonshotRequiredPrice(4), null, "there is no rung 4");
  // And a rung's own price actually reaches its own goal.
  for (const r of moonshotRungs()) {
    const p = rungProjection({ stake: r.start, americanOdds: r.requiredAmerican, goalTarget: r.goal });
    assert.equal(p.reachesTarget, true, `${r.day} at ${r.requiredAmerican} must reach $${r.goal}`);
    assert.equal(p.projectedReturn, r.goal);
  }
});

test("ONE rule with Bank Builder · a losing leg ends the run at the seed", () => {
  const r = settleRung({ step: 2, stake: 100, payout: 400, legResults: ["won", "lost"], stepCount: MOONSHOT_STEP_COUNT });
  assert.equal(r.outcome, "LOST");
  assert.equal(r.nextStep, 1);
  // NB: settleRung returns Bank Builder's seed. Moonshot's is smaller, so the CALLER re-seeds —
  // this asserts the shared rule (back to rung 1, run over), not the shared number.
  assert.equal(r.runEnded, true);
});

test("clearing the last rung COMPLETES the run rather than inventing a fourth", () => {
  const r = settleRung({ step: 3, stake: 400, payout: 1000, legResults: ["won", "won"], stepCount: MOONSHOT_STEP_COUNT });
  assert.equal(r.outcome, "COMPLETED");
  assert.equal(r.nextStep, null);
  // The step count is what makes rung 3 terminal here and rung 5 terminal in Bank Builder.
  const notYet = settleRung({ step: 3, stake: 400, payout: 1000, legResults: ["won", "won"], stepCount: 5 });
  assert.equal(notYet.outcome, "WON", "with five rungs, rung 3 is not the end");
});

test("a run's rung follows the balance it carries", () => {
  assert.equal(moonshotStepForBalance(25).step, 1);
  assert.equal(moonshotStepForBalance(99).step, 1);
  assert.equal(moonshotStepForBalance(100).step, 2);
  assert.equal(moonshotStepForBalance(399).step, 2);
  assert.equal(moonshotStepForBalance(400).step, 3);
  assert.equal(moonshotStepForBalance(1000), null, "the crown is not a rung");
  assert.equal(moonshotStepForBalance(5).step, 1, "below the seed clamps to the first rung");
});

test("the climb's real probability is computed, never assumed", () => {
  // A rung priced +300 breaks even at 25%. Three of those is 1.6% — which is the number a reader
  // deserves beside a picture that makes three steps look close.
  assert.equal(impliedRungProbability(300), 0.25);
  assert.equal(impliedRungProbability(150), 0.4);
  assert.equal(climbProbability(0.25), 0.015625);
  // It refuses to invent a hit rate.
  for (const bad of [null, undefined, NaN, 0, 1.5, -0.2]) assert.equal(climbProbability(bad), null);
});

test("the full climb composes end to end at the required prices", () => {
  let stake = MOONSHOT_SEED;
  for (const r of moonshotRungs()) {
    assert.equal(stake, r.start);
    const p = rungProjection({ stake, americanOdds: r.requiredAmerican, goalTarget: r.goal });
    const s = settleRung({ step: r.step, stake, payout: p.projectedReturn, legResults: ["won", "won"], stepCount: MOONSHOT_STEP_COUNT });
    if (r.step < MOONSHOT_STEP_COUNT) { assert.equal(s.outcome, "WON"); stake = s.nextStake; }
    else { assert.equal(s.outcome, "COMPLETED"); assert.equal(p.projectedReturn, MOONSHOT_GOAL); }
  }
});
