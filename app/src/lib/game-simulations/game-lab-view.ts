/**
 * DETERMINISTIC GAME SIMULATION — Game Lab VIEW builder (Phase 5, data side).
 *
 * A PURE, framework-free reshaper that turns the persisted per-day artifact
 * (public/data/{sport}/game-simulations/YYYY-MM-DD.json — see ./types) into a
 * fully-serializable view a client component can render for ONE fixture. It is
 * the simulation counterpart to `buildMlbGameLabReport` in ../game-lab/mlb-report:
 * the server calls it at build time and passes the result as a prop, so the
 * client never reads the filesystem, never fetches, and never recomputes.
 *
 * HONESTY (mirrors the artifact contract + validator):
 *   • `status` is the honesty flag the UI keys off ("ready" | "unavailable" |
 *     "stale" | "error"). Only "ready"/"stale" carry a real game payload.
 *   • `allowsRunCountClaim` gates any "N-run" copy on `runCount` being a
 *     positive integer (see `allowsRunCountClaim` in ./validate). When false,
 *     the UI must NOT claim a run count.
 *   • `distributions` is passed through ONLY when the game actually carries a
 *     non-empty one; otherwise it is null and the UI shows no histograms.
 *   • `generatedPicks`/`unavailableModules` are copied verbatim from the
 *     validated artifact — nothing is synthesized here.
 *   • The whole view is plain JSON (no functions/dates/Map) so it survives the
 *     Next.js static-export server→client serialization boundary intact.
 *
 * NO clock is consulted here. Staleness is decided by `readGameSimulation`
 * (which takes the current date/version as arguments); this builder simply
 * reflects the status the reader returned.
 */

import { allowsRunCountClaim } from "./validate";
import type {
  GameSimStatus,
  GameSimulationGame,
  GameSimulationReadResult,
  SimDistributions,
  SimGeneratedPick,
  SimSummary,
  SimTeams,
  SimUnavailableModule,
} from "./types";

/**
 * The serializable Game Lab simulation view for ONE fixture. This is the exact
 * shape handed to the `<GameSimulationRunner>` client component as a prop.
 * Every field is plain JSON.
 */
export interface GameSimulationView {
  /** Honesty flag — the UI reveals the artifact only for "ready"/"stale". */
  status: GameSimStatus;
  sport: string;
  /** Slate date of the artifact (YYYY-MM-DD). */
  date: string;
  /** The game's stable id (matches the artifact game's `gameId`). */
  gameId: string;
  /** Deterministic slug (home-vs-away-date) — present when a game payload exists. */
  slug: string | null;
  /** Home/away team tokens — present when a game payload exists. */
  teams: SimTeams | null;

  // ── Artifact-level honesty metadata (provenance the UI may surface) ──
  /** Model version string, e.g. "mlb-2026.07". Null when no artifact. */
  modelVersion: string | null;
  /** Simulation/engine format version. Null when no artifact. */
  simulationVersion: number | null;
  /**
   * Simulation run count from the artifact, or null when NO sampling ran. NEVER
   * present this as "N runs" unless `allowsRunCountClaim` is true.
   */
  runCount: number | null;
  /** True ⇔ `runCount` is a positive integer and an "N-run" claim is allowed. */
  allowsRunCountClaim: boolean;
  /** ISO timestamp the artifact was generated. Null when no artifact. */
  generatedAt: string | null;

  // ── The game payload (only when status is "ready" or "stale") ──
  simulationSummary: SimSummary | null;
  generatedPicks: SimGeneratedPick[];
  /** Passed through ONLY when the game carries a real, non-empty distributions block; else null. */
  distributions: SimDistributions;
  /** The honest "not generated" modules for this game (may be []). */
  unavailableModules: SimUnavailableModule[];

  /** Short machine reason from the reader (e.g. "ok", "no_artifact_file", "stale_version"). */
  reason: string;
}

/** True when a real, non-empty distributions object is present. */
function hasRealDistributions(dist: GameSimulationGame["distributions"]): dist is Record<string, never> {
  return dist !== undefined && dist !== null && Object.keys(dist).length > 0;
}

/**
 * Artifact-level metadata the view carries for provenance. `game-detail.ts`
 * reads it once from the loaded artifact and threads it in so we don't re-read
 * the file per game.
 */
export interface GameSimulationArtifactMeta {
  modelVersion: string | null;
  simulationVersion: number | null;
  runCount: number | null;
  generatedAt: string | null;
}

/** The honest empty meta used when there is no artifact at all. */
export const EMPTY_SIM_META: GameSimulationArtifactMeta = {
  modelVersion: null,
  simulationVersion: null,
  runCount: null,
  generatedAt: null,
};

/**
 * Build the serializable Game Lab simulation view from a reader result + the
 * artifact-level metadata. Pure + deterministic: same inputs ⇒ deep-equal
 * output. Never throws.
 *
 * @param result the per-game result from `readGameSimulation` (any status)
 * @param meta   artifact-level provenance metadata (or EMPTY_SIM_META)
 */
export function buildGameSimulationView(
  result: GameSimulationReadResult,
  meta: GameSimulationArtifactMeta = EMPTY_SIM_META,
): GameSimulationView {
  const game = result.game;
  // Only surface a game payload for statuses that actually carry one honestly.
  const showsGame = (result.status === "ready" || result.status === "stale") && !!game;

  const distributions: SimDistributions =
    showsGame && game && hasRealDistributions(game.distributions) ? game.distributions ?? null : null;

  return {
    status: result.status,
    sport: result.sport,
    date: result.date,
    gameId: result.gameId,
    slug: showsGame && game ? game.slug : null,
    teams: showsGame && game ? game.teams : null,

    modelVersion: meta.modelVersion,
    simulationVersion: meta.simulationVersion,
    runCount: meta.runCount,
    allowsRunCountClaim: allowsRunCountClaim({ runCount: meta.runCount }),
    generatedAt: meta.generatedAt,

    simulationSummary: showsGame && game ? game.simulationSummary : null,
    generatedPicks: showsGame && game ? game.generatedPicks : [],
    distributions,
    unavailableModules: Array.isArray(result.unavailableModules) ? result.unavailableModules : [],

    reason: result.reason,
  };
}

/**
 * The honest "no simulation for this game" view — a well-formed unavailable
 * view that never throws. Used when there is no artifact file, no matching
 * game, or the sport does not own a simulation. This is NOT an error state.
 */
export function unavailableSimulationView(
  sport: string,
  date: string,
  gameId: string,
  reason: string,
): GameSimulationView {
  return {
    status: "unavailable",
    sport,
    date,
    gameId,
    slug: null,
    teams: null,
    modelVersion: null,
    simulationVersion: null,
    runCount: null,
    allowsRunCountClaim: false,
    generatedAt: null,
    simulationSummary: null,
    generatedPicks: [],
    distributions: null,
    unavailableModules: [],
    reason,
  };
}
