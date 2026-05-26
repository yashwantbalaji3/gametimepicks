/**
 * Data loader for the unified /projections experience (sport-agnostic).
 *
 * The redesigned /projections page renders a single horizontal date
 * picker → matchup-card grid → game detail with player accordions.
 * It needs ONE payload that covers every sport with leans on every
 * available date, plus per-game market lines when fetched. This
 * module assembles that payload by re-using the existing per-sport
 * loaders (`getBoardForDate`, `getMlbBoardForDate`,
 * `getNbaGameMarketsForDate`, etc.) so we never re-parse the on-disk
 * JSON ourselves.
 *
 * Honesty rules unchanged:
 *   - We only surface dates that have AT LEAST ONE board with real
 *     leans for the date. Future-shell boards with `propsAvailable=false`
 *     and zero leans are excluded.
 *   - We only render game-market chips when the game-markets file
 *     actually has a matching row for the game. No fabrication.
 *   - We never invent a market price, a projection, or a hit rate.
 */
import fs from "node:fs";
import path from "node:path";

import { getAvailableBoardDates, getBoardForDate } from "@/lib/data";
import { getMlbBoardForDate } from "@/lib/data-mlb";
import { currentEtDate } from "@/lib/freshness";

import type { PropLean, ScheduleGame } from "@/lib/types";
import type { MlbBoardLean, MlbScheduleGame } from "@/lib/types-mlb";

export type SportKey = "nba" | "mlb";

/** A single game-card-friendly matchup, sport-agnostic. */
export interface ProjectionsGame {
  sport: SportKey;
  /** Stable identifier for routing — the sport's native game id. */
  gameId: string;
  awayTeamAbbr: string;
  awayTeamName: string | null;
  homeTeamAbbr: string;
  homeTeamName: string | null;
  /** ISO tipoff (UTC). UI formats to ET. */
  tipoffIso: string | null;
  /** Number of model leans on disk for THIS game (after de-dup). */
  projectionCount: number;
  /** Sport-agnostic market chips. Each chip is "—" friendly when null. */
  markets: GameMarketSummary | null;
  venue: string | null;
}

/** Friendly game-market chips for the matchup card / detail hero. */
export interface GameMarketSummary {
  moneyline: { home: number | null; away: number | null } | null;
  spread: { home: number | null; away: number | null } | null;
  total: { line: number | null; over: number | null; under: number | null } | null;
  bookmaker: string | null;
}

/** Normalized player lean, sport-agnostic. */
export interface ProjectionsLean {
  sport: SportKey;
  gameId: string;
  playerId: number | null;
  playerName: string;
  team: string;
  opponent: string | null;
  market: string;
  marketLabel: string;
  side: "Over" | "Under" | "Pass" | "No Play" | string;
  line: number | null;
  projection: number | null;
  edgePct: number | null;
  confidence: string;
  oddsOver: number | null;
  oddsUnder: number | null;
  recentSeries: number[] | null;
  bookmaker: string | null;
  reason: string | null;
}

export interface ProjectionsDate {
  date: string;
  /** Total games with at least one lean on this date. */
  gameCount: number;
  /** Total leans across all games on this date. */
  leanCount: number;
  games: ProjectionsGame[];
  /** All leans keyed by gameId for fast per-game lookup. */
  leansByGameId: Record<string, ProjectionsLean[]>;
}

export interface ProjectionsPayload {
  /** Dates rendered in the date pill row, ascending. */
  dates: ProjectionsDate[];
  /** Default selected date (today if present, else first future date,
   *  else last historical date). */
  defaultDate: string | null;
  /** Today's ET date for relative labels (Today / Tomorrow / etc.). */
  todayEt: string;
}

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                            */
/* -------------------------------------------------------------------------- */

const NBA_GAME_MARKETS_DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "nba",
  "game-markets",
);
const MLB_GAME_MARKETS_DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "mlb",
  "game-markets",
);

function _readJsonSafe<T>(p: string): T | null {
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

interface GameMarketsFile {
  date: string;
  games: Record<
    string,
    {
      gameId: string;
      homeTeam: string;
      awayTeam: string;
      moneyline?: { home: number | null; away: number | null } | null;
      spread?: { home: number | null; away: number | null } | null;
      total?: { line: number | null; over: number | null; under: number | null } | null;
      bookmaker?: string | null;
    }
  >;
}

function _loadGameMarkets(sport: SportKey, date: string): GameMarketsFile | null {
  const dir = sport === "nba" ? NBA_GAME_MARKETS_DIR : MLB_GAME_MARKETS_DIR;
  return _readJsonSafe<GameMarketsFile>(path.join(dir, `${date}.json`));
}

function _listMlbBoardDates(): string[] {
  const dir = path.join(process.cwd(), "public", "data", "mlb", "boards");
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* Normalizers                                                                 */
/* -------------------------------------------------------------------------- */

function _normalizeNbaLean(lean: PropLean): ProjectionsLean {
  return {
    sport: "nba",
    gameId: lean.gameId ?? "",
    playerId: lean.playerId ?? null,
    playerName: lean.playerName ?? "",
    team: lean.team ?? "",
    opponent: lean.opponent ?? null,
    market: lean.market,
    marketLabel: lean.market, // PTS/REB/AST already friendly
    side: lean.lean ?? "",
    line: typeof lean.line === "number" ? lean.line : null,
    projection: typeof lean.projection === "number" ? lean.projection : null,
    edgePct: typeof lean.edgePct === "number" ? lean.edgePct : null,
    confidence: lean.confidence ?? "",
    oddsOver: typeof lean.oddsOver === "number" ? lean.oddsOver : null,
    oddsUnder: typeof lean.oddsUnder === "number" ? lean.oddsUnder : null,
    recentSeries: Array.isArray(lean.recent10) ? lean.recent10 : null,
    bookmaker: lean.bookmaker ?? null,
    reason: lean.reason ?? null,
  };
}

function _normalizeMlbLean(lean: MlbBoardLean): ProjectionsLean {
  return {
    sport: "mlb",
    gameId: lean.gameId ?? "",
    playerId: typeof lean.playerId === "number" ? lean.playerId : null,
    playerName: lean.playerName ?? "",
    team: lean.playerTeamAbbr ?? "",
    opponent: lean.opponentAbbr ?? null,
    market: lean.marketKey ?? "",
    marketLabel: lean.marketLabel ?? lean.marketKey ?? "",
    side: lean.lean ?? "",
    line: typeof lean.line === "number" ? lean.line : null,
    projection: typeof lean.projection === "number" ? lean.projection : null,
    edgePct: typeof lean.edgePct === "number" ? lean.edgePct : null,
    confidence: lean.confidence ?? "",
    oddsOver: typeof lean.oddsOver === "number" ? lean.oddsOver : null,
    oddsUnder: typeof lean.oddsUnder === "number" ? lean.oddsUnder : null,
    recentSeries: Array.isArray(lean.recentSeries) ? lean.recentSeries : null,
    bookmaker: lean.bookmaker ?? null,
    reason: lean.reason ?? null,
  };
}

function _normalizeNbaGame(
  g: ScheduleGame,
  leansForGame: ProjectionsLean[],
  markets: GameMarketSummary | null,
): ProjectionsGame {
  return {
    sport: "nba",
    gameId: g.gameId ?? "",
    awayTeamAbbr: g.awayTeamAbbr ?? "",
    awayTeamName: g.awayTeamFull ?? null,
    homeTeamAbbr: g.homeTeamAbbr ?? "",
    homeTeamName: g.homeTeamFull ?? null,
    tipoffIso: g.tipoff ?? null,
    projectionCount: leansForGame.length,
    markets,
    venue: null,
  };
}

function _normalizeMlbGame(
  g: MlbScheduleGame,
  leansForGame: ProjectionsLean[],
  markets: GameMarketSummary | null,
): ProjectionsGame {
  // MLB schedule games key by `gamePk`; leans carry both a synthetic
  // `gameId` (from the snapshot hash) and a numeric `gamePk`. Use the
  // first lean's gameId so the matchup card joins cleanly.
  const gameIdFromLean = leansForGame[0]?.gameId ?? "";
  return {
    sport: "mlb",
    gameId: gameIdFromLean || String(g.gamePk ?? ""),
    awayTeamAbbr: g.awayTeamAbbr ?? "",
    awayTeamName: g.awayTeamName ?? null,
    homeTeamAbbr: g.homeTeamAbbr ?? "",
    homeTeamName: g.homeTeamName ?? null,
    tipoffIso: g.gameDate ?? null,
    projectionCount: leansForGame.length,
    markets,
    venue: g.venue ?? null,
  };
}

function _gameMarketsFor(
  sport: SportKey,
  date: string,
  homeTeam: string,
  awayTeam: string,
): GameMarketSummary | null {
  const file = _loadGameMarkets(sport, date);
  if (!file) return null;
  const games = file.games ?? {};
  // Match by exact home/away team strings (full names in the file). If
  // we don't have full names, fall back to substring match on the abbr.
  for (const g of Object.values(games)) {
    const h = (g.homeTeam || "").toLowerCase();
    const a = (g.awayTeam || "").toLowerCase();
    if (
      h.includes(homeTeam.toLowerCase()) &&
      a.includes(awayTeam.toLowerCase())
    ) {
      return {
        moneyline: g.moneyline ?? null,
        spread: g.spread ?? null,
        total: g.total ?? null,
        bookmaker: g.bookmaker ?? null,
      };
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Load the unified projections payload covering every date with at
 * least one real lean on disk, plus a small forward window for
 * "tomorrow" and beyond. Returns ascending dates so the date pill row
 * reads chronologically.
 */
export function loadProjectionsPayload(): ProjectionsPayload {
  const today = currentEtDate();
  const dates: ProjectionsDate[] = [];

  // Collect candidate dates from both sport board directories.
  const candidateDates = new Set<string>();
  for (const d of getAvailableBoardDates()) candidateDates.add(d);
  for (const d of _listMlbBoardDates()) candidateDates.add(d);

  const ordered = Array.from(candidateDates).sort();
  for (const date of ordered) {
    const nbaBoard = getBoardForDate(date);
    const mlbBoard = getMlbBoardForDate(date);

    const nbaLeans = (nbaBoard?.leans ?? []).map(_normalizeNbaLean);
    const mlbLeans = (mlbBoard?.leans ?? []).map(_normalizeMlbLean);
    const allLeans = [...nbaLeans, ...mlbLeans];

    // Skip dates with zero leans AND zero MLB schedule games. We
    // still want to surface MLB game cards on dates where the
    // schedule is live but player props haven't been posted yet
    // (PR #114) — those render as honest "props unavailable" cards
    // rather than disappearing.
    const mlbScheduleGames = mlbBoard?.games ?? [];
    if (allLeans.length === 0 && mlbScheduleGames.length === 0) continue;

    const leansByGameId: Record<string, ProjectionsLean[]> = {};
    for (const l of allLeans) {
      if (!l.gameId) continue;
      (leansByGameId[l.gameId] ??= []).push(l);
    }

    const games: ProjectionsGame[] = [];
    for (const g of nbaBoard?.games ?? []) {
      const gameId = g.gameId ?? "";
      const leans = leansByGameId[gameId] ?? [];
      if (leans.length === 0) continue;
      const markets =
        g.awayTeamFull && g.homeTeamFull
          ? _gameMarketsFor("nba", date, g.homeTeamFull, g.awayTeamFull)
          : null;
      games.push(_normalizeNbaGame(g, leans, markets));
    }
    for (const g of mlbBoard?.games ?? []) {
      // Group MLB leans by their (away→home) matchup since gameId on
      // leans is a synthetic hash that won't appear on the schedule.
      const matchupLeans = mlbLeans.filter(
        (l) =>
          l.team === g.awayTeamAbbr ||
          l.team === g.homeTeamAbbr ||
          l.opponent === g.awayTeamAbbr ||
          l.opponent === g.homeTeamAbbr,
      );
      // Restrict to leans whose matchup matches (handles cross-team
      // duplicate strings cleanly).
      const filtered = matchupLeans.filter(
        (l) =>
          (l.team === g.awayTeamAbbr && l.opponent === g.homeTeamAbbr) ||
          (l.team === g.homeTeamAbbr && l.opponent === g.awayTeamAbbr),
      );
      // PR #114: even when this matchup has zero leans (player props
      // not yet posted by the books), we still render the game card
      // with an honest "props unavailable" projectionCount of 0.
      // Previously this `continue` silently dropped MLB cards on dates
      // where the schedule was live but props weren't, so /projections
      // looked like an NBA-only page even with 15 MLB games today.
      const markets =
        g.awayTeamName && g.homeTeamName
          ? _gameMarketsFor("mlb", date, g.homeTeamName, g.awayTeamName)
          : null;
      games.push(_normalizeMlbGame(g, filtered, markets));
      if (filtered.length > 0) {
        // Re-index THESE leans under the matchup's effective gameId.
        leansByGameId[filtered[0].gameId] = filtered;
      }
    }

    if (games.length === 0) continue;

    dates.push({
      date,
      gameCount: games.length,
      leanCount: games.reduce((acc, g) => acc + g.projectionCount, 0),
      games,
      leansByGameId,
    });
  }

  // Filter to today + future ONLY. Historical dates belong on /results
  // (they're already graded, audited, and surfaced there). The
  // /projections page is the "tonight + upcoming" surface — historical
  // pills crowd the date row and lead casual readers away from the
  // live slate.
  const forwardDates = dates.filter((d) => d.date >= today);

  // Default date selection: today if available, else next future date,
  // else last available historical date as a fallback if nothing forward
  // exists (e.g. offseason with no future projections).
  let defaultDate: string | null = null;
  const todayMatch = forwardDates.find((d) => d.date === today);
  if (todayMatch) defaultDate = todayMatch.date;
  if (!defaultDate && forwardDates.length > 0) {
    defaultDate = forwardDates[0].date;
  }
  if (!defaultDate && dates.length > 0) {
    defaultDate = dates[dates.length - 1].date;
  }

  return {
    dates: forwardDates.length > 0 ? forwardDates : dates.slice(-1),
    defaultDate,
    todayEt: today,
  };
}
