/**
 * Types for the MLB team-scoring Monte Carlo engine. Pure data shapes — no behaviour, no io.
 */

/** Market inputs for one game (all optional — the engine degrades honestly when they're missing). */
export interface MarketInput {
  /** De-vigged market total (expected total runs anchor). Required to run a simulation. */
  total?: number;
  /** De-vigged home win probability (anchors the run margin). */
  homeWinProb?: number;
  awayWinProb?: number;
  /** Run line for the favourite (e.g. -1.5) + which side is favoured. */
  runLine?: { line: number; favorite: "home" | "away" };
}

export interface ExpectedRunsResult {
  homeExp: number;
  awayExp: number;
  total: number;
  /** homeExp − awayExp. */
  margin: number;
  anchored: { total: boolean; winProb: boolean };
  /** True once bounded independent adjustments have been applied (shadow mode). */
  adjusted?: boolean;
  warnings: string[];
}

/** The three engine modes. The engine is ALWAYS market-anchored; a market-free model is not supported. */
export type EngineMode =
  | "market_anchored_simulation"
  | "market_anchored_with_independent_adjustments"
  | "independent_simulation_blocked";

/** Optional INDEPENDENT (non-market) inputs. Every field is optional; the engine degrades to neutral. */
export interface IndependentInputs {
  /** Static park run factor (1.0 = neutral). */
  parkRunFactor?: number;
  parkConfidence?: string;
  /** Team runs-per-game from STRICTLY-EARLIER committed finals (leakage-safe). */
  awayRunRate?: number;
  homeRunRate?: number;
  runRateSampleGames?: { away: number; home: number };
  /**
   * Probable-starter strength: FIP-proxy runs-saved-per-9 vs the average starter, from STRICTLY-EARLIER starts
   * (leakage-safe). Positive = the starter suppresses the OPPONENT's runs. Feature #1 (internal experiment).
   */
  awayStarterRunsSaved9?: number;
  homeStarterRunsSaved9?: number;
  starterSampleGames?: { away: number; home: number };
  /**
   * Bullpen fatigue: day-weighted relief-innings index vs average (positive = more tired), from STRICTLY-EARLIER
   * box scores (prior 3 calendar days). A tired pen allows the OPPONENT more runs. Feature #2 (internal experiment).
   */
  bullpenFatigue?: {
    awayFatigueIndex: number;
    homeFatigueIndex: number;
    awayCoverage: "full" | "partial" | "missing";
    homeCoverage: "full" | "partial" | "missing";
  };
}

/** Summary of the bounded adjustments actually applied (all zero when none). */
export interface AdjustmentSummary {
  applied: boolean;
  parkTotalNudge: number;
  runRateMarginNudge: number;
  pitcherTotalNudge?: number;
  pitcherMarginNudge?: number;
  bullpenTotalNudge?: number;
  bullpenMarginNudge?: number;
  notes: string[];
}

export interface SimOptions {
  runCount: number;
  seed: number;
  /** Variance-to-mean ratio for the negative-binomial run model (≥1; 1 = Poisson). */
  vmr: number;
  modelVersion: string;
}

export interface DistBucket { bucket: string; probability: number }

export interface SimulationResult {
  runCount: number;
  seed: number;
  vmr: number;
  winProbability: { home: number; away: number };
  projectedScore: { homeMean: number; awayMean: number; totalMean: number; marginMean: number };
  distributions: { totalRuns: DistBucket[]; margin: DistBucket[] };
  /** Simulated coverage for the priced lines, when a line exists. */
  coverage: {
    total?: { line: number; overProbability: number; underProbability: number; pushProbability: number };
    runLine?: { line: number; favorite: "home" | "away"; coverProbability: number };
  };
  /** Most common exact scorelines (away-home), highest probability first. */
  topScorelines: Array<{ away: number; home: number; probability: number }>;
  warnings: string[];
}
