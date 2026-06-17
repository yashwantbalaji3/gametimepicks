/**
 * Suggested-parlay tracking contracts. EVERY suggested parlay (Bank Builder or not) is trackable.
 * This module builds the tracking record at suggestion time; results are filled in ONLY by an
 * official settlement step later — never fabricated, never settled before the events occur.
 */
import type { SuggestedParlay, RiskLevel, CorrelationType, Sport } from "./types";

export interface ParlayTrackingRecord {
  parlayId: string;
  date: string;
  sport: Sport | "MIXED";
  riskLevel: RiskLevel;
  parlayType: "cross_game" | "same_game";
  sameGameFlag: boolean;
  crossGameFlag: boolean;
  numberOfLegs: number;
  marketsIncluded: string[];
  correlationType: CorrelationType | "neutral";
  correlationScore: number;
  combinedOdds: number | null;
  estimatedHitProbability: number | null;
  // Result fields are null until an official settlement step fills them in.
  actualResult: "won" | "lost" | "push" | "pending" | null;
  legsHit: number | null;
  legsLost: number | null;
  legsVoid: number | null;
  parlayHit: boolean | null;
  modelVersion: string;
  createdAt: string | null;
  settledAt: string | null;
}

export function toTrackingRecord(p: SuggestedParlay): ParlayTrackingRecord {
  return {
    parlayId: p.parlayId,
    date: p.date,
    sport: p.sport,
    riskLevel: p.riskLevel,
    parlayType: p.parlayType,
    sameGameFlag: p.parlayType === "same_game",
    crossGameFlag: p.parlayType === "cross_game",
    numberOfLegs: p.legs.length,
    marketsIncluded: Array.from(new Set(p.legs.map((l) => l.marketType))),
    correlationType: p.correlationScore <= -0.5 ? "negative" : p.correlationScore >= 0.4 ? "positive" : "neutral",
    correlationScore: p.correlationScore,
    combinedOdds: p.combinedOdds,
    estimatedHitProbability: p.estimatedHitProbability,
    actualResult: "pending",
    legsHit: null,
    legsLost: null,
    legsVoid: null,
    parlayHit: null,
    modelVersion: p.modelVersion,
    createdAt: p.createdAt,
    settledAt: null,
  };
}

export function buildTrackingRecords(parlays: SuggestedParlay[]): ParlayTrackingRecord[] {
  return parlays.map(toTrackingRecord);
}

// ── Historical hit-rate helpers (computed from already-settled records only) ────────────────────
export interface HitRateQuery {
  sport?: Sport | "MIXED";
  riskLevel?: RiskLevel;
  numberOfLegs?: number;
  marketType?: string;
  parlayType?: "cross_game" | "same_game";
  correlationType?: CorrelationType | "neutral";
}

export interface HitRateResult {
  matched: number;
  settled: number;
  hits: number;
  hitRate: number | null; // null when no settled rows match
}

/** Hit rate over SETTLED records matching the query. Pending rows are never counted as wins/losses. */
export function hitRate(records: ParlayTrackingRecord[], q: HitRateQuery = {}): HitRateResult {
  const matched = records.filter((r) =>
    (q.sport == null || r.sport === q.sport) &&
    (q.riskLevel == null || r.riskLevel === q.riskLevel) &&
    (q.numberOfLegs == null || r.numberOfLegs === q.numberOfLegs) &&
    (q.parlayType == null || r.parlayType === q.parlayType) &&
    (q.correlationType == null || r.correlationType === q.correlationType) &&
    (q.marketType == null || r.marketsIncluded.includes(q.marketType)),
  );
  const settled = matched.filter((r) => r.parlayHit !== null && r.actualResult !== "pending");
  const hits = settled.filter((r) => r.parlayHit === true).length;
  return {
    matched: matched.length,
    settled: settled.length,
    hits,
    hitRate: settled.length > 0 ? hits / settled.length : null,
  };
}
