/**
 * P245 · THE ONE COHERENCE RULE for a published NFL forecast's win side vs its margin median.
 *
 * Derivation (supersedes P244's 3σ patch, whose binomial argument did not apply to an ANALYTIC
 * probability): both heads are monotone in the same Elo difference d and cross at d = 0
 * (marginMean = slope·d; logistic(d) = ½). The favourite is pHome vs pAway — comparing pHome to
 * 0.5 mislabels a clear favourite whenever tie mass scales the logistic down (BAL @ IND: d ≈ +11
 * Elo, pHome 0.4997, pAway 0.4683). A genuine DIRECTION conflict is reachable only inside the
 * sampled median's own width around the shared crossover (≈0.17 pts sampling + ±0.5 integer
 * snap), so |median| ≤ 1 may straddle zero honestly; |median| ≥ 2 with the favourite on the
 * other side is a real contradiction.
 */
export const MEDIAN_SNAP_BAND = 1; // |median| ≤ this may straddle the crossover honestly

/** @returns true when the pair is publishable; false = a material direction conflict. */
export function coherentDirection({ medMargin, pHome, pAway }) {
  if (Math.abs(medMargin) <= MEDIAN_SNAP_BAND) return true;
  if (medMargin > 0 && pHome < pAway) return false;
  if (medMargin < 0 && pHome > pAway) return false;
  return true;
}
