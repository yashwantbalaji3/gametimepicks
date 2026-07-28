/**
 * decision-ranking — the ONE place that decides how candidate rows are ordered for a user.
 *
 * WHY THIS EXISTS
 * `glossary.ts` has told users, in writing, that confidence tiers are anti-predictive and that
 * confidence "does not up-weight a pick until re-validated." The code did the opposite: at least ten
 * scoring functions added claimed edge or a confidence tier as a POSITIVE term. Measured across the
 * 22,155-row settled ledger, both are inverted:
 *
 *   claimed edge   <2.5pp .5203 · 2.5-5 .5040 · 5-10 .5100 · 10-20 .4754 · 20+ .4317   (n=21,192)
 *   confidence     High   .4934 · Medium .5063 · Low   .5172                            (n=21,192)
 *
 * Confidence is not a second signal — 90.8% of rows are a deterministic relabelling of the same edge
 * buckets. So a surface that ranks by either is steering readers toward the worst-performing rows.
 *
 * WHAT THIS IS NOT
 * This is NOT a better ranking. Nothing here has been shown to out-predict anything, and no claim of
 * improvement may be attached to it. The honest description is narrow and exact:
 *
 *     a historically harmful weighting factor was removed.
 *
 * The replacement ordering is deliberately boring and evidence-shaped — probability, then how much
 * data stands behind the row, then how fresh it is. Each factor is either measured from settled
 * history (market reliability) or is a plain property of the artifact (sample count, capture time).
 * None of them is a claim about who is right.
 *
 * WHAT REMAINS ALLOWED
 * Edge and confidence stay fully VISIBLE — on rows, in historical reporting, and in the model audit.
 * Sprint 035 removes them from ORDERING and ELIGIBILITY, not from sight. Hiding the evidence that the
 * model is anti-calibrated would be the opposite of the point.
 */

import { anyModeledMarketBeatsMarket } from "../mlb/model-calibration-status";

/**
 * Inputs a surface may legitimately rank on.
 *
 * Every field is either a plain artifact property or a measurement from settled history. There is
 * deliberately NO field for a model-minus-market difference — the type makes the harmful signal
 * unrepresentable rather than merely discouraged.
 */
export interface RankableRow {
  /** Stable identity. Used as the final tiebreak so ordering is deterministic across builds. */
  readonly id: string;
  /** The model's own probability for the side being shown. Null when the model abstained. */
  readonly modelProbability: number | null;
  /**
   * Per-market weight measured from SETTLED history (e.g. batter hits ~.54 vs total bases ~.44).
   * This is a retrospective fact about a market, not a forward claim about a row. Defaults to 1.
   */
  readonly marketReliability?: number | null;
  /** How many observations back the projection. More data ranks higher, all else equal. */
  readonly sampleCount?: number | null;
  /** True when the artifact is complete rather than degraded/padded. */
  readonly isComplete?: boolean | null;
  /** Event start. Used for availability (pregame only) and as a freshness tiebreak. */
  readonly startsAtMs?: number | null;
}

/** Weights. Kept flat and few on purpose — a complicated blend invites the same failure again. */
const PROBABILITY_WEIGHT = 1;
const COMPLETENESS_BONUS = 0.05;
/** Sample contribution saturates: 40 observations is not 4x better than 10. */
const SAMPLE_WEIGHT = 0.04;
const SAMPLE_SATURATION = 25;

/**
 * Score one row.
 *
 * `marketReliability × modelProbability` is the spine: a market that has historically graded well
 * carries its model probability further than one that has not. Completeness and sample size are
 * small additive nudges, not a second opinion.
 */
export function evidenceScore(row: RankableRow): number {
  const p = typeof row.modelProbability === "number" && Number.isFinite(row.modelProbability)
    ? row.modelProbability
    : 0;
  const rel = typeof row.marketReliability === "number" && Number.isFinite(row.marketReliability)
    ? row.marketReliability
    : 1;

  let score = rel * p * PROBABILITY_WEIGHT;
  if (row.isComplete === true) score += COMPLETENESS_BONUS;

  const n = typeof row.sampleCount === "number" && Number.isFinite(row.sampleCount) ? row.sampleCount : 0;
  if (n > 0) score += Math.min(n, SAMPLE_SATURATION) / SAMPLE_SATURATION * SAMPLE_WEIGHT;

  return Math.round(score * 1e6) / 1e6;
}

/**
 * Order rows for presentation. Highest evidence score first; ties broken by sample size, then by the
 * earlier event, then by id so two builds of the same slate never disagree.
 */
export function rankByEvidence<T extends RankableRow>(rows: ReadonlyArray<T>): T[] {
  return [...rows].sort((a, b) => {
    const d = evidenceScore(b) - evidenceScore(a);
    if (d !== 0) return d;
    const sa = a.sampleCount ?? 0;
    const sb = b.sampleCount ?? 0;
    if (sb !== sa) return sb - sa;
    const ta = a.startsAtMs ?? Number.MAX_SAFE_INTEGER;
    const tb = b.startsAtMs ?? Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * May a surface use a model-vs-market difference to ORDER or GATE rows?
 *
 * False for every MLB market today and expected to stay false until a market clears the launch gate
 * in `v2-candidate-gates.ts`. Wired to the calibration status rather than hardcoded so that a market
 * which genuinely re-validates re-enables ranking automatically — and so that flipping this on
 * requires changing the calibration verdict, which is the only thing that should be able to.
 */
export function mayRankByModelMarketGap(): boolean {
  return anyModeledMarketBeatsMarket();
}

/**
 * The sentence a surface should show when asked why ordering changed. Deliberately makes no claim of
 * improvement — it states a removal, which is the only thing that actually happened.
 */
export const RANKING_BASIS_NOTE =
  "Ordered by model probability, market reliability from settled results, and how much data stands behind each row. Historical model-vs-market difference is shown but no longer affects ordering — on settled results, larger differences performed worse.";
