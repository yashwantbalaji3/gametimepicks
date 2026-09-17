/**
 * MATCHUP EXPLORER (v1.4 · §12 §39 §50 §87 · C1407 C1409) — factual context for ONE canonical game.
 *
 * Identity is the exact canonical game id (MLB gamePk, NFL ESPN event id), never away+home+date. A game enters the
 * registry only when BOTH teams' factual rows carry it and agree on the sides. Everything a page shows about the
 * two teams is "entering this game" (strictly before its scheduled instant), so the page means the same thing
 * before, during and after the game; once a factual final is recorded it is shown in its own Result section.
 *
 * FACTUAL HISTORY  ≠  CURRENT SCHEDULE  ≠  CURRENT FORECAST. This module owns the first two; the forecast is joined
 * at the page by exact game id from its own owner and never enters a registry record.
 *
 * Scope is deliberately bounded (no page per historical game): a per-sport season + start instant window, fixed in
 * code, so the registry only grows as the committed schedule grows — and the builder refuses to DROP a game that an
 * earlier build published (a Matchup URL must not 404 after game day).
 *
 * Pure: no filesystem, no clock. "Upcoming" is never decided here — the page decides on the reader's clock.
 */
import { MATCHUP_SPORTS } from "./contract.mjs";
import { TEAM, teamSeasonsWithResults } from "./entities.mjs";
import { getHeadToHead } from "./head-to-head.mjs";
import { teamRecentFinals, teamSeasonSummary } from "./team-compare.mjs";

/** Fixed windows. Moving a start LATER would drop published pages — the builder refuses that. */
export const MATCHUP_WINDOWS = Object.freeze({
  MLB: Object.freeze({ seasonId: "MLB-2026", fromUtc: "2026-09-17T00:00:00Z" }),
  NFL: Object.freeze({ seasonId: "NFL-2026", fromUtc: "2026-09-09T00:00:00Z" }),
});

/** Refuse to emit more pages than this (route and CI budget). Re-plan before MLB 2027 Opening Day. */
export const MATCHUP_PAGE_BUDGET = 600;

/** Indexing policy: NFL weekly matchups with recorded meetings; MLB daily games stay noindex (sitemap churn, runs-only). */
export const MATCHUP_INDEXABLE_SPORTS = Object.freeze(["NFL"]);

export const MATCHUP_EXCLUSION = Object.freeze({
  OUTSIDE_WINDOW: "OUTSIDE_WINDOW",
  NO_START_INSTANT: "NO_START_INSTANT",
  ONE_SIDE_ONLY: "ONE_SIDE_ONLY",
  SIDES_DISAGREE: "SIDES_DISAGREE",
  TEAM_NOT_PUBLISHED: "TEAM_NOT_PUBLISHED",
});

/**
 * Candidate registry entries for a sport from its team compare entities.
 * @param {string} sport
 * @param {any[]} teams team compare entities of that sport
 * @returns {{ entries: any[], excluded: Record<string, number> }}
 */
export function matchupRegistry(sport, teams) {
  if (!MATCHUP_SPORTS.includes(sport)) return { entries: [], excluded: {} };
  const w = MATCHUP_WINDOWS[sport];
  const byId = new Map(teams.map((t) => [t.id, t]));
  const rowsByGame = new Map();
  for (const t of teams) for (const r of t.rows) {
    if (r[TEAM.SEASON] !== w.seasonId) continue;
    const list = rowsByGame.get(r[TEAM.GAME]) ?? [];
    list.push({ team: t, row: r });
    rowsByGame.set(r[TEAM.GAME], list);
  }
  const excluded = {};
  const bump = (k) => { excluded[k] = (excluded[k] ?? 0) + 1; };
  const entries = [];
  for (const [gameId, sides] of [...rowsByGame].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    const date = sides[0].row[TEAM.DATE];
    if (typeof date !== "string" || !/T\d{2}:\d{2}/.test(date)) { bump(MATCHUP_EXCLUSION.NO_START_INSTANT); continue; }
    if (date < w.fromUtc) { bump(MATCHUP_EXCLUSION.OUTSIDE_WINDOW); continue; }
    if (sides.length !== 2) {
      const opp = sides[0].row[TEAM.OPP];
      bump(opp && !byId.has(opp) ? MATCHUP_EXCLUSION.TEAM_NOT_PUBLISHED : MATCHUP_EXCLUSION.ONE_SIDE_ONLY);
      continue;
    }
    const [x, y] = sides;
    const agree = x.row[TEAM.OPP] === y.team.id && y.row[TEAM.OPP] === x.team.id && x.row[TEAM.DATE] === y.row[TEAM.DATE] && x.row[TEAM.STATUS] === y.row[TEAM.STATUS]
      && ((x.row[TEAM.HA] === "H" && y.row[TEAM.HA] === "A") || (x.row[TEAM.HA] === "A" && y.row[TEAM.HA] === "H") || (x.row[TEAM.HA] === "N" && y.row[TEAM.HA] === "N"));
    if (!agree) { bump(MATCHUP_EXCLUSION.SIDES_DISAGREE); continue; }
    const neutral = x.row[TEAM.HA] === "N";
    // Neutral site: the committed rows carry no host, so the pair is shown in canonical id order and says "neutral site".
    const [home, away] = neutral ? [x, y].sort((p, q) => (p.team.id < q.team.id ? 1 : -1)) : x.row[TEAM.HA] === "H" ? [x, y] : [y, x];
    const final = home.row[TEAM.RESULT] && away.row[TEAM.RESULT] && home.row[TEAM.OWN] === away.row[TEAM.OPP_SCORE] && home.row[TEAM.OPP_SCORE] === away.row[TEAM.OWN]
      ? { home: home.row[TEAM.OWN], away: away.row[TEAM.OWN] } : null;
    const h2h = getHeadToHead({ a: away.team, b: home.team, before: { date, gameId } });
    entries.push({
      gameId, sport, seasonId: w.seasonId, startUtc: date, homeTeamId: home.team.id, awayTeamId: away.team.id, neutralSite: neutral,
      final, priorMeetings: h2h.record?.meetings ?? 0,
      indexable: MATCHUP_INDEXABLE_SPORTS.includes(sport) && (h2h.record?.meetings ?? 0) > 0,
    });
  }
  entries.sort((p, q) => (p.startUtc < q.startUtc ? -1 : p.startUtc > q.startUtc ? 1 : p.gameId < q.gameId ? -1 : 1));
  return { entries, excluded };
}

/** Newest season before `seasonId` in which a team has proven finals (explicitly labelled on the page). */
function priorSeasonWithResults(team, seasonId) {
  return teamSeasonsWithResults(team).find((s) => s < seasonId) ?? null;
}

/**
 * Compose one matchup from its registry entry and the two team compare entities.
 * @param {{ entry: any, home: any, away: any }} input
 */
export function buildMatchup({ entry, home, away }) {
  if (!entry || !home || !away || home.id !== entry.homeTeamId || away.id !== entry.awayTeamId) throw new Error(`matchup ${entry?.gameId}: teams do not match the registry entry`);
  const before = { date: entry.startUtc, gameId: entry.gameId };
  const sideOf = (t) => {
    const prior = priorSeasonWithResults(t, entry.seasonId);
    return {
      id: t.id, slug: t.slug, name: t.name, abbreviation: t.abbreviation, path: t.path, coverage: t.coverage,
      seasonToDate: teamSeasonSummary(t, entry.seasonId, before),
      priorSeason: prior ? teamSeasonSummary(t, prior) : null,
      recent: teamRecentFinals(t, 5, before),
    };
  };
  return {
    gameId: entry.gameId,
    sport: entry.sport,
    seasonId: entry.seasonId,
    startUtc: entry.startUtc,
    neutralSite: entry.neutralSite,
    final: entry.final,
    away: sideOf(away),
    home: sideOf(home),
    headToHead: getHeadToHead({ a: away, b: home, before, limit: 10 }),
    forecastRef: { sport: entry.sport, gameId: entry.gameId },
  };
}
