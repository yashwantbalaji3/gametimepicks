/**
 * MLB SimulationPipeline — ARCHITECTURE ONLY (2026-07-22).
 *
 * Declares the staged pipeline + interfaces a future engine would implement. NO model, NO training, NO prediction:
 * the only concrete implementation here is a NullSimulationModel that returns all-null outputs (it produces NO
 * probability). Nothing runs on real data and nothing is surfaced publicly until the research gate passes
 * (30 dates / 500 settled-eligible observations) AND the founder approves.
 *
 * Stages:  Pregame Snapshot → Feature Validation → Feature Vector Builder → Simulation Engine Interface
 *          → Probability Distribution → Calibration Layer → Market Benchmark Comparison
 */
import type { SimulationInput, FeatureCoverage, OutcomeLabelKey } from "./simulation-feature-contract";
import { featureCoverageOf, coverageScore } from "./simulation-feature-contract";

export const SIMULATION_PIPELINE_VERSION = "mlb-simulation-pipeline-1";

export const SIMULATION_PIPELINE_STAGES = [
  "pregame_snapshot", "feature_validation", "feature_vector_builder",
  "simulation_engine_interface", "probability_distribution", "calibration_layer", "market_benchmark_comparison",
] as const;
export type SimulationPipelineStage = (typeof SIMULATION_PIPELINE_STAGES)[number];

/** Result of validating a feature vector before it may enter an engine (deterministic; safe now). */
export interface FeatureValidation {
  ok: boolean;
  coverage: FeatureCoverage;
  coverageScore: number;
  missing: string[];
  reason: string;
}

/** The output a future SimulationModel returns per (player, market, line). All prediction fields are null until a
 *  validated engine exists post-gate + approval. */
export interface SimulationOutput {
  player: string | null;
  market: OutcomeLabelKey | string;
  line: number | null;
  probabilityOver: number | null;
  probabilityUnder: number | null;
  expectedValue: number | null;
  confidence: number | null;
  featureCoverage: FeatureCoverage;
  modelVersion: string;
  timestamp: string | null;
  internalOnly: true; // outputs must never be surfaced publicly
}

/** The interface a future engine implements. It receives a validated SimulationInput and returns SimulationOutput. */
export interface SimulationModel {
  readonly version: string;
  simulate(input: SimulationInput, target: { market: OutcomeLabelKey | string; line: number | null; player?: string | null }): SimulationOutput;
}

/** Stage 2 — deterministic feature validation (no model). Requires the market probability + a minimum coverage. */
export function validateFeatures(obs: { model_inputs_available?: Record<string, unknown>; pregame_features?: Record<string, unknown> } | null | undefined, minCoverage = 0.5): FeatureValidation {
  const coverage = featureCoverageOf(obs);
  const cs = coverageScore(coverage);
  const missing = Object.entries(coverage).filter(([, v]) => !v).map(([k]) => k);
  const ok = coverage.market && cs >= minCoverage;
  return { ok, coverage, coverageScore: cs, missing, reason: !coverage.market ? "no market probability (the benchmark) — cannot validate" : cs < minCoverage ? `coverage ${cs} < ${minCoverage}` : "validated" };
}

/**
 * The ONLY model implementation shipped now: a null placeholder proving the interface compiles. It returns NO
 * probability/EV/confidence — every prediction field is null. It exists so the pipeline typechecks; it is never a
 * model and never runs on real data for a public output.
 */
export class NullSimulationModel implements SimulationModel {
  readonly version = "null-placeholder-0";
  simulate(input: SimulationInput, target: { market: OutcomeLabelKey | string; line: number | null; player?: string | null }): SimulationOutput {
    return {
      player: target.player ?? null, market: target.market, line: target.line,
      probabilityOver: null, probabilityUnder: null, expectedValue: null, confidence: null,
      featureCoverage: featureCoverageOf({ pregame_features: { ...(input.batter as object), ...(input.pitcher as object), ...(input.game as object) } }),
      modelVersion: this.version, timestamp: null, internalOnly: true,
    };
  }
}

export const SIMULATION_PIPELINE_GUARDRAILS = {
  public: false, producesPredictions: false,
  note: "Architecture + a null placeholder only. No SimulationModel may produce a non-null probability, and no SimulationOutput may be surfaced, until the gate passes and the founder approves.",
} as const;
