/**
 * DETERMINISTIC GAME SIMULATION — reader utilities (Phase 3).
 *
 * These read the persisted artifact at public/data/{sport}/game-simulations/YYYY-MM-DD.json and
 * return an HONEST, well-formed result. The status the reader RETURNS is the honesty core:
 *
 *   - "ready"       — the artifact exists, parses, validates, and the game's own status is "ready".
 *   - "unavailable" — there is NO artifact file, OR the game is not present in it. This is a normal,
 *                     well-formed result (NOT an error) — the site shows "Simulation not yet available".
 *   - "stale"       — the artifact's date/simulationVersion is older than the requested/current values.
 *                     Staleness is decided deterministically by `isSimulationStale`, which takes the
 *                     "current" values as arguments — the reader NEVER calls Date.now().
 *   - "error"       — ONLY when the artifact file exists but is malformed / unparseable / fails
 *                     structural validation.
 *
 * Missing `distributions` is surfaced as an unavailable module (never a fake empty distribution).
 * The reader is deterministic: reading the same bytes twice yields deep-equal results.
 */

import fs from "node:fs";
import path from "node:path";

import type {
  GameSimStatus,
  GameSimulationArtifact,
  GameSimulationGame,
  GameSimulationReadResult,
  SimSportKey,
  SimUnavailableModule,
} from "./types";
import { validateGameSimulation } from "./validate";

/** Deterministic on-disk path for a sport+date artifact, rooted at a data root (usually .../public/data). */
export function gameSimulationPath(root: string, sport: SimSportKey, date: string): string {
  return path.join(root, sport, "game-simulations", `${date}.json`);
}

/** The honest "no histograms for this game" module, synthesized when a game omits distributions. */
function distributionsUnavailableModule(): SimUnavailableModule {
  return {
    module: "distributions",
    reason: "no_sampling",
    requiredArtifactField: "distributions",
    displayCopy: "Histograms are not available for this game.",
  };
}

/**
 * The unavailable modules a game declares, PLUS a synthesized "distributions" module when the game
 * has no real distributions and did not already declare one. This guarantees the UI can always learn
 * that histograms are missing without inspecting the raw (possibly absent) distributions field.
 */
function effectiveUnavailableModules(game: GameSimulationGame): SimUnavailableModule[] {
  const declared = Array.isArray(game.unavailableModules) ? game.unavailableModules : [];
  const hasRealDistributions =
    game.distributions !== undefined &&
    game.distributions !== null &&
    Object.keys(game.distributions).length > 0;
  const alreadyDeclared = declared.some((m) => m && m.module === "distributions");
  if (!hasRealDistributions && !alreadyDeclared) {
    return [...declared, distributionsUnavailableModule()];
  }
  return declared;
}

/**
 * Deterministic staleness decision. An artifact is stale when EITHER its simulationVersion is behind
 * the current engine version, OR its slate date is older than the current slate date. All "current"
 * inputs are passed in — this function does not consult any clock.
 *
 * @param artifactDate            the artifact's `date` (YYYY-MM-DD)
 * @param artifactSimulationVersion the artifact's `simulationVersion`
 * @param currentDate            the current/requested slate date (YYYY-MM-DD)
 * @param currentSimulationVersion the current engine's simulationVersion
 */
export function isSimulationStale(
  artifactDate: string,
  artifactSimulationVersion: number,
  currentDate: string,
  currentSimulationVersion: number,
): boolean {
  if (Number.isInteger(currentSimulationVersion) && artifactSimulationVersion < currentSimulationVersion) {
    return true;
  }
  // Lexicographic compare is correct for zero-padded YYYY-MM-DD.
  if (currentDate && artifactDate < currentDate) return true;
  return false;
}

/** An unavailable result (no file / game absent). Always well-formed — never an error. */
function unavailableResult(
  sport: SimSportKey,
  date: string,
  gameId: string,
  reason: string,
): GameSimulationReadResult {
  return { status: "unavailable", sport, date, gameId, game: null, unavailableModules: [], reason, errors: [] };
}

/** An error result — reserved for a malformed / unparseable / invalid artifact. */
function errorResult(
  sport: SimSportKey,
  date: string,
  gameId: string,
  reason: string,
  errors: string[],
): GameSimulationReadResult {
  return { status: "error", sport, date, gameId, game: null, unavailableModules: [], reason, errors };
}

/**
 * Load + parse + validate the artifact file. Returns either the validated artifact or a structured
 * failure ({ kind: "missing" } when the file does not exist; { kind: "error" } when it exists but is
 * unparseable/invalid). Never throws.
 */
function loadArtifact(
  filePath: string,
):
  | { kind: "ok"; artifact: GameSimulationArtifact }
  | { kind: "missing" }
  | { kind: "error"; errors: string[] } {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    // ENOENT (or any read failure) is treated as "no artifact" → unavailable, not error.
    return { kind: "missing" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { kind: "error", errors: [`malformed JSON: ${(e as Error).message}`] };
  }
  const validation = validateGameSimulation(parsed);
  if (!validation.ok) {
    return { kind: "error", errors: validation.errors };
  }
  return { kind: "ok", artifact: parsed as GameSimulationArtifact };
}

/**
 * Options for staleness. When both `currentDate` and `currentSimulationVersion` are supplied, the
 * reader may downgrade an otherwise-ready result to "stale". Omit to skip staleness entirely.
 */
export interface GameSimulationReadOptions {
  currentDate?: string;
  currentSimulationVersion?: number;
}

/**
 * Read ONE game's simulation.
 *
 * @param root    data root (e.g. `path.join(process.cwd(), "public", "data")`)
 * @param sport   sport key
 * @param date    slate date (YYYY-MM-DD)
 * @param gameId  the game to read
 * @param opts    optional current date/version to enable deterministic staleness
 */
export function readGameSimulation(
  root: string,
  sport: SimSportKey,
  date: string,
  gameId: string,
  opts: GameSimulationReadOptions = {},
): GameSimulationReadResult {
  const filePath = gameSimulationPath(root, sport, date);
  const loaded = loadArtifact(filePath);

  if (loaded.kind === "missing") return unavailableResult(sport, date, gameId, "no_artifact_file");
  if (loaded.kind === "error") return errorResult(sport, date, gameId, "malformed_artifact", loaded.errors);

  const artifact = loaded.artifact;
  const game = artifact.games.find((g) => g.gameId === gameId) ?? null;
  if (!game) return unavailableResult(sport, date, gameId, "game_not_in_artifact");

  const modules = effectiveUnavailableModules(game);

  // Staleness (deterministic, opt-in). A stale artifact is not "ready" even if the game says so.
  if (opts.currentDate !== undefined && opts.currentSimulationVersion !== undefined) {
    if (isSimulationStale(artifact.date, artifact.simulationVersion, opts.currentDate, opts.currentSimulationVersion)) {
      return { status: "stale", sport, date, gameId, game, unavailableModules: modules, reason: "stale_version", errors: [] };
    }
  }

  // The game's OWN status is authoritative when the artifact is valid + fresh.
  const status: GameSimStatus = game.status;
  const reason =
    status === "ready" ? "ok"
    : status === "unavailable" ? "game_marked_unavailable"
    : status === "stale" ? "game_marked_stale"
    : "game_marked_error";
  return { status, sport, date, gameId, game, unavailableModules: modules, reason, errors: [] };
}

/**
 * Read ALL games' simulations for a sport+date. Returns one result per game in the artifact. When
 * there is no artifact file (or it is malformed) returns a single-element array carrying the shared
 * unavailable/error status with an empty gameId, so callers always get a well-formed array.
 */
export function readGameSimulations(
  root: string,
  sport: SimSportKey,
  date: string,
  opts: GameSimulationReadOptions = {},
): GameSimulationReadResult[] {
  const filePath = gameSimulationPath(root, sport, date);
  const loaded = loadArtifact(filePath);

  if (loaded.kind === "missing") return [unavailableResult(sport, date, "", "no_artifact_file")];
  if (loaded.kind === "error") return [errorResult(sport, date, "", "malformed_artifact", loaded.errors)];

  return loaded.artifact.games.map((g) => readGameSimulation(root, sport, date, g.gameId, opts));
}
