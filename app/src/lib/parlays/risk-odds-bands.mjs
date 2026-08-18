/**
 * COMBINED-ODDS BANDS — the boundaries themselves, readable from both TypeScript and node scripts.
 *
 * These lived only in risk-odds-bands.ts, which the cross-sport ladder cannot import: that builder
 * is plain .mjs run by node. The consequence was not a missing import but a SILENT DIVERGENCE — the
 * multi-sport lane labelled its cards by LEG COUNT instead of price, and published a +203 card as
 * "Low risk" when low ends at +100. Three of its four cards were mislabelled and every one of them
 * understated the risk, with the worst case landing on bronze: the smallest bankroll, shown exactly
 * one card, chosen because it is meant to be the calmest.
 *
 * So the numbers live here and risk-odds-bands.ts re-exports them with types. A band moves in one
 * place or it does not move.
 */

/** Non-overlapping combined-odds bands. Low includes its endpoints; the rest are (prev, max]. */
export const PARLAY_ODDS_BANDS = {
  low: { label: "Low Risk", minAmerican: -200, maxAmerican: 100 },
  medium: { label: "Medium Risk", minAmerican: 100, maxAmerican: 300 },
  high: { label: "High Risk", minAmerican: 300, maxAmerican: 600 },
  longshot: { label: "Longshot", minAmerican: 600, maxAmerican: null },
};

/** Individual-leg sanity guards (defaults; the longshot underdog ceiling lifts only for Longshot). */
export const INDIVIDUAL_LEG_ODDS_GUARDS = { minFavoriteAmerican: -500, maxUnderdogAmerican: 1200 };

/**
 * The risk bucket a combined American price belongs to, or null if it is shorter than the Low floor
 * (-200) — too short to be a sensible parlay. Non-overlapping:
 *   Low: -200 <= odds <= +100 · Medium: +100 < odds <= +300 · High: +300 < odds <= +600 · Longshot: > +600
 */
export function getRiskBucketForCombinedOdds(americanOdds) {
  if (!Number.isFinite(americanOdds)) return null;
  if (americanOdds < -200) return null;
  if (americanOdds <= 100) return "low";
  if (americanOdds <= 300) return "medium";
  if (americanOdds <= 600) return "high";
  return "longshot";
}

/** Whether a combined price fits the given bucket exactly (non-overlapping). */
export function isCombinedOddsInRiskBucket(americanOdds, risk) {
  return getRiskBucketForCombinedOdds(americanOdds) === risk;
}
