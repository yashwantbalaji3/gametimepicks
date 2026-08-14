/**
 * DETERMINISTIC GAME SIMULATION — persisted artifact CONTRACT (Phase 3).
 *
 * A "game simulation" is a PRECOMPUTED, deterministic, per-game artifact: the site reveals it when a
 * user clicks "Generate Simulation" on a game, and every user sees the SAME output for the same
 * game + model version. Nothing is computed live in the browser. This file defines the persisted
 * shape ONLY — there is no generator here (that is Phase 4) and no UI wiring (that is Phase 5).
 *
 * Persisted path convention:
 *   public/data/{sport}/game-simulations/YYYY-MM-DD.json
 *   e.g. public/data/mlb/game-simulations/2026-07-08.json
 *        public/data/world-cup/game-simulations/2026-07-08.json
 *
 * HONESTY is the whole point of the contract (also see docs/GAME_SIMULATION_ARTIFACT_SPEC.md):
 *   - The UI may claim "simulated" ONLY when a game's status is "ready".
 *   - The UI may claim "N runs" ONLY when `runCount` is a positive integer (null/absent ⇒ no claim).
 *   - The UI may render histograms ONLY when `distributions` actually exist for that game.
 *   - The UI may show xG / corners / cards / first-scorer ONLY when those fields are present with
 *     sourced values — nothing may be fabricated to look real.
 *   - A generated pick may exist ONLY when it carries non-empty `sourceFields` provenance.
 *   - Everything here is PAPER-ONLY / educational — `generatedPicks[].paperOnly` is always true.
 *
 * The types are intentionally framework-free (no React/Next imports) so the reader, validator, the
 * Phase-4 generator, and the Phase-5 UI can all share them, and so tsx can run the tests directly.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Sport keys that may own a game-simulations artifact. Mirrors the site's SportKey space. */
export type SimSportKey = "mlb" | "world_cup" | "nba" | "ufc" | "nfl";

/**
 * Per-game readiness. This is the honesty flag the whole UI keys off:
 *   - "ready"       — the simulation is real and complete for this game.
 *   - "unavailable" — no simulation for this game (not enough inputs, no board row, etc.).
 *   - "stale"       — a simulation exists but is older than the current model/simulation version
 *                     or the current slate date (the reader may also derive this).
 *   - "error"       — the game's simulation is malformed / self-inconsistent.
 */
export type GameSimStatus = "ready" | "unavailable" | "stale" | "error";

/** Coarse risk bucket for a generated pick. Deliberately small + stable. */
export type SimRiskTier = "anchor" | "core" | "value" | "longshot";

/** Freshness block — pure data, no clock. The reader/UI decide "how old" against an injected clock. */
export interface SimFreshness {
  /** The slate date this game belongs to (YYYY-MM-DD), duplicated for convenience. */
  slateDate: string;
  /** ISO timestamp the underlying board/source was captured. */
  sourceCapturedAt: string;
  /** ISO timestamp this simulation was generated. */
  generatedAt: string;
  /** Optional human note (e.g. "regulation 90 only"). */
  note?: string;
}

// ---------------------------------------------------------------------------
// Market snapshot — the REAL board fields the simulation was derived from
// ---------------------------------------------------------------------------

/**
 * A single sourced market line copied verbatim from the board. This is provenance, not invention:
 * every projection/pick must trace back to entries like these.
 */
export interface SimMarketLine {
  /** Market key as it appears on the board (e.g. "moneyline", "total", "spread", "player_hits"). */
  market: string;
  /** Which side this line describes (e.g. "home", "over", "under", team/player token). */
  side: string;
  /** Optional player token for player markets. */
  player?: string;
  /** Optional team token for team markets. */
  team?: string;
  /** Numeric line where applicable (total 8.5, spread -1.5). Null for pure win markets. */
  line: number | null;
  /** American odds as sourced (e.g. -145, +200). */
  americanOdds: number;
  /** Implied (vig-included) probability derived from `americanOdds`, 0..1. */
  impliedProbability: number;
}

/**
 * The board-derived market context for one game. `lines` are the exact rows used; nothing here is
 * synthesized. `bookmaker` / `capturedAt` document the provenance of the odds.
 */
export interface SimMarketSnapshot {
  bookmaker?: string;
  capturedAt: string;
  lines: SimMarketLine[];
}

// ---------------------------------------------------------------------------
// Simulation summary + distributions
// ---------------------------------------------------------------------------

/**
 * Top-line model read for the game. These are point estimates / probabilities the model produced.
 * They are always safe to show for a "ready" game because they are the model's own numbers — but
 * they do NOT by themselves justify a "histogram" or an "N runs" claim (those need `distributions`
 * and `runCount` respectively).
 */
export interface SimSummary {
  /** Model win probability for the home side, 0..1 (soccer: regulation-aware per `note`). */
  homeWinProbability?: number;
  /** Model win probability for the away side, 0..1. */
  awayWinProbability?: number;
  /** Model draw probability, 0..1 (soccer). */
  drawProbability?: number;
  /** Projected total (runs/goals/points) as a point estimate. */
  projectedTotal?: number;
  /** Projected home score. */
  projectedHomeScore?: number;
  /** Projected away score. */
  projectedAwayScore?: number;
  /** Free-form, human-readable one-line read (already honest; no fabricated specifics). */
  headline?: string;
}

/** A single labeled histogram bin. `count`/`probability` describe how much mass lands in the bin. */
export interface SimDistributionBin {
  label: string;
  /** Inclusive lower edge of the bin (optional for categorical bins). */
  lowerEdge?: number;
  /** Exclusive upper edge of the bin (optional for categorical bins). */
  upperEdge?: number;
  /** Raw sample count in this bin (present only when sampling actually ran). */
  count?: number;
  /** Probability mass in this bin, 0..1. */
  probability: number;
}

/**
 * One named distribution (e.g. "total_runs", "margin"). A distribution is REAL only when it carries
 * described bins (and, when sampling ran, sample counts). The reader refuses to invent an empty
 * distribution: a game without this simply reports the module as unavailable.
 */
export interface SimDistribution {
  /** Machine key, e.g. "total_runs" | "total_goals" | "margin" | "home_score". */
  key: string;
  /** Human label for the histogram. */
  label: string;
  /** Number of samples backing this distribution (present only when sampling ran). */
  sampleCount?: number;
  /** The bins. MUST be non-empty for a distribution to count as real. */
  bins: SimDistributionBin[];
}

/**
 * The full distributions block for a game. Keyed by distribution key. May be `null` or entirely
 * absent — that is the honest "we did not compute histograms for this game" state, and the reader
 * surfaces it as an unavailable module rather than faking empty bins.
 */
export type SimDistributions = Record<string, SimDistribution> | null;

// ---------------------------------------------------------------------------
// Generated picks — every pick carries provenance
// ---------------------------------------------------------------------------

/**
 * A model-generated, PAPER-ONLY pick derived from the simulation. The non-negotiable rule: it MUST
 * carry non-empty `sourceFields` — the real board field paths it was derived from — so no pick can
 * exist without provenance. `edgePct` = (modelProbability − marketProbability) * 100.
 */
export interface SimGeneratedPick {
  /** Stable id for this pick within the artifact. */
  id: string;
  sport: SimSportKey;
  /** The game this pick belongs to (matches the owning game's `gameId`). */
  gameId: string;
  /** Market key (e.g. "total", "moneyline", "player_hits"). */
  market: string;
  /** Player token for player markets. */
  player?: string;
  /** Team token for team markets. */
  team?: string;
  /** Numeric line (null for pure win markets). */
  line: number | null;
  /** Side taken (e.g. "over", "home", team/player token). */
  side: string;
  /** Model point projection backing the pick (e.g. projected total 9.1). */
  projection: number;
  /** Model probability the pick hits, 0..1. */
  modelProbability: number;
  /** Vig-included market probability for the same outcome, 0..1. */
  marketProbability: number;
  /** Edge in percentage points: (modelProbability − marketProbability) * 100. */
  edgePct: number;
  /** Model confidence 0..1 (not a guarantee — display only). */
  confidence: number;
  riskTier: SimRiskTier;
  /** Short, honest bullet reasons. */
  reasonBullets: string[];
  /**
   * PROVENANCE — the real artifact/board field paths this pick was derived from
   * (e.g. ["marketSnapshot.lines[2].americanOdds", "simulationSummary.projectedTotal"]).
   * MUST be non-empty. A pick without this is rejected by the validator.
   */
  sourceFields: string[];
  /** Always true — these are educational paper picks, never advice to wager. */
  paperOnly: true;
}

// ---------------------------------------------------------------------------
// Unavailable modules — the honest "not yet available" surface
// ---------------------------------------------------------------------------

/**
 * Declares a module that was NOT produced for this game, with a machine reason, the artifact field
 * that WOULD carry it, and ready-to-render copy. This is how "Simulation not yet available" (or a
 * specific "no histograms for this game") is surfaced honestly instead of via faked empty data.
 */
export interface SimUnavailableModule {
  /** Machine key, e.g. "distributions" | "xg" | "corners" | "cards" | "first_scorer". */
  module: string;
  /** Machine reason, e.g. "no_sampling" | "insufficient_inputs" | "not_supported_for_sport". */
  reason: string;
  /** The artifact field that would carry this module if it existed (e.g. "distributions"). */
  requiredArtifactField: string;
  /** Human copy the UI can show as-is (e.g. "Histograms not available for this game."). */
  displayCopy: string;
}

// ---------------------------------------------------------------------------
// Integrity — per-game hashes proving the game is really backed by a source
// ---------------------------------------------------------------------------

/**
 * Per-game integrity block. For a "ready" game, `sourceBoardHash` and `artifactHash` MUST be present
 * and non-empty (the validator enforces this): they prove the game's simulation is pinned to a real
 * board snapshot and to its own serialized content.
 */
export interface SimIntegrity {
  /** Hash of the board slice this game's simulation was derived from. */
  sourceBoardHash: string;
  /** Hash of this game's serialized simulation content. */
  artifactHash: string;
}

// ---------------------------------------------------------------------------
// Game + top-level artifact
// ---------------------------------------------------------------------------

/** Home/away team tokens for a simulated game. */
export interface SimTeams {
  home: string;
  away: string;
}

/** One game's simulation inside the daily artifact. */
export interface GameSimulationGame {
  gameId: string;
  /** MLB game primary key when applicable. */
  gamePk?: number;
  /** Soccer provider match id when applicable. */
  matchId?: string;
  /** Deterministic slug (home-vs-away-date). */
  slug: string;
  teams: SimTeams;
  status: GameSimStatus;
  freshness: SimFreshness;
  marketSnapshot: SimMarketSnapshot;
  simulationSummary: SimSummary;
  /**
   * Histograms. `null`/absent is the honest "not computed" state and MUST also be declared in
   * `unavailableModules` (the validator enforces the pairing). Present ⇒ must be real (non-empty bins).
   */
  distributions?: SimDistributions;
  generatedPicks: SimGeneratedPick[];
  unavailableModules: SimUnavailableModule[];
  integrity: SimIntegrity;
}

/**
 * The full per-day, per-sport artifact persisted at
 * public/data/{sport}/game-simulations/YYYY-MM-DD.json.
 */
export interface GameSimulationArtifact {
  /** Slate date (YYYY-MM-DD). */
  date: string;
  sport: SimSportKey;
  /** ISO timestamp the artifact was generated. */
  generatedAt: string;
  /** Model version string (e.g. "mlb-2026.07"). Drives staleness together with `simulationVersion`. */
  modelVersion: string;
  /** Simulation-format/engine version (integer, bump on breaking changes to sampling/shape). */
  simulationVersion: number;
  /**
   * Number of Monte-Carlo runs behind the sampling, or `null` when NO sampling ran. `null` (or a
   * non-positive integer) means the UI may NOT make an "N runs" claim. See `allowsRunCountClaim`.
   */
  runCount: number | null;
  /** Hash of the whole source board the artifact was generated from. */
  sourceBoardHash: string;
  /** Hash of the whole serialized artifact content. */
  artifactHash: string;
  games: GameSimulationGame[];
}

// ---------------------------------------------------------------------------
// Reader result — honest wrapper the site consumes
// ---------------------------------------------------------------------------

/**
 * Result returned by the reader for a SINGLE game. `status` is the honesty contract:
 *   - "ready"       — `game` is populated and its status is ready.
 *   - "unavailable" — no artifact file, or the game is not in the artifact (well-formed, not an error).
 *   - "stale"       — the artifact is older than the requested/current model+simulation version/date.
 *   - "error"       — the artifact was malformed / unparseable (the ONLY error case).
 * `unavailableModules` mirrors the game's declared missing modules (e.g. distributions) so the UI
 * never has to guess. `reason` is a short machine string for logging/telemetry.
 */
export interface GameSimulationReadResult {
  status: GameSimStatus;
  sport: SimSportKey;
  date: string;
  gameId: string;
  /** Present only when status === "ready" (and only then may the UI claim "simulated"). */
  game: GameSimulationGame | null;
  /** Missing modules for this game (empty when unknown/unavailable). */
  unavailableModules: SimUnavailableModule[];
  /** Short machine reason, e.g. "ok" | "no_artifact_file" | "game_not_in_artifact" | "malformed_artifact" | "stale_version". */
  reason: string;
  /** Validation errors when status === "error". Empty otherwise. */
  errors: string[];
}

/** Result of `validateGameSimulation` — structural + honesty validation. */
export interface GameSimulationValidationResult {
  ok: boolean;
  errors: string[];
}
