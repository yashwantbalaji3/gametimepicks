/**
 * Phase 7B-4 — Lean enrichment.
 *
 * Real props from The Odds API arrive with rich market/line/odds data but
 * may have empty `team` and `opponent` fields when the pipeline couldn't
 * resolve player→team via nba_api (rosters unreachable). The pipeline
 * preserves the `gameId` on each lean, and `board.games` has authoritative
 * team info, so we can derive the missing fields at render time without
 * fabricating anything.
 *
 * This file is pure / side-effect free / no I/O — safe in client and
 * server components.
 */
import type { ScheduleGame, PropLean } from "./types";

/**
 * GameKey — a stable identifier for "which game this prop belongs to."
 *
 * Format: "{awayAbbr}@{homeAbbr}" (e.g. "CLE@DET"). Used for grouping
 * in the UI and as the value of the game filter.
 *
 * If the lean has no resolvable game, returns null. Callers should treat
 * null as "ungrouped" — never as a fake key.
 */
export function gameKeyForLean(
  lean: Pick<PropLean, "gameId" | "tipoff" | "team" | "opponent" | "homeAway">,
  games: ScheduleGame[],
): string | null {
  const g = matchGameForLean(lean, games);
  if (!g) return null;
  return `${g.awayTeamAbbr}@${g.homeTeamAbbr}`;
}

/**
 * Match a lean to its game in the slate.
 *
 * Resolution priority:
 *   1. exact gameId match (most reliable)
 *   2. tipoff match — when there's exactly one game at the lean's tipoff
 *   3. team+homeAway match — when team is populated
 *
 * Returns null if no confident match. Never guesses.
 */
export function matchGameForLean(
  lean: Pick<PropLean, "gameId" | "tipoff" | "team" | "opponent" | "homeAway">,
  games: ScheduleGame[],
): ScheduleGame | null {
  if (!games || games.length === 0) return null;

  // 1. gameId exact match
  if (lean.gameId) {
    const byId = games.find((g) => g.gameId === lean.gameId);
    if (byId) return byId;
  }

  // 2. tipoff unique match
  if (lean.tipoff) {
    const byTipoff = games.filter((g) => g.tipoff === lean.tipoff);
    if (byTipoff.length === 1) return byTipoff[0];
  }

  // 3. team + homeAway
  if (lean.team) {
    const byTeam = games.find((g) =>
      lean.homeAway === "Home"
        ? g.homeTeamAbbr === lean.team
        : g.awayTeamAbbr === lean.team,
    );
    if (byTeam) return byTeam;
  }

  return null;
}

/**
 * Return a copy of the lean with `team`, `teamFullName`, `opponent`,
 * `opponentFullName` populated from the matching game when missing.
 * Never overwrites existing values — only fills in blanks.
 *
 * If we can't match the lean to a game, returns the lean unchanged
 * (no fabrication).
 */
export function enrichLeanWithGame(
  lean: PropLean,
  games: ScheduleGame[],
): PropLean {
  // Already enriched
  if (lean.team && lean.opponent) return lean;

  const g = matchGameForLean(lean, games);
  if (!g) return lean;

  // Determine which side of the game this lean is on.
  // Prefer the lean's own homeAway field; fall back to inference if unset.
  const isHome = lean.homeAway === "Home";

  return {
    ...lean,
    team: lean.team || (isHome ? g.homeTeamAbbr : g.awayTeamAbbr),
    teamFullName:
      lean.teamFullName || (isHome ? g.homeTeamFull : g.awayTeamFull),
    opponent: lean.opponent || (isHome ? g.awayTeamAbbr : g.homeTeamAbbr),
    opponentFullName:
      lean.opponentFullName ||
      (isHome ? g.awayTeamFull : g.homeTeamFull),
  };
}

/**
 * Enrich every lean in a list. Same identity-preserving rules: leans that
 * already have team/opponent set come through unchanged; leans whose game
 * can't be matched come through unchanged.
 */
export function enrichLeansWithGames(
  leans: PropLean[],
  games: ScheduleGame[],
): PropLean[] {
  if (!games || games.length === 0) return leans;
  return leans.map((l) => enrichLeanWithGame(l, games));
}

/**
 * Build the list of `GameKey` options for the game-filter chip row.
 * Uses `board.games` directly — every game is selectable, even if zero
 * leans landed for that game (so the user can see "0 props for this game"
 * rather than the chip silently disappearing).
 */
export function gameKeyOptions(games: ScheduleGame[]): {
  key: string;
  label: string;
}[] {
  return games.map((g) => ({
    key: `${g.awayTeamAbbr}@${g.homeTeamAbbr}`,
    label: `${g.awayTeamAbbr} @ ${g.homeTeamAbbr}`,
  }));
}
