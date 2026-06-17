/**
 * Risk-level definitions for suggested parlays. Each level constrains leg count, the leg-quality
 * tiers allowed, the per-leg risk tier allowed, and correlation tolerance. Never relaxes the base
 * eligibility gates — a No-Bet / leaking / started leg is never allowed at any level.
 */
import type { RiskLevel, LegQualityTier, RiskTier, EligibleLeg } from "./types";

export interface RiskLevelSpec {
  level: RiskLevel;
  minLegs: number;
  maxLegs: number;
  allowedQuality: LegQualityTier[];
  allowedRiskTiers: RiskTier[];
  /** Max acceptable absolute pairwise correlation magnitude (mean) for cross-game cards. */
  maxMeanCorrelation: number;
  allowConflicting: false; // never
}

export const RISK_LEVELS: Record<RiskLevel, RiskLevelSpec> = {
  low: {
    level: "low",
    minLegs: 2, maxLegs: 2,
    allowedQuality: ["elite", "strong"],
    allowedRiskTiers: ["low"],
    maxMeanCorrelation: 0.25,
    allowConflicting: false,
  },
  medium: {
    level: "medium",
    minLegs: 2, maxLegs: 3,
    allowedQuality: ["elite", "strong", "playable"],
    allowedRiskTiers: ["low", "elevated"],
    maxMeanCorrelation: 0.45,
    allowConflicting: false,
  },
  high: {
    level: "high",
    minLegs: 3, maxLegs: 4,
    allowedQuality: ["elite", "strong", "playable"],
    allowedRiskTiers: ["low", "elevated", "high"],
    maxMeanCorrelation: 0.6,
    allowConflicting: false,
  },
  longshot: {
    level: "longshot",
    minLegs: 4, maxLegs: 6,
    allowedQuality: ["elite", "strong", "playable"],
    allowedRiskTiers: ["low", "elevated", "high"],
    maxMeanCorrelation: 0.6,
    allowConflicting: false,
  },
};

export const RISK_LEVEL_ORDER: RiskLevel[] = ["low", "medium", "high", "longshot"];

/** Legs that satisfy a level's quality + risk-tier constraints (still must be base-eligible). */
export function legsForLevel(legs: EligibleLeg[], level: RiskLevel): EligibleLeg[] {
  const spec = RISK_LEVELS[level];
  return legs.filter(
    (l) =>
      l.eligible &&
      spec.allowedQuality.includes(l.legQualityTier) &&
      spec.allowedRiskTiers.includes(l.riskTier),
  );
}
