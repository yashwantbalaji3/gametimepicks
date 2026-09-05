/**
 * WHAT PUBLICATION CONSISTS OF — Program 234 · Release A.
 *
 * P233 replaced a state-name test (`r.state === "READY"`, a state the producer has never emitted)
 * with `Boolean(r.probs)`, on the correct principle that publication is the presence of the numbers
 * rather than a label. This narrows the remaining hole in that principle: a truthy object is not a
 * forecast. `{}`, `{ home: null }`, and `{ home: NaN, draw: NaN, away: NaN }` are all truthy, and
 * each would have reported a fixture as PUBLISHED while the public page had nothing to print.
 *
 * That failure mode is not hypothetical in this codebase — a request de-duplicator once returned a
 * truthy object where a boolean was expected, and every caller read it as "yes". The shape of the
 * bug is the same: the test asked whether something was there, not whether it was the thing.
 *
 * So a fixture is published when the set is public AND its row carries a three-outcome distribution
 * that a reader could actually be shown: three finite numbers in [0, 1] that sum to one. All 54
 * probability-carrying rows this repository has committed satisfy it (observed sums span
 * 0.999999–1.000001, hence the tolerance); all 28 withheld rows fail it, as they must.
 *
 * Deliberately NOT checked here: whether the numbers reached the reader BEFORE kickoff. That is a
 * separate dimension and it already has an owner — `classifyEvent` returns STARTED before it ever
 * considers `published`, so a post-start regeneration cannot be typed PUBLISHED. Duplicating the
 * check here would fail honest rows carried forward after kickoff, which is the guard-deletes-itself
 * pattern this repository keeps re-learning.
 *
 * Pure module (no fs, no network) so the builder script and its tests share one rule.
 */

/** Sum tolerance. Wide enough for the producer's 6-dp rounding, far too tight to admit a stub. */
export const PROBABILITY_SUM_TOLERANCE = 1e-3;

const isUnitNumber = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

/**
 * Does this row carry a three-outcome distribution a reader could be shown?
 * @param {{ home?: unknown, draw?: unknown, away?: unknown } | null | undefined} probs
 * @returns {boolean}
 */
export function carriesPublishableProbabilities(probs) {
  if (!probs || typeof probs !== "object") return false;
  const { home, draw, away } = /** @type {Record<string, unknown>} */ (probs);
  if (!isUnitNumber(home) || !isUnitNumber(draw) || !isUnitNumber(away)) return false;
  return Math.abs(home + draw + away - 1) <= PROBABILITY_SUM_TOLERANCE;
}
