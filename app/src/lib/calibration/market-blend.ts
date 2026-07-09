/**
 * MARKET BLEND — the convex blend of a market baseline with a model signal, and the top-level
 * `calibrate()` that ties reliability + blend together.
 *
 * Pure, side-effect-free, unwired (scaffolding — see the folder note in types.ts). Nothing here reads
 * artifacts, touches money, or changes a public recommendation.
 */
import type { CalibrationInput, CalibratedResult } from "./types";
import { clamp01, reliabilityWeight } from "./reliability";

/**
 * Convex blend of a market and model probability by weight w:
 *   w = 0 ⇒ pure market, w = 1 ⇒ pure model. All inputs and the result are clamped to [0,1].
 */
export function blendProbabilities(marketProb: number, modelProb: number, weight: number): number {
  const w = clamp01(weight);
  const m = clamp01(marketProb);
  const mod = clamp01(modelProb);
  return clamp01(m * (1 - w) + mod * w);
}

/**
 * Calibrate one input into a market-anchored, model-adjusted probability.
 *
 * The market probability is the anchor. If a model probability exists, it is blended in by the learned
 * reliability weight (discounted by data quality). With no usable model — or zero reliability — the
 * result is exactly the market, edge 0. This guarantees the calibration can only ever *nudge* off the
 * market by as much as the model has earned; it can never invent an edge from nothing.
 */
export function calibrate(input: CalibrationInput): CalibratedResult {
  const market = clamp01(input.marketProbability);
  // Inline the `!= null` narrowing so TS knows modelProbability is a number in the true branch.
  const model =
    input.modelProbability != null && Number.isFinite(input.modelProbability)
      ? clamp01(input.modelProbability)
      : null;
  const w = reliabilityWeight(input);
  const calibrated = model != null ? blendProbabilities(market, model, w) : market;
  return {
    calibratedProbability: calibrated,
    marketProbability: market,
    modelProbability: model,
    reliabilityWeight: w,
    edge: calibrated - market,
    usedModel: model != null && w > 0,
  };
}
