/**
 * ACCEPTED-LEAGUE DERIVED MARKETS (Block A · Forecast Truth) — the settlement owner for the three numbers a league
 * forecast page prints beside its 1X2 and that nothing graded: OVER 2.5 goals, BOTH TEAMS TO SCORE and the LIKELIEST
 * SCORE (the page shows only the table's first score and its probability). Pure: no fs, no clock, no git.
 *
 * NOTHING IS RE-CHOSEN. The 1X2 owner (grade-league-forecasts.mjs → <league>/results/graded.json) already picked each
 * match's forecast of record — the last one published before kickoff — and recorded its `forecastAt`, its 1X2 and the
 * official 90-minute final. This owner re-opens THAT forecast from the dated archive (a same-day rewrite keeps matches
 * that have kicked off, so the revision stays there) and proves it is the same one: same event, same `forecastAt`,
 * and a 1X2 identical to the digit. A forecast that cannot be re-opened is UNRECOVERED — counted, never approximated
 * from another revision and never rebuilt from the final.
 *
 * The final score is the 1X2 owner's own (`final.home` / `final.away`): one result per match, never re-fetched here.
 */

export const LEAGUE_DERIVED_GRADING_VERSION = 1;

/** The /soccer/<league> page has printed Over 2.5, Both score and Likeliest score since it went public (c2bb480). */
export const LEAGUE_DERIVED_PUBLIC_SINCE = { "ligue-1": "2026-09-11T14:43:20Z" };

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const sameProbs = (a, b) => !!a && !!b && a.home === b.home && a.draw === b.draw && a.away === b.away;

/**
 * @param {object} graded   one match from <league>/results/graded.json
 * @param {Array<{ source: string, rows: object[] }>} archives  the dated forecast files, oldest first
 * @returns {{ row: object, source: string } | null}
 */
export function locateLeagueForecast(graded, archives) {
  for (const a of archives ?? []) {
    for (const r of a?.rows ?? []) {
      if (r?.eventId !== graded?.eventId) continue;
      if (r.forecastAt !== graded.forecastAt) continue;
      if (!sameProbs(r.probs, graded.probs)) continue;
      return { row: r, source: a.source };
    }
  }
  return null;
}

/** The three published numbers, exactly as the page reads them; null when any is missing or malformed. */
export function leagueDerivedForecast(row) {
  const top = Array.isArray(row?.topScorelines) ? row.topScorelines[0] : null;
  if (!isNum(row?.over25) || !isNum(row?.btts?.yes) || !top || !/^\d+-\d+$/.test(String(top.score)) || !isNum(top.p)) {
    return { reason: "DERIVED_FIELDS_ABSENT" };
  }
  return { forecast: { over25: row.over25, bttsYes: row.btts.yes, likeliestScore: { score: top.score, p: top.p } } };
}

/**
 * @param {object} graded   one match from graded.json (forecast of record + official final)
 * @param {{ row: object, source: string } | null} located   from locateLeagueForecast
 * @param {string} leagueKey  e.g. "ligue-1"
 * @returns {{ row } | { refused }}
 */
export function gradeLeagueDerived(graded, located, leagueKey) {
  const h = graded?.final?.home;
  const a = graded?.final?.away;
  if (!Number.isInteger(h) || !Number.isInteger(a)) return { refused: "NO_FINAL_SCORE" };
  if (!(Date.parse(graded.forecastAt ?? "") < Date.parse(graded.kickoffUtc ?? ""))) return { refused: "FORECAST_NOT_PRE_KICKOFF" };
  const since = LEAGUE_DERIVED_PUBLIC_SINCE[leagueKey];
  if (!since || Date.parse(graded.forecastAt) < Date.parse(since)) return { refused: "NOT_PUBLIC_AT_FORECAST_TIME" };
  if (!located) return { refused: "FORECAST_OF_RECORD_UNRECOVERED" };
  const d = leagueDerivedForecast(located.row);
  if (!d.forecast) return { refused: d.reason };
  const score = `${h}-${a}`;
  return {
    row: {
      schemaVersion: 1,
      gradingVersion: LEAGUE_DERIVED_GRADING_VERSION,
      league: leagueKey,
      eventId: graded.eventId,
      matchup: graded.matchup ?? null,
      homeClub: graded.homeClub ?? null,
      awayClub: graded.awayClub ?? null,
      kickoffUtc: graded.kickoffUtc,
      forecastAt: graded.forecastAt,
      modelId: typeof located.row.modelId === "string" ? located.row.modelId : null,
      recoveredFrom: located.source,
      forecast: d.forecast,
      final: { home: h, away: a, score },
      outcomes: { over25: h + a >= 3, btts: h > 0 && a > 0, likeliestScoreHit: d.forecast.likeliestScore.score === score },
    },
  };
}
