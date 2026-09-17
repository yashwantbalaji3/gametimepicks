/**
 * HEAD-TO-HEAD READ MODEL (v1.4 · §23 §60–§63 · C1404) — recorded meetings between two teams.
 *
 * A meeting is a canonical game that BOTH teams' factual rows carry, keyed by exact canonical game id:
 *   - intersection of the two teams' rows on gameId (symmetric by construction; a doubleheader is two game ids,
 *     so same-day games stay distinct; a game id can never be counted twice because rows are keyed by it)
 *   - counted in the record only when both rows are provider-final WITH both scores (the v1.3 `teamGameResult`
 *     rule) and the two rows agree (A's own = B's opp and vice versa). Pending, postponed and unrecorded games
 *     are never a win, loss or tie and are listed separately as not final.
 *   - never a model settlement: nothing here reads a grade.
 *
 * Depth is stated, never "all-time": `recordedFrom`/`recordedTo` are the seasons in which BOTH teams have recorded
 * finals in GameTime data, so a meeting before that span cannot be missing silently.
 *
 * Pure: no filesystem, no clock.
 */
import { BLOCKER, TEAM_COMPARE_SPORTS, pairKey } from "./contract.mjs";
import { TEAM, newestFirst, teamSeasonsWithResults } from "./entities.mjs";

/**
 * @param {{ a: any, b: any, seasonId?: string|null, before?: { date: string, gameId: string }|null, limit?: number|null }} input
 *   a, b      team compare entities (display order)
 *   seasonId  optional season filter
 *   before    only meetings strictly before this game (a matchup page reads "entering this game")
 *   limit     cap on listed meetings (the record always counts every meeting that passes the filters)
 */
export function getHeadToHead({ a, b, seasonId = null, before = null, limit = null }) {
  if (!a || !b) return unsupported(BLOCKER.ENTITY_NOT_PUBLISHED);
  if (a.sport !== b.sport) return unsupported(BLOCKER.DIFFERENT_SPORT);
  if (!TEAM_COMPARE_SPORTS.includes(a.sport) || !a.supportsResults || !b.supportsResults) return unsupported(BLOCKER.TEAM_RESULTS_UNSUPPORTED);
  if (a.id === b.id) return unsupported(BLOCKER.SAME_ENTITY);

  const bRows = new Map();
  for (const r of b.rows) if (r[TEAM.OPP] === a.id) bRows.set(r[TEAM.GAME], r);
  const seen = new Set();
  const finals = [];
  const notFinal = [];
  let inconsistent = 0;
  for (const ra of a.rows) {
    if (ra[TEAM.OPP] !== b.id) continue;
    const id = ra[TEAM.GAME];
    const rb = bRows.get(id);
    if (!rb || seen.has(id)) continue;
    seen.add(id);
    if (seasonId && ra[TEAM.SEASON] !== seasonId) continue;
    if (before && !isBefore(ra, before)) continue;
    const provenA = ra[TEAM.RESULT] && Number.isInteger(ra[TEAM.OWN]) && Number.isInteger(ra[TEAM.OPP_SCORE]);
    const provenB = rb[TEAM.RESULT] && Number.isInteger(rb[TEAM.OWN]) && Number.isInteger(rb[TEAM.OPP_SCORE]);
    if (provenA && provenB) {
      if (ra[TEAM.OWN] !== rb[TEAM.OPP_SCORE] || ra[TEAM.OPP_SCORE] !== rb[TEAM.OWN]) { inconsistent += 1; continue; }
      finals.push(ra);
    } else if (!provenA && !provenB) {
      notFinal.push(ra);
    } else {
      inconsistent += 1;
    }
  }
  finals.sort(newestFirst);
  notFinal.sort(newestFirst);

  const record = { meetings: finals.length, aWins: 0, bWins: 0, ties: 0 };
  for (const r of finals) {
    if (r[TEAM.RESULT] === "W") record.aWins += 1;
    else if (r[TEAM.RESULT] === "L") record.bWins += 1;
    else record.ties += 1;
  }

  const shared = teamSeasonsWithResults(a).filter((s) => teamSeasonsWithResults(b).includes(s));
  const meetingRow = (r) => ({
    gameId: r[TEAM.GAME],
    date: r[TEAM.DATE],
    seasonId: r[TEAM.SEASON],
    // Location from A's row: H → A hosted, A → B hosted, N → neutral site.
    site: r[TEAM.HA] === "H" ? "A_HOME" : r[TEAM.HA] === "A" ? "B_HOME" : "NEUTRAL",
    aScore: r[TEAM.OWN],
    bScore: r[TEAM.OPP_SCORE],
    result: r[TEAM.RESULT] === "W" ? "A" : r[TEAM.RESULT] === "L" ? "B" : "TIE",
  });

  return {
    supported: true,
    blockers: [],
    pair: pairKey(a.sport, a.id, b.id),
    aId: a.id,
    bId: b.id,
    seasonId,
    record,
    meetings: (limit == null ? finals : finals.slice(0, limit)).map(meetingRow),
    notFinal: notFinal.map((r) => ({ gameId: r[TEAM.GAME], date: r[TEAM.DATE], seasonId: r[TEAM.SEASON], site: r[TEAM.HA] === "H" ? "A_HOME" : r[TEAM.HA] === "A" ? "B_HOME" : "NEUTRAL" })),
    inconsistent,
    seasons: [...new Set(finals.map((r) => r[TEAM.SEASON]))].sort().reverse(),
    recordedFrom: shared.length ? shared[shared.length - 1] : null,
    recordedTo: shared.length ? shared[0] : null,
  };
}

function isBefore(row, before) {
  const d = row[TEAM.DATE] ?? "";
  if (row[TEAM.GAME] === before.gameId) return false;
  return d < before.date;
}

function unsupported(code) {
  return { supported: false, blockers: [code], pair: null, aId: null, bId: null, seasonId: null, record: null, meetings: [], notFinal: [], inconsistent: 0, seasons: [], recordedFrom: null, recordedTo: null };
}
