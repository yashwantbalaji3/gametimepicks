/**
 * Calibration scaffolding — pure, tested, and DELIBERATELY UNWIRED. A hybrid "market baseline + model
 * signal + learned reliability" blend proposed in docs/METHODOLOGY_UPGRADE_AUDIT_2026-07-09.md. It is
 * not imported by any public recommendation path; wiring it requires a founder-approved, backtested
 * rollout (calibration.test.mjs enforces the unwired invariant).
 */
export type {
  DataQuality,
  ProbabilitySource,
  MarketProbability,
  CalibrationInput,
  CalibratedResult,
} from "./types";
export { clamp01, dataQualityFactor, reliabilityWeight } from "./reliability";
export { blendProbabilities, calibrate } from "./market-blend";
