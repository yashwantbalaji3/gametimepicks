/**
 * MLB calibration → product-eligibility POLICY (single source of truth).
 *
 * A modeled market may be treated as a validated "model advantage" (and thus considered for Bank Builder /
 * Moonshot product legs) ONLY when its calibration verdict is PUBLIC_MODEL_OK — and even then only after the
 * separate freshness / data-quality / lineup / market / founder gates. Every other verdict is research/display
 * only: market-context, never a modeled advantage, never a product leg.
 *
 * The verdicts here are set by the leakage-safe, out-of-sample recalibration experiment
 * (app/scripts/recalibrate-mlb-modeled-markets.mjs → data/internal/mlb/calibration/selected-calibrators.json).
 * Restoring a market to product eligibility requires flipping it to PUBLIC_MODEL_OK here AND a separate
 * founder-approved production mission — never automatically, and never merely because a recalibrated model
 * beats the RAW model (it must beat the de-vigged MARKET out of sample).
 */
export type CalibrationVerdict =
  | "PUBLIC_MODEL_OK"
  | "NEEDS_CAUTION"
  | "MARKET_CONTEXT_ONLY"
  | "INSUFFICIENT_OUT_OF_SAMPLE_DATA"
  | "RECALIBRATION_UNSTABLE";

export interface EligibilityPolicy {
  productEligible: boolean;
  publicModelAdvantage: boolean;
  framing: string;
}

/** The one rule: only PUBLIC_MODEL_OK unlocks (candidate) product eligibility + a public model-advantage claim. */
export function eligibilityFor(verdict: CalibrationVerdict): EligibilityPolicy {
  if (verdict === "PUBLIC_MODEL_OK") {
    return { productEligible: true, publicModelAdvantage: true, framing: "may be considered for modeled product eligibility — still subject to freshness, data-quality, lineup, market, and founder gates" };
  }
  return { productEligible: false, publicModelAdvantage: false, framing: "research / display only — market context, not a modeled advantage, not a product leg" };
}

/**
 * Current verdicts — from the out-of-sample recalibration (2026-07-21). Recalibration fixed the raw model's
 * overconfidence but did NOT beat the de-vigged market on any market, so every one stays non-OK.
 */
export const MLB_MARKET_VERDICT: Record<string, CalibrationVerdict> = {
  pitcher_strikeouts: "INSUFFICIENT_OUT_OF_SAMPLE_DATA", // holdout 197 < 500; walk-forward also selected market-only
  batter_hits: "MARKET_CONTEXT_ONLY",
  batter_total_bases: "MARKET_CONTEXT_ONLY",
  batter_hits_runs_rbis: "MARKET_CONTEXT_ONLY",
};

/** Markets validated to a public model advantage (PUBLIC_MODEL_OK). Empty today — the market wins on all four. */
export function validatedModeledMarkets(): string[] {
  return Object.keys(MLB_MARKET_VERDICT).filter((m) => eligibilityFor(MLB_MARKET_VERDICT[m]).productEligible);
}

/** True when a specific market is a validated, product-eligible modeled advantage. False for all four today. */
export function isProductEligibleModeledMarket(market: string): boolean {
  const v = MLB_MARKET_VERDICT[market];
  return v ? eligibilityFor(v).productEligible : false;
}
