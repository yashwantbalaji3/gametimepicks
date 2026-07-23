/**
 * MLB pregame research archive — eligibility, timestamp, and freshness policy (the honesty spine).
 *
 * This module is PURE and deterministic. It decides whether a captured feature value is eligible to be used in
 * FUTURE leakage-safe challenger research. The archive is forward-only and internal — it never touches public
 * surfacing, products, money, or settlement, and it never backfills missing pregame values from postgame data.
 *
 * The one rule that matters: a value is research-eligible only when it was provably known BEFORE first pitch.
 *   capturedAt < eventStartTime  AND  availableAt < eventStartTime  AND  a proven source timestamp.
 * Anything captured at/after first pitch, or whose source timing is unproven, is INELIGIBLE — never inferred.
 */

export const SCHEMA_VERSION = "mlb-pregame-archive-1";

/** Every archive record and artifact carries these — this pipeline is research-only, forever internal. */
export const RESEARCH_ONLY_FLAGS = { public: false, approvedForProduction: false, productEligible: false } as const;

export type SnapshotReason =
  | "BOARD_GENERATION" | "SCHEDULED_REFRESH" | "LINEUP_CONFIRMED" | "LINEUP_CHANGED" | "PITCHER_CHANGED"
  | "WEATHER_CHANGED" | "MARKET_REFRESH" | "MANUAL_RESEARCH_REFRESH" | "FINAL_PREGAME_FREEZE";

export type QualityState =
  | "COMPLETE" | "PARTIAL" | "MISSING" | "STALE" | "TIMESTAMP_UNPROVEN"
  | "SOURCE_CONFLICT" | "FETCH_FAILED" | "PARSER_FAILED" | "POST_START_ONLY";

export type FeatureFamily =
  | "confirmed_lineup" | "pitcher_status" | "bullpen" | "plate_appearance_opportunity" | "markets" | "environment" | "umpire";

/** Family-specific freshness limits (seconds). Starting defaults; documented + tested. */
export const FRESHNESS_LIMITS_SECONDS: Record<FeatureFamily, number | null> = {
  confirmed_lineup: null,            // valid until changed or event start
  pitcher_status: 3 * 3600,          // 3h near first pitch
  bullpen: 90 * 60,                  // recompute within 90 min of first pitch (and after every completed team game)
  plate_appearance_opportunity: 6 * 3600,
  markets: 6 * 3600,                 // generation-time value + a final pregame refresh
  environment: 3 * 3600,             // weather ≤ 3h near first pitch
  umpire: null,                      // valid until corrected
};

export interface EligibilityInput {
  family: FeatureFamily;
  /** ISO — when the pipeline captured the value. */
  capturedAt: string | null;
  /** ISO — when the value provably became available (source publish/update). Null ⇒ unproven. */
  availableAt: string | null;
  /** ISO — official event (first pitch) start time. */
  eventStartTime: string | null;
  /** Whether the underlying source timestamp is proven (not merely inferred). */
  timestampProven: boolean;
  /** True when this value belongs to a superseded pitcher/lineup state. */
  superseded?: boolean;
  /** True when only a postgame value exists for this feature (e.g. observed weather). */
  postgameOnly?: boolean;
  /** True when the parser/fetch failed for this family. */
  failed?: boolean;
}

export interface EligibilityResult {
  eligible: boolean;
  reason: string;
  quality: QualityState;
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : NaN);

/** The single research-eligibility gate. Never infers eligibility; unproven ⇒ ineligible. */
export function researchEligibility(x: EligibilityInput): EligibilityResult {
  if (x.failed) return { eligible: false, reason: "fetch/parser failed", quality: "FETCH_FAILED" };
  if (x.postgameOnly) return { eligible: false, reason: "only a postgame value exists", quality: "POST_START_ONLY" };
  if (x.superseded) return { eligible: false, reason: "belongs to a superseded pitcher/lineup state", quality: "MISSING" };
  const start = ms(x.eventStartTime), cap = ms(x.capturedAt), avail = ms(x.availableAt);
  if (!Number.isFinite(start)) return { eligible: false, reason: "no event start time", quality: "TIMESTAMP_UNPROVEN" };
  if (!Number.isFinite(cap)) return { eligible: false, reason: "no capture time", quality: "TIMESTAMP_UNPROVEN" };
  if (cap >= start) return { eligible: false, reason: "captured at/after first pitch", quality: "POST_START_ONLY" };
  if (!x.timestampProven || !Number.isFinite(avail)) return { eligible: false, reason: "source availability time unproven", quality: "TIMESTAMP_UNPROVEN" };
  if (avail >= start) return { eligible: false, reason: "value available only at/after first pitch", quality: "POST_START_ONLY" };
  // freshness (near first pitch)
  const limit = FRESHNESS_LIMITS_SECONDS[x.family];
  if (limit != null && Number.isFinite(cap) && (start - cap) / 1000 > limit + 24 * 3600) {
    // capture is far older than the family's freshness window relative to first pitch → stale unless "valid until changed"
    return { eligible: false, reason: `stale beyond ${limit}s freshness window`, quality: "STALE" };
  }
  return { eligible: true, reason: "captured + available before first pitch with a proven timestamp", quality: "COMPLETE" };
}

/**
 * Re-validating an INHERITED market-row eligibility against the authoritative event start (used by settlement joins
 * + the observation assembler, which run under plain `node`) lives in the node-importable canonical module
 * scripts/lib/research-eligibility.mjs (`revalidateMarketEligibility`). It is the single runtime source of truth for
 * that boundary; a parity test pins it. This file keeps the family-oriented capture-time gate above.
 */

/** True only after enough forward-collected, eligible, settled data exists to even consider challenger research. */
export interface CollectionGate {
  minDistinctDates: number;
  minSettledEligibleObs: number;
  minFeatureCoveragePct: number;
  minTimestampProvenPct: number;
}
export const DEFAULT_COLLECTION_GATE: CollectionGate = {
  minDistinctDates: 30, minSettledEligibleObs: 500, minFeatureCoveragePct: 80, minTimestampProvenPct: 90,
};

export function collectionGateMet(progress: { distinctDates: number; settledEligibleObs: number; featureCoveragePct: number; timestampProvenPct: number }, gate: CollectionGate = DEFAULT_COLLECTION_GATE): { met: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (progress.distinctDates < gate.minDistinctDates) blockers.push(`dates ${progress.distinctDates}/${gate.minDistinctDates}`);
  if (progress.settledEligibleObs < gate.minSettledEligibleObs) blockers.push(`settled-eligible ${progress.settledEligibleObs}/${gate.minSettledEligibleObs}`);
  if (progress.featureCoveragePct < gate.minFeatureCoveragePct) blockers.push(`coverage ${progress.featureCoveragePct}%/${gate.minFeatureCoveragePct}%`);
  if (progress.timestampProvenPct < gate.minTimestampProvenPct) blockers.push(`timestamp-proven ${progress.timestampProvenPct}%/${gate.minTimestampProvenPct}%`);
  return { met: blockers.length === 0, blockers };
}
