/**
 * CALIBRATION TYPES — the shape of a hybrid "market baseline + model signal + learned reliability"
 * probability. SCAFFOLDING ONLY: these types and the pure functions in this folder are NOT wired into
 * any public recommendation (see calibration.test.mjs, which fails if anything under src/ outside this
 * folder imports it). They exist so the proposed upgrade in
 * docs/METHODOLOGY_UPGRADE_AUDIT_2026-07-09.md is concrete and testable before any founder-approved,
 * backtested rollout.
 */

/** How much we trust the data behind a probability — drives the reliability discount. */
export type DataQuality = "high" | "medium" | "thin" | "unavailable";

/** Where a probability came from. */
export type ProbabilitySource = "no-vig-market" | "model" | "simulation" | "calibrated";

/** A single probability with provenance (e.g. the de-vigged market line, or a model/sim output). */
export interface MarketProbability {
  /** Market key, e.g. "batter_hits" / "moneyline_90". */
  market: string;
  /** Probability in [0,1]. */
  probability: number;
  source: ProbabilitySource;
  /** Settled sample the number is calibrated against (when known). */
  sampleSize?: number;
  dataQuality?: DataQuality;
}

/** The inputs a calibration needs to blend a market baseline with an optional model signal. */
export interface CalibrationInput {
  /** The de-vigged MARKET baseline probability in [0,1] — the anchor. */
  marketProbability: number;
  /** The model / simulation probability in [0,1], when one exists. Absent ⇒ no blend. */
  modelProbability?: number;
  /** Market key, e.g. "batter_hits". */
  marketType: string;
  sport: "MLB" | "SOCCER";
  /**
   * Learned reliability for this marketType in [0,1] (from settled model-performance data — e.g. the
   * `reliabilityWeight` column emitted by scripts/audit-mlb-calibration.mjs). 0.5 = neutral / coin
   * flip. Absent ⇒ treated as neutral 0.5.
   */
  historicalReliability?: number;
  dataQuality: DataQuality;
}

/** The result of a calibration — a blended probability plus the provenance to explain it. */
export interface CalibratedResult {
  /** The blended probability, clamped to [0,1]. Equals the market when no usable model. */
  calibratedProbability: number;
  /** The market baseline it was anchored to (clamped). */
  marketProbability: number;
  /** The model probability actually used (clamped), or null when none. */
  modelProbability: number | null;
  /** The weight in [0,1] applied to the model (0 ⇒ pure market). */
  reliabilityWeight: number;
  /** calibratedProbability − marketProbability. */
  edge: number;
  /** True only when a model probability existed AND carried positive weight. */
  usedModel: boolean;
}
