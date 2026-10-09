/**
 * WORLD MODEL V2 — WHAT COUNTS AS A CHANGED INPUT (NFL-005 freshness).
 *
 * The simulation's spreads are derived from the forecast of record's 80% range (p10/p90), and that range comes from the
 * forecast's own 10,000 random draws, so it jitters by about a point whenever the forecast is regenerated, even when
 * nothing about the game changed (01:00Z 2026-10-09: PHI @ JAX margin sigma 13.27 → 13.66 with the same median). Treating
 * that noise as a new input re-simulated games whose inputs had not changed.
 *
 * Rule: the medians must match exactly; a spread is the same input when it moved by less than HEAD_SIGMA_TOLERANCE (a
 * fixed 0.75 points, about twice the observed jitter). When the heads are the same, the previous values are kept,
 * so a run's recorded heads, its key and its simulation always agree.
 */
export const HEAD_SIGMA_TOLERANCE = 0.75;

/** @returns the heads to simulate with: the previous ones when within tolerance, else the new ones. */
export function stableHeads(prev, next) {
  if (!prev) return { heads: next, reused: false };
  const same = prev.mMean === next.mMean && prev.tMean === next.tMean
    && Math.abs(prev.mSigma - next.mSigma) < HEAD_SIGMA_TOLERANCE && Math.abs(prev.tSigma - next.tSigma) < HEAD_SIGMA_TOLERANCE;
  return same ? { heads: { ...prev }, reused: true } : { heads: next, reused: false };
}
