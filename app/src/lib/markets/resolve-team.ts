/**
 * PLAYER PROP TEAM RESOLUTION (Sprint 029 · Phase 2).
 *
 * Every live prop row arrives with `team: null`. The temptation is to read the matchup string
 * ("Cleveland Guardians @ Tampa Bay Rays") and pick one — that is a coin flip wearing the costume
 * of data, and it would be wrong roughly half the time while looking authoritative. This module
 * resolves team ONLY from evidence, and reports honestly when there is none.
 *
 * ── The evidence chain, as it actually exists in this repo ──
 *
 *   prop.gameId ──(board)──▶ gamePk + home/away teams        → identifies the GAME (both sides)
 *   gamePk ──(lineup capture)──▶ batting order per side      → identifies WHICH side, for batters
 *
 * Two measured limits shape the design:
 *
 *   1. Lineups post progressively before first pitch. Early in the day almost none are posted, so
 *      resolution coverage is a function of WHEN you ask, not a fixed property. The caller gets a
 *      measured rate, never an assumed one.
 *   2. Batting orders exclude pitchers, and this repo has no probable-pitcher artifact. So pitcher
 *      props (pitcher_strikeouts / outs / earned_runs) currently have NO team evidence at all and
 *      correctly resolve UNRESOLVED. That is a data gap, not a resolver bug.
 *
 * Knowing the game but not the side is genuinely useful — it yields the matchup and start time —
 * so RESOLVED_FROM_GAME is reserved for a real side determination and games-only rows stay
 * UNRESOLVED while still carrying their event context.
 */
import type { MappingStatus } from "./types";

export interface GameParticipants {
  readonly eventId: string;
  readonly gamePk: number | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
}

/** Posted batting orders for one game, by side. Names as the source spells them. */
export interface GameLineups {
  readonly gamePk: number;
  readonly home: ReadonlyArray<string>;
  readonly away: ReadonlyArray<string>;
}

export interface TeamResolution {
  readonly team: string | null;
  readonly opponent: string | null;
  readonly status: MappingStatus;
  /** What settled it — carried so a surface can explain itself and an audit can retrace it. */
  readonly evidence: "provider" | "lineup" | "none";
  /** The game's participants when known, even if the side is not. */
  readonly participants: GameParticipants | null;
}

const UNRESOLVED: TeamResolution = {
  team: null,
  opponent: null,
  status: "UNRESOLVED",
  evidence: "none",
  participants: null,
};

/**
 * Normalize a player name for comparison across sources.
 *
 * Deliberately conservative: case, accents and punctuation only. It does NOT strip suffixes or
 * match on surname, because "Tatis" or "Guerrero" can identify more than one player and a
 * near-match here becomes a confident wrong attribution downstream.
 */
export function normalizePlayerName(name: string | null | undefined): string {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'`’-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Index games by their sportsbook event id. */
export function indexGames(games: ReadonlyArray<GameParticipants>): Map<string, GameParticipants> {
  const m = new Map<string, GameParticipants>();
  for (const g of games) if (g.eventId) m.set(g.eventId, g);
  return m;
}

/** Index posted lineups by gamePk. */
export function indexLineups(lineups: ReadonlyArray<GameLineups>): Map<number, GameLineups> {
  const m = new Map<number, GameLineups>();
  for (const l of lineups) if (typeof l.gamePk === "number") m.set(l.gamePk, l);
  return m;
}

/**
 * Resolve one prop row's team.
 *
 * `providerTeam` short-circuits to EXACT — if the feed ever starts supplying team, that is better
 * evidence than anything derived, and the resolver should defer to it rather than second-guess.
 */
export function resolvePlayerTeam(
  prop: { playerName: string; eventId: string; providerTeam?: string | null },
  gameIndex: Map<string, GameParticipants>,
  lineupIndex: Map<number, GameLineups>,
): TeamResolution {
  const game = prop.eventId ? gameIndex.get(prop.eventId) ?? null : null;

  if (prop.providerTeam) {
    const opponent = game
      ? prop.providerTeam === game.homeTeam
        ? game.awayTeam
        : prop.providerTeam === game.awayTeam
          ? game.homeTeam
          : null
      : null;
    return { team: prop.providerTeam, opponent, status: "EXACT", evidence: "provider", participants: game };
  }

  // No game means no participants at all — nothing downstream can be attached.
  if (!game) return UNRESOLVED;

  const lineup = game.gamePk != null ? lineupIndex.get(game.gamePk) ?? null : null;
  if (!lineup) {
    // The game is known; the side is not. Carry the participants so the matchup is still usable.
    return { ...UNRESOLVED, participants: game };
  }

  const target = normalizePlayerName(prop.playerName);
  if (!target) return { ...UNRESOLVED, participants: game };

  const onHome = lineup.home.some((n) => normalizePlayerName(n) === target);
  const onAway = lineup.away.some((n) => normalizePlayerName(n) === target);

  // Both sides = a genuine identity collision (two players sharing a name). Evidence points both
  // ways, so neither may be chosen — this is what AMBIGUOUS is for, distinct from having no
  // evidence at all.
  if (onHome && onAway) {
    return { team: null, opponent: null, status: "AMBIGUOUS", evidence: "lineup", participants: game };
  }
  if (onHome) {
    return { team: game.homeTeam, opponent: game.awayTeam, status: "RESOLVED_FROM_GAME", evidence: "lineup", participants: game };
  }
  if (onAway) {
    return { team: game.awayTeam, opponent: game.homeTeam, status: "RESOLVED_FROM_GAME", evidence: "lineup", participants: game };
  }
  // Not in either posted order — most often a pitcher (excluded from batting orders) or a bench
  // player. No evidence, so no attribution.
  return { ...UNRESOLVED, participants: game };
}

/** Only these states may back a team-attributed public comparison. */
export function isPublishableTeamMapping(status: MappingStatus): boolean {
  return status === "EXACT" || status === "RESOLVED_FROM_GAME";
}

export interface ResolutionMetrics {
  readonly total: number;
  readonly byStatus: Record<MappingStatus, number>;
  readonly gameResolved: number;
  readonly publishable: number;
  readonly publishableRate: number;
}

/** Measure resolution across a set of rows. Rates are computed, never assumed. */
export function measureResolution(resolutions: ReadonlyArray<TeamResolution>): ResolutionMetrics {
  const byStatus: Record<MappingStatus, number> = {
    EXACT: 0,
    RESOLVED_FROM_GAME: 0,
    AMBIGUOUS: 0,
    UNRESOLVED: 0,
  };
  let gameResolved = 0;
  for (const r of resolutions) {
    byStatus[r.status] += 1;
    if (r.participants) gameResolved += 1;
  }
  const publishable = byStatus.EXACT + byStatus.RESOLVED_FROM_GAME;
  return {
    total: resolutions.length,
    byStatus,
    gameResolved,
    publishable,
    publishableRate: resolutions.length ? publishable / resolutions.length : 0,
  };
}
