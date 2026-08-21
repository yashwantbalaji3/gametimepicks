/**
 * EPL UNIFIED MATCH SIMULATION — one match, every market, no disagreement possible.
 *
 * THE DEFECT THIS REPLACES. The team model and the player model were independent fits and they
 * contradicted each other about the same match: on Arsenal v Coventry the team model expected 2.33
 * goals from Arsenal while the summed player rates implied 1.61 (0.7x), and for Coventry 0.91 against
 * 1.30 (1.4x). Opposite directions, same fixture, both numbers published. A reader could find that
 * with arithmetic.
 *
 * ALLOCATION, NOT SAMPLING. The team's goal distribution is already exact — a Poisson score matrix —
 * so nothing here draws random numbers. Each goal a team scores is allocated to one of its eleven
 * independently, with probability equal to that player's SHARE of the eleven's fitted scoring rate:
 *
 *     P(player i scores at least once) = 1 - SUM_k P(team scores k) * (1 - w_i)^k
 *
 * That is closed form, so the product keeps the property that makes it honest — nothing is sampled,
 * so there is no run count to quote and the same fixture returns the same numbers forever.
 *
 * COHERENCE IS STRUCTURAL, NOT CHECKED. E[goals by player i] = w_i * E[team goals], and the shares
 * sum to one, so the eleven sum to the team's expected goals by construction. The old gap cannot
 * recur unless the arithmetic itself is wrong — which is what the guards assert.
 *
 * WHAT THIS DOES NOT DO, stated so it cannot be overclaimed. There is no minute-by-minute state, no
 * in-play scoreline effect, no red cards, no substitution modelling. And it governs GOALS ONLY:
 * shots on goal are not constrained by the scoreline and have no team-level model to allocate from,
 * so that market is produced exactly as before and is untouched by any of this.
 */

export const EPL_MATCH_SIM_VERSION = 1;

/**
 * Each player's share of his side's scoring.
 *
 * `weightFloor` stops an eleven containing a never-scored player from handing him a share of exactly
 * zero — which would publish "0.0%" as though it were a measurement rather than an absence of one.
 * It is a declared hyperparameter, swept on development only.
 *
 * @param {Array<{playerId: string, rate: number}>} players one side's eleven, with fitted rates
 */
export function scoringShares(players, { weightFloor = 0 } = {}) {
  const floored = (players ?? []).map((p) => ({ ...p, rate: Math.max(Number(p.rate ?? 0), weightFloor) }));
  const total = floored.reduce((s, p) => s + p.rate, 0);
  /*
   * A side whose every rate is zero has no basis for allocation. Sharing the goals equally would be
   * inventing a claim about eleven specific people, so the shares are null and the caller must
   * abstain — the same stance the rest of this codebase takes toward a missing input.
   */
  if (!(total > 0)) return null;
  return floored.map((p) => ({ ...p, share: p.rate / total }));
}

/**
 * P(at least one goal) for each player, given the side's own goal distribution.
 *
 * @param {number[]} teamGoalDistribution P(team scores exactly k) for k = 0,1,2,...
 * @param {Array<{playerId: string, rate: number}>} players
 */
/**
 * The distribution every function here must agree on.
 *
 * TWO REASONS THIS IS SHARED RATHER THAN INLINE, and the second one is embarrassing.
 *
 * First: a truncated curve — anything stopping at a finite goal count — sums to slightly under 1,
 * and the shortfall lands directly on a zero-share player, giving P(scores) = 1 - SUM d[k], a small
 * POSITIVE number for a man the model says will never score. Tiny, and still a fabricated claim
 * about a named person.
 *
 * Second: allocateGoals normalised and coherenceRatio did not, so the two disagreed about the team's
 * expected goals and the coherence property came out at 1.000033 instead of 1. In a module whose
 * entire purpose is stopping two computations of one quantity from drifting apart, I wrote two
 * computations of one quantity that drifted apart. They share this now.
 *
 * A curve that is badly wrong is REFUSED rather than rescued: silently normalising 0.6 up to 1 turns
 * a caller's bug into a confident answer.
 */
export function normalisedDistribution(raw) {
  const d = raw ?? [];
  const mass = d.reduce((s, v) => s + v, 0);
  if (!(mass > 0.99 && mass < 1.01)) return null;
  return mass === 1 ? d : d.map((v) => v / mass);
}

export function allocateGoals(teamGoalDistribution, players, { weightFloor = 0 } = {}) {
  const shares = scoringShares(players, { weightFloor });
  if (!shares) return null;
  const dist = normalisedDistribution(teamGoalDistribution);
  if (!dist) return null;

  return shares.map((p) => {
    /*
     * Sum over the team's whole goal distribution rather than plugging in its mean. Using E[goals]
     * would be Jensen's inequality waiting to happen: the probability of scoring is concave in the
     * team total, so the mean overstates it, and the error grows exactly where the distribution is
     * widest — the high-scoring fixtures a reader is most likely to look at.
     */
    let pNone = 0;
    for (let k = 0; k < dist.length; k++) pNone += dist[k] * Math.pow(1 - p.share, k);
    const expected = p.share * dist.reduce((s, d, k) => s + d * k, 0);
    return {
      playerId: p.playerId,
      share: Number(p.share.toFixed(6)),
      probability: Number((1 - pNone).toFixed(6)),
      /*
       * NOT rounded. This is the term the coherence property is computed from, and rounding eleven
       * small numbers to six places moved the ratio to 1.0000025 on a low-scoring side — a guard
       * failure that was measuring my own rounding rather than any real incoherence. Rounding is a
       * display concern and belongs at the display.
       */
      expectedGoals: expected,
    };
  });
}

/**
 * The coherence property, computed so it can be ASSERTED rather than assumed.
 *
 * Returns the ratio of summed player expected goals to the team's expected goals. It must be 1 to
 * floating-point error; anything else means the allocation arithmetic is broken, not that the model
 * is weak, and the caller should refuse rather than publish.
 */
export function coherenceRatio(teamGoalDistribution, allocated) {
  /* The SAME normalisation allocateGoals used — see normalisedDistribution for why that matters. */
  const dist = normalisedDistribution(teamGoalDistribution);
  if (!dist) return null;
  const teamExpected = dist.reduce((s, d, k) => s + d * k, 0);
  if (!(teamExpected > 0)) return null;
  const playerExpected = (allocated ?? []).reduce((s, p) => s + p.expectedGoals, 0);
  return playerExpected / teamExpected;
}

/**
 * Simulate one fixture end to end: both sides' player goal probabilities, from the SAME team
 * distributions the team markets are published from.
 *
 * @param {{ home: number[], away: number[] }} teamGoalDistributions each side's own goal curve
 * @param {{ home: Array, away: Array }} lineups each side's eleven with fitted rates
 */
export function simulateMatch({ teamGoalDistributions, lineups }, { weightFloor = 0 } = {}) {
  const out = { home: null, away: null, coherence: { home: null, away: null } };
  for (const side of ["home", "away"]) {
    const dist = teamGoalDistributions?.[side];
    const players = lineups?.[side];
    if (!dist?.length || !players?.length) continue;
    const allocated = allocateGoals(dist, players, { weightFloor });
    if (!allocated) continue;
    out[side] = allocated;
    out.coherence[side] = coherenceRatio(dist, allocated);
  }
  return out;
}
