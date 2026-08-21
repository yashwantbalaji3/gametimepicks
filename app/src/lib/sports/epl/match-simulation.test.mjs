/**
 * EPL unified match-simulation guards.
 *
 * The property these protect is the reason the module exists: the eleven must sum to the team. That
 * was NOT true of the two independent models it replaces — 0.7x on one side of a fixture and 1.4x on
 * the other — and it was invisible until someone did the arithmetic by hand.
 *
 * Run: npx tsx --test src/lib/sports/epl/match-simulation.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { scoringShares, allocateGoals, coherenceRatio, simulateMatch } from "./match-simulation.mjs";

/** Poisson pmf over 0..maxK, so a test can build a realistic team goal curve. */
const poisson = (lam, maxK = 10) => {
  const out = [];
  let fact = 1;
  for (let k = 0; k <= maxK; k++) {
    if (k > 0) fact *= k;
    out.push(Math.exp(-lam) * Math.pow(lam, k) / fact);
  }
  return out;
};
const eleven = (rates) => rates.map((r, i) => ({ playerId: `p${i}`, rate: r }));

test("COHERENCE IS STRUCTURAL — the eleven sum to the team, exactly", () => {
  /*
   * The defect this module replaces, in one assertion. Two independent models produced 2.33 team
   * goals against 1.61 player goals on the same side. Here it must be 1.0 to floating-point error,
   * for any rate spread, because the shares sum to one.
   */
  for (const lam of [0.4, 0.91, 2.33, 4.0]) {
    for (const rates of [[0.3, 0.2, 0.1, 0.05, 0.05, 0.02, 0.02, 0.01, 0.01, 0.01, 0.0],
                         [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
                         [0.9, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]]) {
      const dist = poisson(lam);
      const alloc = allocateGoals(dist, eleven(rates));
      const ratio = coherenceRatio(dist, alloc);
      assert.ok(Math.abs(ratio - 1) < 1e-6, `lambda ${lam}: coherence ${ratio} — the eleven must sum to the team`);
    }
  }
});

test("a stronger side gives its players higher probabilities — the whole point of allocating", () => {
  /*
   * The old player model regressed both sides toward the league middle. Identical players on a 2.33
   * side and a 0.91 side must NOT come out the same.
   */
  const rates = eleven([0.3, 0.2, 0.15, 0.1, 0.05, 0.05, 0.03, 0.03, 0.02, 0.02, 0.01]);
  const strong = allocateGoals(poisson(2.33), rates);
  const weak = allocateGoals(poisson(0.91), rates);
  for (let i = 0; i < rates.length; i++) {
    assert.ok(strong[i].probability > weak[i].probability,
      `player ${i}: ${strong[i].probability} on the strong side must exceed ${weak[i].probability} on the weak one`);
  }
  assert.ok(strong[0].probability > 0.35 && strong[0].probability < 0.75, "the best striker on a 2.33 side lands in a believable band");
});

test("shares are relative, so the same player moves with the company he keeps", () => {
  const alone = scoringShares(eleven([0.3, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]));
  const crowded = scoringShares(eleven([0.3, 0.3, 0.3, 0.3, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]));
  assert.ok(alone[0].share > crowded[0].share, "a lone threat takes a bigger share than one of four");
  for (const s of [alone, crowded]) {
    assert.ok(Math.abs(s.reduce((t, p) => t + p.share, 0) - 1) < 1e-9, "shares are a distribution");
  }
});

test("the whole team distribution is summed, never just its mean", () => {
  /*
   * P(scores) is concave in the team total, so plugging in E[goals] OVERSTATES it — Jensen's
   * inequality — and the error grows exactly where the distribution is widest. Pinned by comparing
   * against the shortcut the implementation must not take.
   */
  const lam = 2.33, share = 0.25;
  const dist = poisson(lam);
  const proper = allocateGoals(dist, eleven([share, ...Array(10).fill((1 - share) / 10)]))[0].probability;
  const shortcut = 1 - Math.pow(1 - share, lam);
  assert.ok(proper < shortcut, `summing the distribution (${proper.toFixed(4)}) must be below the mean shortcut (${shortcut.toFixed(4)})`);
});

test("an eleven with no scoring history ABSTAINS rather than sharing goals equally", () => {
  /*
   * Splitting a team total evenly across eleven unknown players would be inventing a claim about
   * eleven specific human beings. Null, and the caller must abstain.
   */
  assert.equal(scoringShares(eleven(Array(11).fill(0))), null);
  assert.equal(allocateGoals(poisson(1.5), eleven(Array(11).fill(0))), null);
});

test("weightFloor lifts a zero-rate player off exactly zero without disturbing coherence", () => {
  const rates = eleven([0.3, 0.2, 0.1, 0, 0, 0, 0, 0, 0, 0, 0]);
  const dist = poisson(1.8);
  const noFloor = allocateGoals(dist, rates, { weightFloor: 0 });
  const floored = allocateGoals(dist, rates, { weightFloor: 0.01 });
  assert.equal(noFloor[3].probability, 0, "with no floor a never-scored player reads exactly 0.0%");
  assert.ok(floored[3].probability > 0, "the floor gives him a small, honest share");
  assert.ok(Math.abs(coherenceRatio(dist, floored) - 1) < 1e-6, "and coherence still holds exactly");
});

test("simulateMatch produces both sides from the SAME distributions the team markets use", () => {
  const out = simulateMatch({
    teamGoalDistributions: { home: poisson(2.33), away: poisson(0.91) },
    lineups: {
      home: eleven([0.3, 0.2, 0.15, 0.1, 0.05, 0.05, 0.03, 0.03, 0.02, 0.02, 0.01]),
      away: eleven([0.15, 0.1, 0.08, 0.05, 0.03, 0.03, 0.02, 0.02, 0.01, 0.01, 0.01]),
    },
  });
  assert.equal(out.home.length, 11);
  assert.equal(out.away.length, 11);
  for (const side of ["home", "away"]) {
    assert.ok(Math.abs(out.coherence[side] - 1) < 1e-6, `${side} must be coherent`);
  }
  assert.ok(out.home[0].probability > out.away[0].probability, "the stronger side's best scorer is likelier");
});

test("a missing lineup yields nothing for that side, never a guess", () => {
  const out = simulateMatch({
    teamGoalDistributions: { home: poisson(1.5), away: poisson(1.2) },
    lineups: { home: eleven([0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]), away: [] },
  });
  assert.ok(out.home);
  assert.equal(out.away, null, "no eleven means no claim about that side");
});
