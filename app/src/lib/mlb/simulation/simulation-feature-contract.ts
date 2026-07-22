/**
 * MLB SimulationFeatureContract — ARCHITECTURE ONLY (2026-07-22).
 *
 * Defines the input / output / result SHAPES a future SimTheGame-style simulation engine would consume, derived
 * from the leakage-safe ResearchObservation warehouse. This module contains NO model, NO training, NO prediction,
 * and produces NO probability — it only declares the contract and computes deterministic feature COVERAGE from an
 * observation. No simulation may run, and no result may be surfaced publicly, until the research gate is met
 * (30 dates / 500 settled-eligible observations) AND the founder approves.
 *
 * Guardrails: nothing here is public, product-eligible, or money-touching.
 */

export const SIMULATION_CONTRACT_VERSION = "mlb-simulation-feature-contract-1";

/** Deterministic settleable outcome labels (match the settlement-join grader). */
export type OutcomeLabelKey =
  | "strikeouts" | "outs" | "earned_runs"
  | "hits" | "total_bases" | "home_runs" | "rbi" | "runs" | "hits_runs_rbi"
  | "moneyline" | "run_line" | "team_total";

/** The pregame families a simulation input can draw on (all leakage-safe, captured before first pitch). */
export interface SimulationInput {
  game: { gamePk: number; date: string; homeTeam: string | null; awayTeam: string | null; venue: string | null; weather: unknown | null; park: unknown | null };
  pitcher: { starter: unknown | null; rest: unknown | null; workload: unknown | null; recentForm: unknown | null };
  batter: { splits: unknown | null; form: unknown | null; matchup: unknown | null; vsPitcher: unknown | null; lineupSlot: number | null; paOpportunity: unknown | null };
  market: { sportsbookProbability: number | null; noVigProbability: number | null };
}

/** Which families are present for an observation (drives coverageScore + confidence). */
export interface FeatureCoverage {
  pitcherStatus: boolean; pitcherWorkload: boolean; lineup: boolean; bullpen: boolean; matchup: boolean;
  batterSplits: boolean; batterForm: boolean; batterVsPitcher: boolean; paOpportunity: boolean;
  park: boolean; environment: boolean; market: boolean;
}

/** The output shape a future engine returns per (market, line, selection). NO values are produced here. */
export interface SimulationResult {
  market: OutcomeLabelKey | string;
  selection: "Over" | "Under" | string;
  line: number | null;
  probabilityOver: number | null;   // filled only by a validated engine, post-gate + approval
  probabilityUnder: number | null;
  expectedValue: number | null;
  confidence: number | null;         // 0..1, a function of featureCoverage + sample sizes
  uncertainty: number | null;        // e.g. a std-dev / interval width from a future engine
  featureCoverage: FeatureCoverage;
  coverageScore: number;             // fraction of families present (deterministic, safe to compute now)
  note: string;
}

const COVERAGE_KEYS: (keyof FeatureCoverage)[] = [
  "pitcherStatus", "pitcherWorkload", "lineup", "bullpen", "matchup",
  "batterSplits", "batterForm", "batterVsPitcher", "paOpportunity", "park", "environment", "market",
];

/** Deterministic feature coverage from a ResearchObservation's model_inputs_available (NO model). */
export function featureCoverageOf(obs: { model_inputs_available?: Record<string, unknown>; pregame_features?: Record<string, unknown> } | null | undefined): FeatureCoverage {
  const mia = obs?.model_inputs_available ?? {};
  const pf = obs?.pregame_features ?? {};
  const has = (k: string) => Boolean((mia as Record<string, unknown>)[k]) || Boolean((pf as Record<string, unknown>)[k]);
  return {
    pitcherStatus: Boolean((mia as { hasPitcherContext?: boolean }).hasPitcherContext) || has("pitcher_status"),
    pitcherWorkload: Boolean((mia as { hasPitcherWorkload?: boolean }).hasPitcherWorkload) || has("pitcher_workload"),
    lineup: Boolean((mia as { hasLineup?: boolean }).hasLineup) || has("confirmed_lineup"),
    bullpen: Boolean((mia as { hasBullpen?: boolean }).hasBullpen) || has("bullpen_availability"),
    matchup: Boolean((mia as { hasMatchup?: boolean }).hasMatchup) || has("batter_matchup"),
    batterSplits: Boolean((mia as { hasBatterSplits?: boolean }).hasBatterSplits) || has("batter_splits"),
    batterForm: Boolean((mia as { hasBatterForm?: boolean }).hasBatterForm) || has("batter_form"),
    batterVsPitcher: has("batter_vs_pitcher"),
    paOpportunity: has("plate_appearance_opportunity"),
    park: Boolean((mia as { hasParkFactors?: boolean }).hasParkFactors) || has("park_factors"),
    environment: Boolean((mia as { hasEnvironmentContext?: boolean }).hasEnvironmentContext) || has("environment"),
    market: Boolean((mia as { hasDeVigMarketProbability?: boolean }).hasDeVigMarketProbability),
  };
}

/** Fraction of families present (0..1). Deterministic; safe to compute pre-gate. */
export function coverageScore(cov: FeatureCoverage): number {
  const present = COVERAGE_KEYS.filter((k) => cov[k]).length;
  return +(present / COVERAGE_KEYS.length).toFixed(3);
}

/** Contract guardrails, asserted by guard tests — modeling stays blocked until the gate passes. */
export const SIMULATION_CONTRACT_GUARDRAILS = {
  public: false,
  producesPredictions: false,
  producesProbabilities: false,
  gate: { minDistinctDates: 30, minSettledEligibleObs: 500, plusFounderApproval: true },
  note: "Architecture only. No SimulationResult probability/EV/confidence value may be produced or surfaced until the research gate is met and the founder approves.",
} as const;
