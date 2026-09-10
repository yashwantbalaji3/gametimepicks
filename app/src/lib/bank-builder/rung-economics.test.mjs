/**
 * Guards for the ladder's money rule.
 *
 * These are the two sentences the product is: a win carries the whole payout into the next rung, and
 * a single losing leg sends the run back to the seed. Every assertion below is one of those two.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BANK_BUILDER_SEED,
  decimalFromAmerican,
  ladderCoherence,
  requiredAmericanForRung,
  rungProjection,
  settleRung,
  stakeForRung,
} from "./rung-economics.mjs";
import { BANK_BUILDER_LADDER } from "./../bank-builder-ladder";

test("american → decimal, both signs", () => {
  assert.equal(decimalFromAmerican(100), 2);
  assert.equal(decimalFromAmerican(-200), 1.5);
  assert.ok(Math.abs(decimalFromAmerican(207) - 3.07) < 1e-9);
  for (const bad of [0, null, undefined, NaN, "abc"]) assert.equal(decimalFromAmerican(bad), null);
});

test("THE BUG · rung 2 never stakes the seed", () => {
  // The board showed "Step 2 · from $200" beside "$100.00 Stake". Rung 2's stake is whatever rung 1
  // actually paid — never the seed again.
  assert.equal(stakeForRung({ step: 1 }), BANK_BUILDER_SEED);
  assert.equal(stakeForRung({ step: 2, clearedPayout: 200.51 }), 200.51);
  // And with nothing cleared behind it, rung 2 has NO stake — it refuses rather than falling back
  // to $100, which is exactly how the wrong number got on screen.
  assert.equal(stakeForRung({ step: 2, clearedPayout: null }), null);
  assert.equal(stakeForRung({ step: 3, clearedPayout: 0 }), null);
});

test("the projection is arithmetic on the real stake", () => {
  // Lane B as shipped: rung 2, entered at $200, card priced +207.
  const p = rungProjection({ stake: 200, americanOdds: 207, goalTarget: 700 });
  assert.equal(p.projectedReturn, 614);
  assert.equal(p.projectedProfit, 414);
  // ...and it does NOT reach the rung's $700 target. The board printed $700 anyway.
  assert.equal(p.reachesTarget, false);
  assert.equal(p.shortfall, 86);
});

test("a card that does reach the target says so", () => {
  const p = rungProjection({ stake: 200, americanOdds: 250, goalTarget: 700 });
  assert.equal(p.projectedReturn, 700);
  assert.equal(p.reachesTarget, true);
  assert.equal(p.shortfall, null);
});

test("the price each rung actually needs", () => {
  // What the selector should be hunting for, rung by rung.
  assert.equal(requiredAmericanForRung({ stake: 100, goalTarget: 200 }), 100);
  assert.equal(requiredAmericanForRung({ stake: 200, goalTarget: 700 }), 250);
  assert.equal(requiredAmericanForRung({ stake: 700, goalTarget: 1400 }), 100);
  assert.equal(requiredAmericanForRung({ stake: 1400, goalTarget: 3500 }), 150);
  // A target at or below the stake is not a rung.
  assert.equal(requiredAmericanForRung({ stake: 700, goalTarget: 700 }), null);
});

test("ONE losing leg ends the run and returns it to the seed", () => {
  const r = settleRung({ step: 3, stake: 700, payout: 1400, legResults: ["won", "lost"] });
  assert.equal(r.outcome, "LOST");
  assert.equal(r.nextStep, 1);
  assert.equal(r.nextStake, BANK_BUILDER_SEED);
  assert.equal(r.runEnded, true);
  // Losing on rung 3 does not drop you to rung 2. It ends the run.
  assert.notEqual(r.nextStep, 2);
});

test("every leg winning carries the WHOLE payout to the next rung", () => {
  const r = settleRung({ step: 1, stake: 100, payout: 200.51, legResults: ["won", "won"] });
  assert.equal(r.outcome, "WON");
  assert.equal(r.nextStep, 2);
  assert.equal(r.nextStake, 200.51, "the next stake is what this rung actually paid, not the design target");
});

test("a push drops out of the parlay rather than killing the run", () => {
  const r = settleRung({ step: 2, stake: 200, payout: 614, legResults: ["won", "push"] });
  assert.equal(r.outcome, "WON", "a push is not a loss — a book drops it from the slip");
  const dead = settleRung({ step: 2, stake: 200, payout: 614, legResults: ["push", "push"] });
  assert.equal(dead.outcome, "UNDECIDED", "and an all-push card decides nothing");
});

test("clearing the final rung completes the run", () => {
  const r = settleRung({ step: 5, stake: 3500, payout: 10000, legResults: ["won", "won"] });
  assert.equal(r.outcome, "COMPLETED");
  assert.equal(r.runEnded, true);
  assert.equal(r.nextStep, null, "there is no rung 6");
});

test("an undecided card leaves the run exactly where it stands", () => {
  const r = settleRung({ step: 2, stake: 200, payout: null, legResults: [] });
  assert.equal(r.outcome, "UNDECIDED");
  assert.equal(r.nextStep, 2);
  assert.equal(r.runEnded, false);
});

test("COHERENCE · an active rung above an unfinished one is refused", () => {
  // Exactly what shipped: Lane B active on step 2, step 1 "upcoming" below it.
  const bad = ladderCoherence([
    { step: 1, status: "upcoming", startTarget: 100 },
    { step: 2, status: "active", startTarget: 200, stake: 100 },
  ]);
  assert.equal(bad.coherent, false);
  assert.equal(bad.problems.length, 2, "both the impossible order AND the un-compounded stake");
  assert.match(bad.problems[0], /only reached by clearing/);
  assert.match(bad.problems[1], /not compounding/);
});

test("COHERENCE · a correct ladder passes", () => {
  const good = ladderCoherence([
    { step: 1, status: "completed", startTarget: 100 },
    { step: 2, status: "active", startTarget: 200, stake: 200.51 },
    { step: 3, status: "upcoming", startTarget: 700 },
  ]);
  assert.equal(good.coherent, true, good.problems.join("; "));
});

test("the rule composes into the published ladder end to end", () => {
  // Walk the real rungs with cards that exactly meet each target, and confirm the stake at every
  // rung equals the previous rung's payout — never the seed.
  let stake = BANK_BUILDER_SEED;
  for (const rung of BANK_BUILDER_LADDER) {
    assert.equal(stake, rung.start, `rung ${rung.step} must be entered at $${rung.start}`);
    const odds = requiredAmericanForRung({ stake, goalTarget: rung.goal });
    const p = rungProjection({ stake, americanOdds: odds, goalTarget: rung.goal });
    assert.equal(p.reachesTarget, true, `rung ${rung.step} at ${odds} must reach ${rung.goal}`);
    const s = settleRung({ step: rung.step, stake, payout: p.projectedReturn, legResults: ["won", "won"] });
    if (rung.step < BANK_BUILDER_LADDER.length) {
      assert.equal(s.outcome, "WON");
      stake = s.nextStake;
    } else {
      assert.equal(s.outcome, "COMPLETED");
    }
  }
});
