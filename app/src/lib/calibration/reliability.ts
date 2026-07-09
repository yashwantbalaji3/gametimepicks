/**
 * RELIABILITY — how much weight to give the MODEL over the MARKET for one calibration input.
 *
 * Pure, side-effect-free, unwired (scaffolding — see the folder note in types.ts). The core principle
 * from the methodology audit: the market is the baseline; the model only earns weight where it has
 * PROVEN signal AND the data behind this specific input is strong. A missing model earns zero weight —
 * we never blend a phantom.
 */
import type { CalibrationInput } from "./types";

/** Clamp to [0,1]; non-finite ⇒ 0. */
export function clamp01(x: number): number {
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

/** Data-quality multiplier — thin data sharply discounts the model; unavailable kills it. */
export function dataQualityFactor(q: CalibrationInput["dataQuality"]): number {
  switch (q) {
    case "high": return 1;
    case "medium": return 0.7;
    case "thin": return 0.35;
    case "unavailable": return 0;
    default: return 0;
  }
}

/**
 * The reliability weight in [0,1] applied to the model probability.
 *
 *   • No model probability ⇒ 0 (never blend a model that doesn't exist).
 *   • Otherwise: learned reliability for the market (default neutral 0.5) × data-quality factor.
 *
 * So a market where the model has proven signal (historicalReliability ~0.65) with high-quality data
 * lands near 0.65; the same market on thin data is heavily discounted; a market with no learned edge
 * (0.5) or bad data defers to the market.
 */
export function reliabilityWeight(input: CalibrationInput): number {
  const hasModel = input.modelProbability != null && Number.isFinite(input.modelProbability);
  if (!hasModel) return 0;
  const base = clamp01(input.historicalReliability ?? 0.5);
  return clamp01(base * dataQualityFactor(input.dataQuality));
}
