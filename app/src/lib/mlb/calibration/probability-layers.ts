/**
 * SPRINT 048 — the four probabilities, kept apart on purpose.
 *
 * WHY FOUR
 * Sprint 047 measured that the raw model states ~59% and wins ~50%. Platt scaling, fitted on
 * 2026-05-16..06-25 and scored on 07-01..07-28, improved Brier by 0.0104 out of sample and moved the
 * mean stated probability to 50.08% against an observed 49.84%. It still lost to the de-vigged market
 * by 0.0042.
 *
 * That result is only expressible if the numbers stay separate:
 *
 *   raw        what the model actually produced. NEVER overwritten — it is the evidence.
 *   calibrated raw, corrected by a calibrator fitted on strictly earlier data.
 *   market     the sportsbook's de-vigged probability. The benchmark, not our output.
 *   displayed  what a user sees. Today: calibrated. Recorded explicitly so the choice is auditable.
 *
 * Collapsing these is how a platform ends up unable to answer "did calibration help?" a month later,
 * and how "our probability" quietly becomes "the market's probability with extra steps".
 *
 * WHAT CALIBRATION IS AND IS NOT
 * It makes the stated probability approximately true. It does NOT make the model better at predicting
 * than the market — measured, it is still behind. `calibration-claims.test.mjs` fails the build if
 * user-facing copy in this area starts implying otherwise.
 *
 * Data-only: no I/O, no React, no sport-specific joins beyond MLB's own market names.
 */

/** Fitted Platt parameters. Produced by the model-learning audit; applied, never refitted at runtime. */
export interface PlattParameters {
  readonly a: number;
  readonly b: number;
  /** Rows the fit was trained on — carried so a caller can judge whether to trust it. */
  readonly trainRows: number;
}

export interface CalibratorProvenance {
  readonly method: "platt" | "none";
  /** Dates the calibrator was fitted on. Must end strictly before any row it is applied to. */
  readonly trainedThrough: string | null;
  readonly trainRows: number;
  /** Measured out-of-sample Brier improvement vs the raw model. Negative would mean it made things worse. */
  readonly measuredBrierImprovement: number | null;
  /** True when the calibrated model still scores worse than the de-vigged market. Measured, not assumed. */
  readonly stillBehindMarket: boolean;
}

export interface ProbabilityLayers {
  /** The model's own output. The evidence. Never modified. */
  readonly raw: number;
  /** Raw, corrected. Null when no calibrator applies to this row. */
  readonly calibrated: number | null;
  /** De-vigged sportsbook probability, or null when the market was one-sided. */
  readonly market: number | null;
  /** What the user sees, and which layer it came from. */
  readonly displayed: number;
  readonly displayedSource: "raw" | "calibrated";
  readonly provenance: CalibratorProvenance;
}

const clip = (p: number, eps = 1e-6): number => Math.min(1 - eps, Math.max(eps, p));

/** Apply fitted Platt parameters to a raw probability. Pure; the inverse-logit of a linear map. */
export function applyPlatt(raw: number, { a, b }: PlattParameters): number {
  const logit = Math.log(clip(raw) / (1 - clip(raw)));
  return 1 / (1 + Math.exp(-(a * logit + b)));
}

/**
 * De-vig a two-way market.
 *
 * Null unless both sides are present. A one-sided price cannot be de-vigged, and using it raw would
 * mix a ~6.9%-hold number into a comparison against fair ones — the exact defect Sprint 047 found in
 * the stored calibration corpus.
 */
export function deVigTwoWay(over: number | null | undefined, under: number | null | undefined):
  { over: number; under: number; overround: number } | null {
  if (typeof over !== "number" || typeof under !== "number") return null;
  const sum = over + under;
  if (!(sum > 0)) return null;
  return { over: over / sum, under: under / sum, overround: sum };
}

export interface BuildLayersInput {
  readonly rawProbability: number;
  readonly side: "over" | "under";
  readonly impliedOver?: number | null;
  readonly impliedUnder?: number | null;
  readonly calibrator?: PlattParameters | null;
  readonly provenance: CalibratorProvenance;
}

/**
 * Assemble the four layers for one prediction.
 *
 * When no calibrator is supplied the displayed value falls back to `raw` and says so, rather than
 * silently presenting an uncalibrated number as if it had been corrected.
 */
export function buildProbabilityLayers(input: BuildLayersInput): ProbabilityLayers {
  const raw = input.rawProbability;
  const fair = deVigTwoWay(input.impliedOver, input.impliedUnder);
  const market = fair ? (input.side === "over" ? fair.over : fair.under) : null;

  const calibrated = input.calibrator ? applyPlatt(raw, input.calibrator) : null;
  const useCalibrated = calibrated !== null && input.provenance.method === "platt";

  return {
    raw,
    calibrated,
    market,
    displayed: useCalibrated ? (calibrated as number) : raw,
    displayedSource: useCalibrated ? "calibrated" : "raw",
    provenance: input.provenance,
  };
}

/**
 * The one-sentence description of what calibration did, for display.
 *
 * Deliberately states the limitation in the same breath as the benefit. A caption that mentions only
 * the improvement is technically true and reliably misread, and this is the sentence a user will quote
 * back when deciding whether to trust the number.
 */
export function calibrationDisclosure(p: CalibratorProvenance): string {
  if (p.method === "none") {
    return "These probabilities are the model's raw output and have not been calibrated against settled results.";
  }
  const gain = p.measuredBrierImprovement;
  const gainText = gain == null
    ? "Calibration is applied"
    : `Calibration is applied (measured out-of-sample Brier improvement ${gain.toFixed(4)})`;
  const limit = p.stillBehindMarket
    ? "It makes the stated probability more accurate. It does not mean the model out-predicts the sportsbook — measured on the same rows, it does not."
    : "It makes the stated probability more accurate.";
  return `${gainText} using a calibrator fitted on results through ${p.trainedThrough ?? "an earlier period"} (${p.trainRows.toLocaleString()} rows). ${limit}`;
}
