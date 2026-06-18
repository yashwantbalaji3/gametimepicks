/**
 * Parlay-engine contracts. Pure types built on top of the methodology `PredictionOutput`. Every
 * leg, parlay, correlation result, and Bank Builder selection is methodology-derived and honest:
 * an ineligible/No-Bet/leaking/started candidate can never become a published leg.
 */
import type {
  PredictionOutput,
  ConfidenceCategory,
  MissingDataFlag,
  StaleDataFlag,
  SmallSampleFlag,
  TopFactor,
  Sport,
} from "../methodology/types";
import type { ExtractorStatus, MarketScope } from "../methodology/adapter";

export type { Sport, MarketScope, ExtractorStatus };

export type RiskLevel = "low" | "medium" | "high" | "longshot";
export type RiskTier = "low" | "elevated" | "high";
export type LegQualityTier = "elite" | "strong" | "playable" | "thin" | "ineligible";
export type ConfidenceTier = ConfidenceCategory; // High | Medium | Low | No Bet

/** A single methodology-derived candidate leg, with eligibility + quality resolved. */
export interface EligibleLeg {
  legId: string;
  sport: Sport;
  eventId: string;
  gameId: string;
  marketType: string;
  marketScope: MarketScope;
  side: string | null; // Over/Under/Yes/No/home/draw/away/moneyline — for correlation conflicts
  participantId: string | null;
  participantName: string;
  teamId: string | null;
  teamName: string | null;
  opponentId: string | null;
  opponentName: string | null;
  line: number | null;
  odds: number | null;
  book: string | null;
  modelProjection: number | null;
  modelProbability: number | null;
  marketImpliedProbability: number | null;
  edge: number | null;
  confidenceScore: ConfidenceTier;
  confidenceTier: ConfidenceTier;
  riskScore: number;
  riskTier: RiskTier;
  dataQualityGrade: PredictionOutput["dataQuality"];
  leakageValidationPassed: boolean;
  missingDataFlags: MissingDataFlag[];
  staleDataFlags: StaleDataFlag[];
  smallSampleFlags: SmallSampleFlag[];
  topPositiveFactors: TopFactor[];
  topNegativeFactors: TopFactor[];
  correlationTags: string[];
  exposureTags: string[];
  startTime: string | null;
  snapshotTime: string | null;
  eligible: boolean;
  ineligibilityReasons: string[];
  legQualityScore: number; // 0..100
  legQualityTier: LegQualityTier;
}

/** Context for resolving eligibility against the slate's "now" and the sport's extractor status. */
export interface LegContext {
  nowIso: string;
  extractorStatus: ExtractorStatus;
  marketAware: boolean;
}

// ── Correlation ──────────────────────────────────────────────────────────────────────────────
export type CorrelationType = "positive" | "negative" | "neutral" | "unknown" | "fragile" | "conflicting";

export interface CorrelationResult {
  correlationScore: number; // -1..1 (sign = direction, magnitude = strength)
  correlationType: CorrelationType;
  correlationExplanation: string;
  sameGameFlag: boolean;
  sameTeamFlag: boolean;
  samePlayerFlag: boolean;
  opposingTeamFlag: boolean;
  marketConflictFlag: boolean;
  exposureConflictFlag: boolean;
  sameSportFlag: boolean;
  marketScopeConflictFlag: boolean;
}

// ── Parlays ──────────────────────────────────────────────────────────────────────────────────
export interface ParlayLegView {
  legId: string;
  sport: Sport;
  eventId: string;
  label: string;
  marketType: string;
  odds: number | null;
  modelProbability: number | null;
  legQualityTier: LegQualityTier;
}

export interface SuggestedParlay {
  parlayId: string;
  date: string;
  sport: Sport | "MIXED";
  riskLevel: RiskLevel;
  parlayType: "cross_game" | "same_game";
  legs: ParlayLegView[];
  combinedOdds: number | null;
  estimatedHitProbability: number | null;
  estimatedPayoutMultiple: number | null;
  averageLegQuality: number;
  correlationScore: number;
  correlationSummary: string;
  confidenceTier: ConfidenceTier;
  riskTier: RiskTier;
  whyThisParlay: string[];
  whyItCouldFail: string[];
  eligible: boolean;
  ineligibilityReasons: string[];
  createdAt: string | null;
  modelVersion: string;
  published: boolean;
}

export interface GenerationNote {
  riskLevel: RiskLevel;
  generated: number;
  requested: number;
  reason: string | null;
}

// ── Dual Bank Builder ──────────────────────────────────────────────────────────────────────────
export type BankBuilderLaunchStatus = "launched" | "no_qualified_launch" | "dry_run_only" | "settled";

export interface BankBuilderLaneLeg extends ParlayLegView {
  legQualityScore: number;
  riskScore: number;
  side: string | null;          // over/under/yes/no — the exact pick side
  line: number | null;
  startTime: string | null;
  confidenceTier: ConfidenceTier;
  dataQuality: PredictionOutput["dataQuality"];
  topPositiveFactors: TopFactor[];
  topNegativeFactors: TopFactor[];
}

export interface BankBuilderLane {
  laneId: "A" | "B";
  label: string;
  legs: BankBuilderLaneLeg[];
  combinedOdds: number | null;
  laneSurvivalScore: number;
  estimatedHitProbability: number | null;
}

export interface DualBankBuilderResult {
  runId: string | null;
  date: string;
  status: BankBuilderLaunchStatus;
  laneA: BankBuilderLane | null;
  laneB: BankBuilderLane | null;
  selectedFourLegs: BankBuilderLaneLeg[];
  rejectedCandidates: Array<{ legId: string; reason: string }>;
  launchGateSummary: Array<{ gate: string; passed: boolean; detail: string }>;
  noLaunchReasons: string[];
  modelVersion: string;
  createdAt: string | null;
  published: boolean;
}

export const MODEL_VERSION = "parlay-engine-v1";
