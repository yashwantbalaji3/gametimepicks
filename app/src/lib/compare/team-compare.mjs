/**
 * TEAM COMPARE READ MODEL (v1.4 · §19 §85 · C1405) — two teams, one shared season, facts only.
 *
 * Per side: the selected season's record over PROVEN finals, points/runs scored and allowed with the per-final mean
 * (n shown), and the latest recorded finals across seasons (independent last-N — the two lists are not the same
 * dates and never claim to be). Plus the recorded meetings between them. No winner row, no score, no grade: the
 * output has no field that ranks one side over the other.
 *
 * Pure: no filesystem, no clock.
 */
import { getTeamCompareEligibility } from "./eligibility.mjs";
import { getHeadToHead } from "./head-to-head.mjs";
import { TEAM, newestFirst, uniqueByGame } from "./entities.mjs";

export const TEAM_RECENT_SIZES = Object.freeze([5, 10]);
const round1 = (x) => Math.round(x * 10) / 10;

/** Season summary over proven finals. `before` restricts to finals strictly before a game (matchup pages). */
export function teamSeasonSummary(entity, seasonId, before = null) {
  const finals = uniqueByGame(entity.rows).filter((r) => r[TEAM.SEASON] === seasonId && r[TEAM.RESULT] && (!before || (r[TEAM.GAME] !== before.gameId && (r[TEAM.DATE] ?? "") < before.date)));
  if (!finals.length) return { seasonId, finals: 0, w: 0, l: 0, t: 0, scored: null, allowed: null, scoredPerFinal: null, allowedPerFinal: null };
  let w = 0, l = 0, t = 0, scored = 0, allowed = 0;
  for (const r of finals) {
    if (r[TEAM.RESULT] === "W") w += 1; else if (r[TEAM.RESULT] === "L") l += 1; else t += 1;
    scored += r[TEAM.OWN];
    allowed += r[TEAM.OPP_SCORE];
  }
  return { seasonId, finals: finals.length, w, l, t, scored, allowed, scoredPerFinal: round1(scored / finals.length), allowedPerFinal: round1(allowed / finals.length) };
}

/** Latest N proven finals across seasons, newest first. */
export function teamRecentFinals(entity, size, before = null) {
  const rows = uniqueByGame(entity.rows).filter((r) => r[TEAM.RESULT] && (!before || (r[TEAM.GAME] !== before.gameId && (r[TEAM.DATE] ?? "") < before.date))).sort(newestFirst).slice(0, size);
  return {
    size,
    n: rows.length,
    w: rows.filter((r) => r[TEAM.RESULT] === "W").length,
    l: rows.filter((r) => r[TEAM.RESULT] === "L").length,
    t: rows.filter((r) => r[TEAM.RESULT] === "T").length,
    games: rows.map((r) => ({ gameId: r[TEAM.GAME], date: r[TEAM.DATE], seasonId: r[TEAM.SEASON], ha: r[TEAM.HA], opponentId: r[TEAM.OPP], own: r[TEAM.OWN], opp: r[TEAM.OPP_SCORE], result: r[TEAM.RESULT] })),
  };
}

const side = (e) => ({ id: e.id, slug: e.slug, name: e.name, abbreviation: e.abbreviation, path: e.path, resultsThrough: e.resultsThrough, coverage: e.coverage });

/**
 * @param {{ a: any, b: any, season?: string|null }} input team compare entities in display order
 */
export function buildTeamComparison({ a, b, season = null }) {
  const eligibility = getTeamCompareEligibility(a, b, { season });
  if (!eligibility.eligible) return { eligibility, a: a ? side(a) : null, b: b ? side(b) : null, season: null, recent: null, headToHead: null };
  const s = eligibility.selectedSeason;
  return {
    eligibility,
    a: side(a),
    b: side(b),
    season: { id: s, a: teamSeasonSummary(a, s), b: teamSeasonSummary(b, s) },
    recent: Object.fromEntries(TEAM_RECENT_SIZES.map((n) => [n, { a: teamRecentFinals(a, n), b: teamRecentFinals(b, n) }])),
    headToHead: { all: getHeadToHead({ a, b, limit: 10 }), season: getHeadToHead({ a, b, seasonId: s }) },
  };
}
