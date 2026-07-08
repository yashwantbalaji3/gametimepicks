/**
 * DETERMINISTIC GAME SIMULATION — structural + HONESTY validator (Phase 3).
 *
 * `validateGameSimulation(obj)` returns `{ ok, errors[] }`. It is pure and deterministic (no clock,
 * no randomness). It structurally enforces the honesty rules the UI relies on so a malformed or
 * dishonest artifact can never masquerade as a real simulation:
 *
 *   1. A game with status "ready" MUST carry non-empty integrity.sourceBoardHash + artifactHash.
 *   2. runCount is a valid "N-run" claim ONLY if it is a positive integer; null/absent/≤0 means the
 *      artifact makes NO N-run claim (that is allowed, it just can't be presented as "N runs").
 *   3. Every generatedPick MUST carry non-empty sourceFields (no pick without provenance).
 *   4. distributions present ⇒ must be a real object of named distributions with non-empty described
 *      bins (and sample-backed counts when sampleCount is claimed); absent/null ⇒ fine, BUT the game
 *      MUST then declare a "distributions" unavailable module (honest "no histograms" surface).
 *   5. No fabricated xG / corners / cards / first-scorer: those live under a strict, sourced shape
 *      only. Any stray/legacy fabricated key on the game or summary is rejected.
 *
 * The Phase-4 generator will be expected to produce artifacts that pass this. The Phase-5 UI can
 * trust a passing artifact's honesty invariants without re-checking them.
 */

import type {
  GameSimulationArtifact,
  GameSimulationGame,
  GameSimulationValidationResult,
  SimGeneratedPick,
} from "./types";

// Fields that, if they appear as fabricated top-level keys, indicate invented soccer detail. These
// are only ever legitimate inside a properly-shaped, sourced module — never as bare game/summary keys.
const FABRICATED_SOCCER_KEYS = ["xg", "expectedGoals", "corners", "cards", "firstScorer", "first_scorer"];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * True when the artifact/simulation may present an "N runs" claim: runCount must be a POSITIVE
 * INTEGER. `null`, absent, `0`, negatives, and non-integers all mean "no N-run claim allowed".
 * Exposed for the UI + tests so the run-count honesty rule lives in exactly one place.
 */
export function allowsRunCountClaim(
  sim: Pick<GameSimulationArtifact, "runCount"> | { runCount?: number | null } | null | undefined,
): boolean {
  const rc = sim?.runCount;
  return typeof rc === "number" && Number.isInteger(rc) && rc > 0;
}

/** Validate one generated pick. Pushes namespaced errors. */
function validatePick(pick: unknown, gameId: string, idx: number, errors: string[]): void {
  const where = `games[${gameId}].generatedPicks[${idx}]`;
  if (!isObject(pick)) {
    errors.push(`${where}: not an object`);
    return;
  }
  const p = pick as Partial<SimGeneratedPick> & Record<string, unknown>;
  if (!isNonEmptyString(p.id)) errors.push(`${where}.id: missing/empty`);
  if (!isNonEmptyString(p.market)) errors.push(`${where}.market: missing/empty`);
  if (!isNonEmptyString(p.side)) errors.push(`${where}.side: missing/empty`);
  if (!isFiniteNumber(p.modelProbability)) errors.push(`${where}.modelProbability: not a finite number`);
  if (!isFiniteNumber(p.marketProbability)) errors.push(`${where}.marketProbability: not a finite number`);
  // PROVENANCE — the core rule: no pick without sourced fields.
  if (!Array.isArray(p.sourceFields) || p.sourceFields.length === 0 || !p.sourceFields.every(isNonEmptyString)) {
    errors.push(`${where}.sourceFields: must be a non-empty array of field paths (no pick without provenance)`);
  }
  // Paper-only guard: must be explicitly true.
  if (p.paperOnly !== true) errors.push(`${where}.paperOnly: must be true (paper-only/educational)`);
}

/** Validate the distributions block against its pairing + realness rules. */
function validateDistributions(game: GameSimulationGame, errors: string[]): void {
  const where = `games[${game.gameId}].distributions`;
  const dist = game.distributions;

  // Absent / null is allowed, but MUST be declared as an unavailable module (honest "no histograms").
  if (dist === undefined || dist === null) {
    const declared = Array.isArray(game.unavailableModules)
      ? game.unavailableModules.some((m) => isObject(m) && m.module === "distributions")
      : false;
    if (!declared) {
      errors.push(
        `${where}: absent/null but no "distributions" entry in unavailableModules ` +
          `(missing histograms must be surfaced as an unavailable module, never faked)`,
      );
    }
    return;
  }

  // Present ⇒ must be a real object of named distributions.
  if (!isObject(dist)) {
    errors.push(`${where}: present but not an object of named distributions`);
    return;
  }
  const keys = Object.keys(dist);
  if (keys.length === 0) {
    errors.push(`${where}: present but empty — an empty distributions object is not a real distribution`);
    return;
  }
  for (const key of keys) {
    const d = (dist as Record<string, unknown>)[key];
    const dw = `${where}.${key}`;
    if (!isObject(d)) {
      errors.push(`${dw}: not an object`);
      continue;
    }
    if (!isNonEmptyString(d.key)) errors.push(`${dw}.key: missing/empty`);
    if (!isNonEmptyString(d.label)) errors.push(`${dw}.label: missing/empty`);
    const bins = d.bins;
    if (!Array.isArray(bins) || bins.length === 0) {
      errors.push(`${dw}.bins: must be a non-empty array of described bins (no fake empty histogram)`);
      continue;
    }
    bins.forEach((bin, bi) => {
      if (!isObject(bin)) {
        errors.push(`${dw}.bins[${bi}]: not an object`);
        return;
      }
      if (!isNonEmptyString(bin.label)) errors.push(`${dw}.bins[${bi}].label: missing/empty`);
      if (!isFiniteNumber(bin.probability)) errors.push(`${dw}.bins[${bi}].probability: not a finite number`);
    });
    // If a sampleCount is claimed, it must be a positive integer AND every bin must carry a count
    // (you cannot claim sampling and then omit the per-bin sample evidence).
    if (d.sampleCount !== undefined) {
      if (!(typeof d.sampleCount === "number" && Number.isInteger(d.sampleCount) && d.sampleCount > 0)) {
        errors.push(`${dw}.sampleCount: claimed but not a positive integer`);
      } else if (Array.isArray(bins) && !bins.every((b) => isObject(b) && Number.isInteger((b as Record<string, unknown>).count as number))) {
        errors.push(`${dw}.sampleCount: claims sampling but bins lack integer sample counts`);
      }
    }
  }
}

/** Reject fabricated soccer-detail keys sitting bare on the game or its summary. */
function rejectFabricatedFields(game: GameSimulationGame, errors: string[]): void {
  const scan = (holder: unknown, label: string) => {
    if (!isObject(holder)) return;
    for (const bad of FABRICATED_SOCCER_KEYS) {
      if (bad in holder) {
        errors.push(
          `games[${game.gameId}].${label}.${bad}: fabricated ${bad} field is not allowed ` +
            `(xG/corners/cards/first-scorer must be a sourced module or absent)`,
        );
      }
    }
  };
  scan(game as unknown as Record<string, unknown>, "");
  scan(game.simulationSummary as unknown, "simulationSummary");
}

/** Validate one game block. */
function validateGame(game: unknown, idx: number, errors: string[]): void {
  if (!isObject(game)) {
    errors.push(`games[${idx}]: not an object`);
    return;
  }
  const g = game as Partial<GameSimulationGame> & Record<string, unknown>;
  const gid = isNonEmptyString(g.gameId) ? g.gameId : `#${idx}`;
  if (!isNonEmptyString(g.gameId)) errors.push(`games[${idx}].gameId: missing/empty`);
  if (!isNonEmptyString(g.slug)) errors.push(`games[${gid}].slug: missing/empty`);

  const status = g.status;
  if (status !== "ready" && status !== "unavailable" && status !== "stale" && status !== "error") {
    errors.push(`games[${gid}].status: invalid status "${String(status)}"`);
  }

  if (!isObject(g.teams) || !isNonEmptyString(g.teams.home) || !isNonEmptyString(g.teams.away)) {
    errors.push(`games[${gid}].teams: must have non-empty home/away`);
  }

  // Integrity — REQUIRED and non-empty for ready games; must at least be present otherwise.
  const integ = g.integrity;
  if (!isObject(integ)) {
    errors.push(`games[${gid}].integrity: missing`);
  } else if (status === "ready") {
    if (!isNonEmptyString(integ.sourceBoardHash)) {
      errors.push(`games[${gid}].integrity.sourceBoardHash: required + non-empty for a ready game`);
    }
    if (!isNonEmptyString(integ.artifactHash)) {
      errors.push(`games[${gid}].integrity.artifactHash: required + non-empty for a ready game`);
    }
  }

  if (!isObject(g.marketSnapshot) || !Array.isArray(g.marketSnapshot.lines)) {
    errors.push(`games[${gid}].marketSnapshot: must have a lines[] array`);
  }
  if (!isObject(g.simulationSummary)) {
    errors.push(`games[${gid}].simulationSummary: missing`);
  }

  if (!Array.isArray(g.unavailableModules)) {
    errors.push(`games[${gid}].unavailableModules: must be an array (use [] when none)`);
  }

  // Picks — provenance rule.
  if (!Array.isArray(g.generatedPicks)) {
    errors.push(`games[${gid}].generatedPicks: must be an array (use [] when none)`);
  } else {
    g.generatedPicks.forEach((pick, i) => validatePick(pick, gid, i, errors));
  }

  // Distributions pairing + realness + fabricated-field rejection (only when the shell is coherent).
  if (Array.isArray(g.unavailableModules)) {
    validateDistributions(g as GameSimulationGame, errors);
  }
  rejectFabricatedFields(g as GameSimulationGame, errors);
}

/**
 * Validate a full game-simulation artifact structurally + against the honesty rules.
 * Pure + deterministic. Returns every error found (does not throw).
 */
export function validateGameSimulation(obj: unknown): GameSimulationValidationResult {
  const errors: string[] = [];

  if (!isObject(obj)) {
    return { ok: false, errors: ["artifact: not an object"] };
  }
  const a = obj as Partial<GameSimulationArtifact> & Record<string, unknown>;

  if (!isNonEmptyString(a.date)) errors.push("date: missing/empty");
  if (a.sport !== "mlb" && a.sport !== "world_cup" && a.sport !== "nba" && a.sport !== "ufc") {
    errors.push(`sport: invalid sport "${String(a.sport)}"`);
  }
  if (!isNonEmptyString(a.generatedAt)) errors.push("generatedAt: missing/empty");
  if (!isNonEmptyString(a.modelVersion)) errors.push("modelVersion: missing/empty");
  if (!(typeof a.simulationVersion === "number" && Number.isInteger(a.simulationVersion))) {
    errors.push("simulationVersion: must be an integer");
  }
  if (!isNonEmptyString(a.sourceBoardHash)) errors.push("sourceBoardHash: missing/empty");
  if (!isNonEmptyString(a.artifactHash)) errors.push("artifactHash: missing/empty");

  // runCount: either null, or a positive integer. Anything else (0, negative, non-integer, string) is
  // an invalid "N-run" claim.
  if (a.runCount !== null && a.runCount !== undefined) {
    if (!(typeof a.runCount === "number" && Number.isInteger(a.runCount) && a.runCount > 0)) {
      errors.push("runCount: must be null (no N-run claim) or a positive integer");
    }
  }

  if (!Array.isArray(a.games)) {
    errors.push("games: must be an array");
    return { ok: errors.length === 0, errors };
  }
  a.games.forEach((game, i) => validateGame(game, i, errors));

  return { ok: errors.length === 0, errors };
}
