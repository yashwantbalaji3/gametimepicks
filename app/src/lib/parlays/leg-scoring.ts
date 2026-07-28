/**
 * Leg quality scoring — a DATA-QUALITY score, not a likelihood score. Blends data quality, sample
 * depth, freshness, market validity, role availability, and risk into 0–100 + a tier.
 *
 * SPRINT 035 — confidence and edge no longer contribute.
 * They previously supplied 50 of the 100 available points (confidence up to 30, edge up to 20), and
 * both are INVERTED on the 22,155-row settled ledger: "High" confidence hit .4934 vs "Low" .5172,
 * and 20+pp edge hit .4317 vs .5203 under 2.5pp. Confidence is not an independent signal either —
 * 90.8% of rows are a deterministic relabelling of the same edge buckets. `glossary.ts` already told
 * users confidence "does not up-weight a pick until re-validated"; this file is where that promise
 * was being broken.
 *
 * The freed weight went to the terms that describe EVIDENCE rather than predict outcome. This is a
 * removal of a harmful factor, not a better score — no claim of improvement attaches to it.
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

  // The surviving evidence terms keep their ORIGINAL absolute weights, so their ordering relative to
  // one another is untouched — this change removes two terms, it does not re-tune the rest. Dropping
  // confidence (30) and edge (20) lowers the maximum from 105 to 55, so the total is renormalised back
  // onto 0-100 and the tier thresholds keep their meaning. Renormalising rather than hand-picking new
  // weights avoids smuggling in a fresh, untested opinion about what matters.
  const dq = { A: 20, B: 14, C: 8, D: 3, unavailable: 0 }[inp.dataQualityGrade] ?? 0;
  const freshness = inp.staleCritical ? 0 : 10;
  const sample = inp.smallSample ? 3 : 10;
  const marketValidity = inp.hasOdds && !inp.marketScopeUnknown ? 10 : 0;
  const roleOpp = inp.dnpRisk ? 0 : 5;
  const riskPenalty = inp.riskScore * 20;

  const MAX_EVIDENCE_POINTS = 20 + 10 + 10 + 10 + 5; // 55
  const raw = dq + freshness + sample + marketValidity + roleOpp - riskPenalty;
  let score = Math.max(0, Math.min(100, Math.round((raw / MAX_EVIDENCE_POINTS) * 100)));

  let tier: LegQualityTier =
    score >= 78 ? "elite" : score >= 62 ? "strong" : score >= 45 ? "playable" : score >= 25 ? "thin" : "ineligible";

  // Honesty caps.
  if (inp.dataQualityGrade === "D" || inp.dataQualityGrade === "unavailable") {
    tier = capTier(tier, "playable");
    reasons.push("data quality D/unavailable caps quality at playable");
  }
  // Sprint 035: the cap that penalised a leg for having no model-vs-market difference is removed.
  // Penalising "no gap" is the same as rewarding "big gap", and big gaps performed worst.
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
