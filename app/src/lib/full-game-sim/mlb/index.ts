/**
 * MLB team-scoring Monte Carlo engine — INTERNAL, experimental, market-anchored. Pure + deterministic
 * (seeded); no network, no fs, no money, no product-card activation. It emits a schema-valid
 * `FullGameSimulationArtifact` labelled `hybrid_shadow` / `market_anchored_simulation` and is NOT wired
 * into the public game page (see docs/MLB_TEAM_SCORING_MONTE_CARLO_MODEL_DESIGN + the backtest report).
 */
export { mulberry32, sampleTeamRuns, sampleGamma, samplePoisson, sampleNormal, invNorm } from "./rng";
export { buildExpectedRuns, MissingTotalError } from "./expected-runs";
export { simulateMlbGame } from "./simulate-game";
export { buildFullGameSimArtifact } from "./artifact-builder";
export type { GameSimInput, FullGameSimArtifactWithModel } from "./artifact-builder";
export type { MarketInput, ExpectedRunsResult, SimOptions, SimulationResult, DistBucket } from "./types";

export const DEFAULT_SIM_OPTIONS = { runCount: 10000, seed: 1234567, vmr: 1.35, modelVersion: "mlb-fgs-2026.07-market-anchored-v1" } as const;
