/**
 * UNIFIED FULL-GAME MLB SIMULATION — the canonical contract (Sprint 008 · Phase 1).
 *
 * This is the artifact a TRUE full-game Monte Carlo produces: complete baseball games simulated from the
 * first pitch through the final out, 10,000 times, with every game-level output (win probability, score,
 * total runs, run line, team totals) derived from the SAME simulated universe as the player box-score
 * aggregates. It is NOT the player-prop simulator (`lib/game-simulations`) and NOT the market-anchored
 * team-runs sampler (`lib/full-game-sim`). Nothing here reads a sportsbook number to produce an output —
 * the market snapshot travels alongside as a clearly-labelled COMPARISON layer only.
 *
 * Leakage rule: every input field must exist before first pitch. Inputs come from the public pregame board
 * (per-player projection + sigma for 4 markets, probable starters, identity) plus documented league priors;
 * a game whose required inputs are missing is emitted DEGRADED/UNAVAILABLE with the exact missing family,
 * never fabricated. See `board-adapter.ts` for the provenance boundary.
 */

/** A four-number summary of a simulated distribution (all in runs, or the stat's native unit). */
export interface DistributionSummary {
  mean: number;
  median: number;
  p10: number;
  p90: number;
}

/** One histogram bin over an integer-valued simulated quantity (runs, hits, …). Probabilities sum to 1. */
export interface SimBin {
  /** Inclusive lower edge (integer value the bin represents, or the left edge of a range bin). */
  value: number;
  /** Human label ("0", "1", …, or "12+"). */
  label: string;
  count: number;
  probability: number;
}

/** Run-line cover probabilities at one threshold, derived from the simulated final-score margin. */
export interface RunLineProb {
  /** The run-line magnitude (e.g. 1.5). */
  line: number;
  /** P(home wins by MORE than `line`) — i.e. the favourite laying `-line` covers. */
  homeCover: number;
  /** P(away wins by MORE than `line`). */
  awayCover: number;
}

/** Team-total over/under probabilities at one threshold, from that team's simulated run distribution. */
export interface TeamTotalProb {
  line: number;
  over: number;
  under: number;
}

/** A frequent final-score outcome and how often it occurred across the simulated games. */
export interface FinalScore {
  away: number;
  home: number;
  probability: number;
}

/** Simulated per-batter box-score aggregate (means across all complete games), from the unified engine. */
export interface SimBatterLine {
  playerId: number;
  name: string;
  team: string;
  battingOrder: number;
  plateAppearances: number;
  hits: number;
  totalBases: number;
  homeRuns: number;
  runs: number;
  rbi: number;
  walks: number;
  strikeouts: number;
}

/** Simulated per-pitcher box-score aggregate (starter; bullpen is an aggregate, not named). */
export interface SimPitcherLine {
  playerId: number;
  name: string;
  team: string;
  role: "starter";
  battersFaced: number;
  strikeouts: number;
  hitsAllowed: number;
  runsAllowed: number;
  outsRecorded: number;
}

/** Which pregame input families backed this game, and which degraded to a documented fallback. */
export interface FullGameCompleteness {
  /** Overall floor: "ready" = both lineups + both starters present; degraded/unavailable otherwise. */
  level: "ready" | "degraded" | "unavailable";
  /** Human, consumer-safe notes on any fallback used (documented lineup order, missing starter, …). */
  notes: string[];
  awayLineupCount: number;
  homeLineupCount: number;
  hasAwayStarter: boolean;
  hasHomeStarter: boolean;
  /** Families that do not exist pregame in the public repo for this game (marked, never faked). */
  missingFamilies: string[];
}

/** De-vigged sportsbook markets carried for COMPARISON only — never an input to the simulation. */
export interface MarketComparison {
  bookmaker: string | null;
  capturedAt: string | null;
  moneyline: { home: number | null; away: number | null } | null;
  total: { line: number | null; over: number | null } | null;
  runLine: { line: number | null; homeCover: number | null } | null;
}

/** The full-game simulation result for ONE matchup. */
export interface FullGameSimGame {
  gamePk: number;
  date: string;
  slug: string;
  awayTeam: string;
  homeTeam: string;
  awayTeamName: string;
  homeTeamName: string;
  venue: string | null;
  firstPitch: string | null;
  status: "ready" | "degraded" | "unavailable";
  completeness: FullGameCompleteness;
  /** Number of COMPLETE games simulated (0 when unavailable). */
  runCount: number;
  winProbability: { away: number; home: number } | null;
  /** Per-team run distribution summary (runs scored). */
  runs: { away: DistributionSummary; home: DistributionSummary } | null;
  /** Total runs (away + home) summary + binned distribution. */
  totalRuns: (DistributionSummary & { distribution: SimBin[] }) | null;
  /** Run differential (home − away) summary + binned distribution. */
  runDifferential: (DistributionSummary & { distribution: SimBin[] }) | null;
  /** Run-line cover probabilities at standard thresholds, from simulated margins. */
  runLine: RunLineProb[];
  /** Per-team total over/under probabilities at the market's total (halved) and integer lines. */
  teamTotals: { away: TeamTotalProb[]; home: TeamTotalProb[] } | null;
  /** Most-frequent final scores across the simulation. */
  finalScores: FinalScore[];
  /** Fraction of simulated games that went past nine innings. */
  extraInningsProbability: number | null;
  /** Simulated box-score aggregates from the SAME games. */
  players: { batters: SimBatterLine[]; pitchers: SimPitcherLine[] } | null;
  /** A 2–4 sentence factual story generated ONLY from the fields above. */
  gameStory: string[];
  /** Sportsbook comparison layer — display-only, never an input. */
  market: MarketComparison | null;
  /** Content hash over everything except `generatedAt` (reproducibility check). */
  artifactHash: string;
}

/** The daily full-game simulation artifact (all eligible games for one slate date). */
export interface FullGameSimArtifact {
  sport: "mlb";
  date: string;
  generatedAt: string;
  modelVersion: string;
  simulationVersion: number;
  runCount: number;
  sourceBoardHash: string;
  games: FullGameSimGame[];
}

// ── Engine input (leakage-safe, board-derived) ───────────────────────────────────────────────────

/** One batter's pregame projection inputs (from the public board). Rates are DERIVED, never fabricated. */
export interface BatterInput {
  playerId: number;
  name: string;
  team: string;
  /** batter_hits projection — expected hits per game. Null → team-average fallback. */
  expHits: number | null;
  /** batter_total_bases projection — expected total bases per game. Null → league bases/hit fallback. */
  expTotalBases: number | null;
  /** batter_hits_runs_rbis projection — kept for reference/parity, not a PA-model input. */
  expHrr: number | null;
}

/** One starting pitcher's pregame projection inputs (from the public board). */
export interface PitcherInput {
  playerId: number;
  name: string;
  team: string;
  /** pitcher_strikeouts projection — expected strikeouts for the start. Null → league K rate. */
  expStrikeouts: number | null;
}

/** All leakage-safe pregame inputs the engine needs for one game. */
export interface GameInput {
  gamePk: number;
  date: string;
  slug: string;
  awayTeam: string;
  homeTeam: string;
  awayTeamName: string;
  homeTeamName: string;
  venue: string | null;
  firstPitch: string | null;
  awayLineup: BatterInput[];
  homeLineup: BatterInput[];
  awayStarter: PitcherInput | null;
  homeStarter: PitcherInput | null;
  completeness: FullGameCompleteness;
  market: MarketComparison | null;
}
