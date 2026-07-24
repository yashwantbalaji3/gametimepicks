/**
 * BOARD → ENGINE INPUT ADAPTER (Sprint 008). Turns the public pregame board (`boards/<date>.json`) into
 * leakage-safe `GameInput`s. Every field comes from the board (generated before first pitch); nothing is
 * read from the market or the internal research archive.
 *
 * Lineups are the batters the book posts a hits line for (~9/team = the implied starters). When fewer than
 * nine are posted, the lineup is padded to nine with a documented REPLACEMENT-LEVEL fallback (below-average,
 * clearly named "Lineup fallback", not a real player) and the game is marked DEGRADED with the exact reason
 * — never a fabricated high-confidence projection. A game with no probable starter still simulates against a
 * league bullpen aggregate, also marked DEGRADED.
 */

import type { BatterInput, FullGameCompleteness, GameInput, MarketComparison, PitcherInput } from "./types";

/** Documented replacement-level filler used when the board posts fewer than nine batters for a team. */
const FALLBACK_BATTER = (slot: number): BatterInput => ({
  playerId: -slot, // negative sentinel → never collides with a real StatsAPI id
  name: "Lineup fallback",
  team: "",
  expHits: 0.7,
  expTotalBases: 1.1,
  expHrr: 1.5,
});

const LINEUP_SIZE = 9;

interface BoardLean {
  gamePk: number;
  playerId: number;
  playerName: string;
  playerTeamAbbr: string;
  playerRole: string;
  marketKey: string;
  projection: number | null;
  [k: string]: unknown;
}
interface BoardGame {
  gamePk: number;
  date: string;
  venue: string | null;
  gameDate: string | null;
  awayTeamAbbr: string;
  homeTeamAbbr: string;
  awayTeamName: string;
  homeTeamName: string;
  awayProbablePitcherId: number | null;
  awayProbablePitcherName: string | null;
  homeProbablePitcherId: number | null;
  homeProbablePitcherName: string | null;
}
export interface Board {
  date: string;
  games: BoardGame[];
  leans: BoardLean[];
}

/** Build one team's batting lineup (up to nine) from the board's hit-line batters, joining TB + H+R+RBI. */
function buildLineup(leans: BoardLean[], team: string): { lineup: BatterInput[]; realCount: number } {
  const hitters = leans.filter((l) => l.marketKey === "batter_hits" && l.playerTeamAbbr === team && l.projection != null);
  const real: BatterInput[] = hitters.map((h) => {
    const tb = leans.find((l) => l.marketKey === "batter_total_bases" && l.playerId === h.playerId);
    const hrr = leans.find((l) => l.marketKey === "batter_hits_runs_rbis" && l.playerId === h.playerId);
    return {
      playerId: h.playerId,
      name: h.playerName,
      team,
      expHits: h.projection,
      expTotalBases: (tb?.projection as number | undefined) ?? null,
      expHrr: (hrr?.projection as number | undefined) ?? null,
    };
  });
  const lineup = real.slice(0, LINEUP_SIZE);
  for (let s = lineup.length; s < LINEUP_SIZE; s += 1) lineup.push({ ...FALLBACK_BATTER(s + 1), team });
  return { lineup, realCount: real.length };
}

function buildStarter(
  leans: BoardLean[],
  pitcherId: number | null,
  pitcherName: string | null,
  team: string,
): PitcherInput | null {
  if (pitcherId == null || !pitcherName) return null;
  const k = leans.find((l) => l.marketKey === "pitcher_strikeouts" && l.playerId === pitcherId);
  return { playerId: pitcherId, name: pitcherName, team, expStrikeouts: (k?.projection as number | undefined) ?? null };
}

/** Convert one board game into a leakage-safe engine `GameInput`, with completeness + optional market layer. */
export function gameInputFromBoard(board: Board, game: BoardGame, market: MarketComparison | null): GameInput {
  const leans = board.leans.filter((l) => l.gamePk === game.gamePk);
  const away = buildLineup(leans, game.awayTeamAbbr);
  const home = buildLineup(leans, game.homeTeamAbbr);
  const awayStarter = buildStarter(leans, game.awayProbablePitcherId, game.awayProbablePitcherName, game.awayTeamAbbr);
  const homeStarter = buildStarter(leans, game.homeProbablePitcherId, game.homeProbablePitcherName, game.homeTeamAbbr);

  const notes: string[] = [];
  const missingFamilies: string[] = [];
  if (away.realCount < LINEUP_SIZE)
    notes.push(`${game.awayTeamAbbr} lineup padded: ${away.realCount}/9 batters posted pregame (replacement-level fallback for the rest).`);
  if (home.realCount < LINEUP_SIZE)
    notes.push(`${game.homeTeamAbbr} lineup padded: ${home.realCount}/9 batters posted pregame (replacement-level fallback for the rest).`);
  if (!awayStarter) { notes.push(`${game.awayTeamAbbr} has no posted probable starter — simulated vs a league bullpen aggregate.`); missingFamilies.push("away_probable_starter"); }
  else if (awayStarter.expStrikeouts == null) notes.push(`${game.awayTeamAbbr} starter ${awayStarter.name} has no strikeout projection — league starter rate used.`);
  if (!homeStarter) { notes.push(`${game.homeTeamAbbr} has no posted probable starter — simulated vs a league bullpen aggregate.`); missingFamilies.push("home_probable_starter"); }
  else if (homeStarter.expStrikeouts == null) notes.push(`${game.homeTeamAbbr} starter ${homeStarter.name} has no strikeout projection — league starter rate used.`);
  // Families that never exist pregame on the public surface (documented, never faked).
  missingFamilies.push("confirmed_batting_order", "park_run_factors", "weather", "batter_handedness_splits");

  const enoughToSimulate = away.realCount >= 6 && home.realCount >= 6;
  const fullyReady = away.realCount >= LINEUP_SIZE && home.realCount >= LINEUP_SIZE && !!awayStarter && !!homeStarter;
  const level: FullGameCompleteness["level"] = !enoughToSimulate ? "unavailable" : fullyReady ? "ready" : "degraded";

  const completeness: FullGameCompleteness = {
    level,
    notes,
    awayLineupCount: away.realCount,
    homeLineupCount: home.realCount,
    hasAwayStarter: !!awayStarter,
    hasHomeStarter: !!homeStarter,
    missingFamilies,
  };

  const slug = `${game.awayTeamAbbr.toLowerCase()}-vs-${game.homeTeamAbbr.toLowerCase()}-${game.date}`;

  return {
    gamePk: game.gamePk,
    date: game.date,
    slug,
    awayTeam: game.awayTeamAbbr,
    homeTeam: game.homeTeamAbbr,
    awayTeamName: game.awayTeamName,
    homeTeamName: game.homeTeamName,
    venue: game.venue,
    firstPitch: game.gameDate,
    awayLineup: away.lineup,
    homeLineup: home.lineup,
    awayStarter,
    homeStarter,
    completeness,
    market,
  };
}

/** All games on the board as engine inputs. */
export function gameInputsFromBoard(board: Board, marketByGamePk?: Map<number, MarketComparison>): GameInput[] {
  return board.games.map((g) => gameInputFromBoard(board, g, marketByGamePk?.get(g.gamePk) ?? null));
}
