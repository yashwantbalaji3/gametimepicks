/**
 * TEAM RESEARCH READ MODEL (v1.3 · R1302) — pure factual selector over canonical platform records.
 *
 * Input is plain platform records (the build script reads them through `openPlatform`); output is the compact,
 * page-shaped team projection. No React, no storage, no Live, no forecast, no clock.
 *
 * RULES PINNED IN team-read-model.test.mjs
 *   - A result exists only for a FINAL game with BOTH sides' final-score rows. Pending, postponed, cancelled or
 *     score-less games are never a W, L or T, and never 0–0.
 *   - A record is derived only for sports whose platform carries team final scores (MLB runs, NFL points).
 *     EPL is refused structurally (TEAM_RESULT_FAMILY has no EPL entry) — no fixture list becomes a W-L table.
 *   - Order is the canonical event instant (startUtc, else the provider's official date), then the game id.
 *     Never a build, grading or capture time.
 *   - Zeros are recorded values: a 0-run game is a 0, never "missing".
 *   - "Upcoming" is NOT decided here: a static artifact's upcoming claim ages. Rows carry status and start; the
 *     page decides on the reader's clock.
 */
import { TEAM_RESULT_FAMILY, TEAM_SCORE_KEY } from "./stat-groups.mjs";

/** Canonical event key for ordering (mirrors the platform reader's `eventKey`). */
export const eventKey = (g) => g.startUtc ?? (g.officialDate ? `${g.officialDate}T` : "");

/** Newest first: event key desc, then id desc. */
export const newestFirst = (a, b) => (eventKey(a) === eventKey(b) ? (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : eventKey(a) < eventKey(b) ? 1 : -1);

/** The date a reader sees for a game: the provider instant, else its official date. */
export const eventDate = (g) => g.startUtc ?? g.officialDate ?? null;

/**
 * Factual result of one team in one game, or null when it cannot be proven.
 * @param {string} sportId
 * @param {any} game platform GameRecord
 * @param {string} teamId
 * @param {Map<string, any[]>} teamStatsByGame gameId → team-game stat rows
 * @returns {{ own: number, opp: number, result: "W"|"L"|"T" } | null}
 */
export function teamGameResult(sportId, game, teamId, teamStatsByGame) {
  const family = TEAM_RESULT_FAMILY[sportId];
  if (!family || !game || game.statusClass !== "FINAL") return null;
  const key = TEAM_SCORE_KEY[sportId];
  const rows = (teamStatsByGame.get(game.id) ?? []).filter((r) => r.family === family && r.isFinal === true);
  const opponentId = game.homeTeamId === teamId ? game.awayTeamId : game.awayTeamId === teamId ? game.homeTeamId : null;
  if (!opponentId) return null;
  const own = rows.find((r) => r.teamId === teamId)?.stats?.[key];
  const opp = rows.find((r) => r.teamId === opponentId)?.stats?.[key];
  if (!Number.isInteger(own) || !Number.isInteger(opp)) return null;
  return { own, opp, result: own > opp ? "W" : own < opp ? "L" : "T" };
}

/**
 * Packed game row (tuple, to keep static pages small):
 *   [gameId, date, seasonId, ha, opponentTeamId, status, own, opp, result]
 *   ha      "H" | "A" | "N" (neutral site flagged by the provider)
 *   status  "F" provider-final fact | "S" not final in the committed sources (scheduled, pending, or unrecorded)
 *   own/opp integer scores or null · result "W"|"L"|"T"|null
 */
export const TEAM_ROW = Object.freeze({ GAME: 0, DATE: 1, SEASON: 2, HA: 3, OPP: 4, STATUS: 5, OWN: 6, OPP_SCORE: 7, RESULT: 8 });

/**
 * @param {{ sportId: string, team: any, games: any[], teamStatsByGame: Map<string, any[]>, seasonLabel: (id: string) => string }} input
 */
export function buildTeamResearch({ sportId, team, games, teamStatsByGame, seasonLabel }) {
  const mine = games.filter((g) => g.homeTeamId === team.id || g.awayTeamId === team.id).sort(newestFirst);
  const supportsResults = Boolean(TEAM_RESULT_FAMILY[sportId]);

  const rows = mine.map((g) => {
    const home = g.homeTeamId === team.id;
    const res = supportsResults ? teamGameResult(sportId, g, team.id, teamStatsByGame) : null;
    return [
      g.id, eventDate(g), g.seasonId, g.neutralSite === true ? "N" : home ? "H" : "A",
      home ? g.awayTeamId : g.homeTeamId, g.statusClass === "FINAL" ? "F" : "S",
      res ? res.own : null, res ? res.opp : null, res ? res.result : null,
    ];
  });

  /** @type {Map<string, any>} */
  const bySeason = new Map();
  for (const r of rows) {
    const s = bySeason.get(r[TEAM_ROW.SEASON]) ?? { id: r[TEAM_ROW.SEASON], label: seasonLabel(r[TEAM_ROW.SEASON]), games: 0, finalsWithScore: 0, w: 0, l: 0, t: 0, scored: 0, allowed: 0, firstDate: null, lastDate: null };
    s.games += 1;
    if (r[TEAM_ROW.RESULT]) {
      s.finalsWithScore += 1;
      s[r[TEAM_ROW.RESULT].toLowerCase()] += 1;
      s.scored += r[TEAM_ROW.OWN];
      s.allowed += r[TEAM_ROW.OPP_SCORE];
    }
    const d = r[TEAM_ROW.DATE];
    if (d && (!s.firstDate || d < s.firstDate)) s.firstDate = d;
    if (d && (!s.lastDate || d > s.lastDate)) s.lastDate = d;
    bySeason.set(s.id, s);
  }
  const seasons = [...bySeason.values()]
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .map((s) => ({
      id: s.id, label: s.label, games: s.games,
      // A record is shown only where results are a supported fact AND at least one final carries both scores.
      record: supportsResults && s.finalsWithScore > 0 ? { w: s.w, l: s.l, t: s.t, finals: s.finalsWithScore, scored: s.scored, allowed: s.allowed } : null,
      firstDate: s.firstDate, lastDate: s.lastDate,
    }));

  // Recent form: the last 5 finals with both scores, across seasons, newest first.
  const recentFinals = rows.filter((r) => r[TEAM_ROW.RESULT]).slice(0, 5);
  const recentForm = supportsResults && recentFinals.length
    ? { n: recentFinals.length, w: recentFinals.filter((r) => r[TEAM_ROW.RESULT] === "W").length, l: recentFinals.filter((r) => r[TEAM_ROW.RESULT] === "L").length, t: recentFinals.filter((r) => r[TEAM_ROW.RESULT] === "T").length, gameIds: recentFinals.map((r) => r[TEAM_ROW.GAME]) }
    : null;

  const withResult = rows.filter((r) => r[TEAM_ROW.RESULT]);
  const defaultSeason = seasons.find((s) => s.record)?.id ?? seasons[0]?.id ?? null;
  return {
    entityType: "team",
    id: team.id,
    sport: sportId,
    name: team.name,
    abbreviation: team.abbreviation ?? null,
    league: team.leagueId,
    supportsResults,
    seasons,
    // Default to the newest season that has a proven result, so an off-season page never opens on an empty table.
    defaultSeason: supportsResults ? defaultSeason : seasons[0]?.id ?? null,
    currentSeason: seasons[0]?.id ?? null,
    recentForm,
    resultsThrough: withResult.length ? withResult[0][TEAM_ROW.DATE] : null,
    games: rows,
  };
}
