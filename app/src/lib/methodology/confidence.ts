/**
 * Confidence scoring — DISTINCT from probability. Confidence reflects data quality, feature
 * agreement, and uncertainty, NOT how likely the pick is to hit. Pure.
 */
import type { ConfidenceCategory } from "./types";

export interface ConfidenceComponents {
  dataFreshnessScore: number;      // 0..1
  roleCertaintyScore: number;      // 0..1
  sampleSizeScore: number;         // 0..1
  modelAgreementScore: number;     // 0..1
  marketAgreementScore: number;    // 0..1
  lineupCertaintyScore: number;    // 0..1
  projectionVolatilityPenalty: number; // 0..1 (subtracted, weighted)
  missingCriticalDataPenalty: number;  // 0..1 (subtracted directly)
}

export interface ConfidenceResult {
  score: number; // 0..1 (clamped)
  category: ConfidenceCategory;
  components: ConfidenceComponents;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Weighted confidence score (owner formula):
 *   0.20*freshness + 0.20*role + 0.15*sample + 0.15*modelAgreement
 * + 0.10*marketAgreement + 0.10*lineupCertainty
 * − 0.10*projectionVolatilityPenalty − missingCriticalDataPenalty
 */
export function computeConfidence(c: ConfidenceComponents): ConfidenceResult {
  const raw =
    0.20 * c.dataFreshnessScore +
    0.20 * c.roleCertaintyScore +
    0.15 * c.sampleSizeScore +
    0.15 * c.modelAgreementScore +
    0.10 * c.marketAgreementScore +
    0.10 * c.lineupCertaintyScore -
    0.10 * c.projectionVolatilityPenalty -
    c.missingCriticalDataPenalty;
  const score = clamp01(raw);
  return { score, category: categorize(score, c), components: c };
}

/** Category. A critical-data miss forces No Bet regardless of the numeric score. */
export function categorize(score: number, c: ConfidenceComponents): ConfidenceCategory {
  if (c.missingCriticalDataPenalty >= 0.5) return "No Bet";
  if (score >= 0.7) return "High";
  if (score >= 0.5) return "Medium";
  if (score >= 0.3) return "Low";
  return "No Bet";
}
