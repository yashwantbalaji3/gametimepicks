/**
 * Canonical prediction-methodology contracts (v1) for GameTimePicks.
 *
 * This is the SCHEMA layer for a leakage-safe, sport-specific, opportunity-first prediction
 * framework across MLB, NBA, UFC, and the Soccer World Cup. It defines the shapes — prediction-time
 * metadata, feature hierarchy, sample-size + missing/stale flags, confidence/risk, and the final
 * prediction output. It complements (does not replace) the existing scoring in
 * `projection-framework.ts` (DataQualityGrade / RiskTier / dataQualityTier / concentrationScore)
 * and `data-bank-builder-v2` (survival score).
 *
 * Honesty: many features are only DEFINED here (status "planned"/"not_available") — the framework
 * exposes that explicitly rather than implying data we don't have.
 */
import type { DataQualityGrade } from "@/lib/projection-framework";

export type Sport = "MLB" | "NBA" | "UFC" | "WORLD_CUP";

export type ModelMode = "no_market_model" | "market_aware_model" | "market_residual_model";

/** The nine-level universal feature hierarchy (priority order is opportunity-first; see global-rules). */
export type FeatureGroup =
  | "availability"
  | "opportunity"
  | "role"
  | "efficiency"
  | "matchup"
  | "context"
  | "market"
  | "uncertainty"
  | "validation";

/** Implementation status of a defined feature — never imply data we don't have. */
export type ImplementationStatus = "implemented" | "partial" | "planned" | "not_available";

/** Per-prediction snapshot metadata — every row records when each input was captured. */
export interface PredictionSnapshotMetadata {
  eventId: string;
  sport: Sport;
  leagueOrCompetition: string;
  predictionTarget: string;
  predictionTime: string; // ISO
  eventStartTime: string; // ISO
  dataCutoffTime: string; // ISO
  featureSnapshotTime: string; // ISO
  marketSnapshotTime?: string | null;
  lineupSnapshotTime?: string | null;
  injurySnapshotTime?: string | null;
  weatherSnapshotTime?: string | null;
}

/** Sample-size buckets for any historical / head-to-head / venue / matchup feature. */
export type SampleSizeBucket =
  | "sample_size_0"
  | "sample_size_1_to_5"
  | "sample_size_6_to_15"
  | "sample_size_16_to_30"
  | "sample_size_31_plus";

export interface SampleSizedValue {
  rawValue: number | null;
  sampleSize: number;
  sampleSizeBucket: SampleSizeBucket;
  sampleWeight: number; // 0..1 recommended downweight
  smallSampleFlag: boolean;
}

/** A leakage-safe rolling window. `includesTargetEventFlag` must always be false. */
export interface RollingWindowMeta {
  windowStartTime: string;
  windowEndTime: string;
  sampleSize: number;
  includesTargetEventFlag: false;
}

export interface RollingMetric extends RollingWindowMeta {
  mean: number | null;
  median: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  trend: number | null;
  zScoreVsSeason: number | null;
}

/** A single feature definition in a sport registry. */
export interface FeatureDefinition {
  name: string;
  group: FeatureGroup;
  description: string;
  required: boolean;
  dataSource: string;
  /** Max age (minutes) before the feature is considered stale; null = not time-sensitive. */
  freshnessThresholdMinutes: number | null;
  /** Plain-English leakage rule (what must NOT come from the target event). */
  leakageRule: string;
  status: ImplementationStatus;
}

export type SportFeatureRegistry = {
  sport: Sport;
  priorities: string[]; // opportunity-first priority order (sport summary)
  features: FeatureDefinition[];
};

// ── Output flags ──────────────────────────────────────────────────────────────────────────────
export interface MissingDataFlag { field: string; critical: boolean; reason: string; }
export interface StaleDataFlag { field: string; capturedAt: string | null; thresholdMinutes: number | null; reason: string; }
export interface SmallSampleFlag { field: string; sampleSize: number; bucket: SampleSizeBucket; }

export interface LeakageValidationResult {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

export interface TopFactor { label: string; direction: "positive" | "negative"; weight?: number; }

export type ConfidenceCategory = "High" | "Medium" | "Low" | "No Bet";

/** The canonical per-prediction output schema. */
export interface PredictionOutput {
  eventId: string;
  sport: Sport;
  predictionTarget: string;
  participant: string;
  line: number | null;
  marketOdds: number | null;
  marketImpliedProbability: number | null;
  modelProjection: number | null;
  modelProbability: number | null;
  edge: number | null; // model_probability - market_implied_probability (pp)
  confidenceScore: ConfidenceCategory;
  riskScore: number; // 0..1, higher = more fragile/uncertain
  dataQuality: DataQualityGrade;
  modelMode: ModelMode;
  topPositiveFactors: TopFactor[];
  topNegativeFactors: TopFactor[];
  missingDataFlags: MissingDataFlag[];
  staleDataFlags: StaleDataFlag[];
  smallSampleFlags: SmallSampleFlag[];
  leakageValidationPassed: boolean;
}
