/**
 * Leg quality scoring — SEPARATE from confidence. Quality blends confidence, edge, risk, data
 * quality, sample, freshness, market validity, and the sport's extractor status into 0–100 + a tier.
 * Honesty caps prevent a high-edge/bad-data or high-confidence/no-edge leg from reading "elite".
 */
import type { EligibleLeg, LegQualityTier } from "./types";

export interface LegQualityInput {
  confidenceTier: EligibleLeg["confidenceTier"];
  riskScore: number;
  dataQualityGrade: EligibleLeg["dataQualityGrade"];
  edge: number | null;
  marketAware: boolean;
  hasOdds: boolean;
  marketScopeUnknown: boolean;
  staleCritical: boolean;
  missingCritical: boolean;
  smallSample: boolean;
  dnpRisk: boolean;
  baseEligible: boolean; // leakage ok, not No Bet, not started, extractor wired, etc.
}

const TIER_ORDER: LegQualityTier[] = ["ineligible", "thin", "playable", "strong", "elite"];
function capTier(tier: LegQualityTier, max: LegQualityTier): LegQualityTier {
  return TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(max) ? max : tier;
}

export function scoreLeg(inp: LegQualityInput): { score: number; tier: LegQualityTier; reasons: string[] } {
  const reasons: string[] = [];
  if (!inp.baseEligible || inp.confidenceTier === "No Bet") {
    return { score: 0, tier: "ineligible", reasons: ["base-ineligible or No Bet"] };
  }

  const conf = { High: 30, Medium: 18, Low: 8, "No Bet": 0 }[inp.confidenceTier] ?? 0;
  const dq = { A: 20, B: 14, C: 8, D: 3, unavailable: 0 }[inp.dataQualityGrade] ?? 0;
  const edgeComp = inp.marketAware
    ? Math.min(15, Math.max(0, inp.edge ?? 0)) / 15 * 20
    : 10; // no-market: neutral edge credit
  const freshness = inp.staleCritical ? 0 : 10;
  const sample = inp.smallSample ? 3 : 10;
  const marketValidity = inp.hasOdds && !inp.marketScopeUnknown ? 10 : 0;
  const roleOpp = inp.dnpRisk ? 0 : 5;
  const riskPenalty = inp.riskScore * 20;

  let score = conf + dq + edgeComp + freshness + sample + marketValidity + roleOpp - riskPenalty;
  score = Math.max(0, Math.min(100, Math.round(score)));

  let tier: LegQualityTier =
    score >= 78 ? "elite" : score >= 62 ? "strong" : score >= 45 ? "playable" : score >= 25 ? "thin" : "ineligible";

  // Honesty caps.
  if (inp.dataQualityGrade === "D" || inp.dataQualityGrade === "unavailable") {
    tier = capTier(tier, "playable");
    reasons.push("data quality D/unavailable caps quality at playable");
  }
  if (inp.marketAware && (inp.edge == null || inp.edge <= 0)) {
    tier = capTier(tier, "strong");
    reasons.push("no positive edge caps quality at strong");
  }
  if (inp.staleCritical) {
    tier = capTier(tier, "playable");
    reasons.push("stale critical input caps quality at playable");
  }
  if (inp.marketScopeUnknown) {
    tier = capTier(tier, "thin");
    reasons.push("unknown market scope caps quality at thin");
  }
  return { score, tier, reasons };
}
