/**
 * Combined-parlay odds bands + individual-leg price guards. The single source of truth for which risk
 * bucket a card's COMBINED American odds belong to, and which individual leg prices are allowed — so a
 * card can never sit in a bucket whose payout band it doesn't fit, and extreme-favorite filler legs
 * (e.g. -1000, which barely move the payout) never pad a card. Pure + deterministic → unit-tested.
 */
import type { RiskBucket } from "@/lib/parlays/risk-taxonomy";

/** Non-overlapping combined-odds bands. Low includes its endpoints; the rest are (prev, max]. */
export const PARLAY_ODDS_BANDS: Record<RiskBucket, { label: string; minAmerican: number; maxAmerican: number | null }> = {
  low: { label: "Low Risk", minAmerican: -200, maxAmerican: 100 },
  medium: { label: "Medium Risk", minAmerican: 100, maxAmerican: 300 },
  high: { label: "High Risk", minAmerican: 300, maxAmerican: 600 },
  longshot: { label: "Longshot", minAmerican: 600, maxAmerican: null },
};

/** Individual-leg sanity guards (defaults; the longshot underdog ceiling lifts only for Longshot). */
export const INDIVIDUAL_LEG_ODDS_GUARDS = { minFavoriteAmerican: -500, maxUnderdogAmerican: 1200 };

export type OddsBandRejectReason = "leg_too_short_price" | "leg_too_long_price" | "combined_odds_out_of_bucket";

/**
 * The risk bucket a combined American price belongs to, or null if it's shorter than the Low floor
 * (-200) — too short to be a sensible parlay. Non-overlapping:
 *   Low: -200 ≤ odds ≤ +100 · Medium: +100 < odds ≤ +300 · High: +300 < odds ≤ +600 · Longshot: > +600
 */
export function getRiskBucketForCombinedOdds(americanOdds: number): RiskBucket | null {
  if (americanOdds < -200) return null;
  if (americanOdds <= 100) return "low";
  if (americanOdds <= 300) return "medium";
  if (americanOdds <= 600) return "high";
  return "longshot";
}

/** Whether a combined price fits the given bucket exactly (non-overlapping). */
export function isCombinedOddsInRiskBucket(americanOdds: number, risk: RiskBucket): boolean {
  return getRiskBucketForCombinedOdds(americanOdds) === risk;
}

/**
 * Whether an individual leg's price is allowed. Rejects extreme favorites shorter than -500 (they
 * barely change the payout) and extreme underdogs above +1200 — except a Longshot card may take a
 * larger underdog when model/data quality justifies it (`longshotJustified`).
 */
export function isLegPriceAllowed(americanOdds: number, risk: RiskBucket, longshotJustified = false): boolean {
  if (americanOdds < INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican) return false; // too short (e.g. -1000)
  if (americanOdds > INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican) {
    return risk === "longshot" && longshotJustified; // too long unless an explicitly justified longshot
  }
  return true;
}

/** Reason a leg price is rejected, or null if allowed. */
export function legPriceRejectReason(americanOdds: number, risk: RiskBucket, longshotJustified = false): OddsBandRejectReason | null {
  if (americanOdds < INDIVIDUAL_LEG_ODDS_GUARDS.minFavoriteAmerican) return "leg_too_short_price";
  if (americanOdds > INDIVIDUAL_LEG_ODDS_GUARDS.maxUnderdogAmerican && !(risk === "longshot" && longshotJustified)) return "leg_too_long_price";
  return null;
}
