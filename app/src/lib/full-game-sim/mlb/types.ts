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
  warnings: string[];
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
