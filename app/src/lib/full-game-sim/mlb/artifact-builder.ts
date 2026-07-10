/**
 * ARTIFACT BUILDER — turns a market anchor + simulation result into a schema-valid, honestly-labelled
 * `FullGameSimulationArtifact`. Pure, no io. The one honesty rule enforced here: this is a
 * MARKET-ANCHORED simulation, so `winProbability.source` is `"hybrid_shadow"` (simulated shape, market
 * anchor) — never `"simulation"` (which would imply an independent model) — and the market's own
 * moneyline is carried separately in `marketCoverage`. When the market total is missing the game is
 * emitted BLOCKED (no fabricated distributions), not simulated.
 */
import type { FullGameSimulationArtifact } from "../schema";
import { validateFullGameSimArtifact } from "../schema";
import { buildExpectedRuns, MissingTotalError } from "./expected-runs";
import { simulateMlbGame } from "./simulate-game";
import type { MarketInput, SimOptions, SimulationResult } from "./types";

const SCHEMA_VERSION = "1.0.0";

export interface GameSimInput {
  gameId: string;
  gamePk?: number;
  date: string;
  teams: { away: { name: string; abbreviation?: string }; home: { name: string; abbreviation?: string } };
  market: MarketInput;
}

/** The artifact + engine metadata (metadata is extra to the schema; the validator ignores unknown fields). */
export type FullGameSimArtifactWithModel = FullGameSimulationArtifact & {
  model: {
    source: "market_anchored_simulation";
    status: "experimental_internal" | "not_ready";
    modelVersion: string;
    seed?: number;
    vmr?: number;
    warnings: string[];
    topScorelines?: SimulationResult["topScorelines"];
  };
};

function base(input: GameSimInput, opts: SimOptions): Omit<FullGameSimulationArtifact, "dataQuality" | "winProbability" | "projectedScore" | "distributions" | "marketCoverage" | "runCount"> {
  return {
    schemaVersion: SCHEMA_VERSION, sport: "MLB", gameId: input.gameId, gamePk: input.gamePk, date: input.date, asOf: input.date, public: false,
    source: { marketSnapshot: true, teamMarketLines: !!(input.market.total || input.market.homeWinProb || input.market.runLine), playerPropSimulation: false, linescoreSettlement: false, modelInputs: ["market total", "market moneyline", "market run line"] },
    teams: { away: input.teams.away, home: input.teams.home },
    guardrails: { publicFormulaChanged: false, officialMoneyRecordAffected: false, activeProductCard: false },
  };
}

/** Build the full-game-sim artifact for one game. Never throws — a missing total yields a BLOCKED artifact. */
export function buildFullGameSimArtifact(input: GameSimInput, opts: SimOptions): FullGameSimArtifactWithModel {
  let expected;
  try {
    expected = buildExpectedRuns(input.market, opts.vmr);
  } catch (e) {
    if (e instanceof MissingTotalError) {
      const art = {
        ...base(input, opts),
        marketCoverage: input.market.homeWinProb != null ? { moneyline: { homeWinProb: input.market.homeWinProb, awayWinProb: input.market.awayWinProb ?? (1 - input.market.homeWinProb), source: "market_implied" as const } } : {},
        dataQuality: { status: "blocked" as const, reasons: ["no market total — cannot anchor a full-game simulation"], missing: ["market total", "projected score", "run/margin distributions", "independent team-scoring model"] },
        model: { source: "market_anchored_simulation" as const, status: "not_ready" as const, modelVersion: opts.modelVersion, warnings: ["no market total"] },
      } as FullGameSimArtifactWithModel;
      return art;
    }
    throw e;
  }

  const sim = simulateMlbGame(expected, input.market, opts);
  const mkt = input.market;
  const art: FullGameSimArtifactWithModel = {
    ...base(input, opts),
    runCount: sim.runCount,
    // Simulated (shape) but ANCHORED to the market — honest hybrid label, never a bare "simulation".
    winProbability: { away: sim.winProbability.away, home: sim.winProbability.home, source: "hybrid_shadow" },
    projectedScore: { awayMean: sim.projectedScore.awayMean, homeMean: sim.projectedScore.homeMean, totalMean: sim.projectedScore.totalMean, marginMean: sim.projectedScore.marginMean, source: "hybrid_shadow" },
    distributions: { totalRuns: sim.distributions.totalRuns, margin: sim.distributions.margin },
    marketCoverage: {
      // The MARKET's own moneyline is kept separate from the simulated winProbability, labelled market_implied.
      ...(mkt.homeWinProb != null ? { moneyline: { homeWinProb: mkt.homeWinProb, awayWinProb: mkt.awayWinProb ?? (1 - mkt.homeWinProb), source: "market_implied" } } : {}),
      ...(sim.coverage.runLine ? { runLine: { line: sim.coverage.runLine.line, favorite: sim.coverage.runLine.favorite, coverProbability: sim.coverage.runLine.coverProbability, source: "hybrid_shadow" } } : {}),
      ...(sim.coverage.total ? { total: { line: sim.coverage.total.line, overProbability: sim.coverage.total.overProbability, underProbability: sim.coverage.total.underProbability, pushProbability: sim.coverage.total.pushProbability, source: "hybrid_shadow" } } : {}),
    },
    dataQuality: {
      status: "partial",
      reasons: [
        "MARKET-ANCHORED simulation: win probability + total match the market by construction; only the distributions are sampled",
        "negative-binomial team-run model with a fixed variance-to-mean assumption (not a fitted independent model)",
        ...(expected.anchored.winProb ? [] : ["no market moneyline — even split, weaker anchor"]),
      ],
      missing: ["independent team-scoring inputs (starting pitcher / lineup / bullpen / park / weather)", "a fitted, market-independent predictive model"],
    },
    model: { source: "market_anchored_simulation", status: "experimental_internal", modelVersion: opts.modelVersion, seed: sim.seed, vmr: sim.vmr, warnings: sim.warnings, topScorelines: sim.topScorelines },
  };

  // Never emit a schema-invalid artifact.
  const v = validateFullGameSimArtifact(art);
  if (!v.valid) {
    return { ...base(input, opts), marketCoverage: {}, dataQuality: { status: "blocked", reasons: ["internal: emitted artifact failed schema validation", ...v.errors], missing: [] }, model: { source: "market_anchored_simulation", status: "not_ready", modelVersion: opts.modelVersion, warnings: v.errors } } as FullGameSimArtifactWithModel;
  }
  return art;
}
