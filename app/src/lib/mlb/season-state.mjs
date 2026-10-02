/**
 * SESSION 5 · FOUNDER DECISION D3 — IS MLB IN THE DAILY PRODUCT UNIVERSE TODAY?
 *
 *   REGULAR_SEASON  between StatsAPI's regularSeasonStartDate and regularSeasonEndDate
 *   POSTSEASON      after the regular season while a postseason game is still to be played — MLB stays ACTIVE:
 *                   a postseason day with games runs the products; an off day between rounds is NO_EVENTS
 *   OFF_SEASON      before the regular season starts, or after it when no game remains — the season is over
 *                   because the GAMES are over, not because a calendar date passed. MLB leaves the active daily
 *                   universe (no money products, no stale cards) until games return.
 *   UNKNOWN         the evidence is missing or unreadable — never treated as OFF_SEASON (fail closed: the
 *                   existing input gate decides, exactly as before D3)
 *
 * Inputs are StatsAPI's own documents, captured free and keyless by capture-mlb-season-state.mjs:
 *   seasons   GET /api/v1/seasons/<year>?sportId=1                 (the season calendar)
 *   schedule  GET /api/v1/schedule?sportId=1&startDate=<date>&endDate=<postSeasonEndDate + 14d>&gameType=R,F,D,L,W
 * Pure: documents, the date and the clock are arguments.
 */

export const MLB_SEASON = Object.freeze({
  REGULAR_SEASON: "REGULAR_SEASON",
  POSTSEASON: "POSTSEASON",
  OFF_SEASON: "OFF_SEASON",
  UNKNOWN: "UNKNOWN",
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s) => typeof s === "string" && DATE_RE.test(s);
const COMPETITIVE = new Set(["R", "F", "D", "L", "W"]); // regular season + the four postseason rounds

/** Games on or after `date` that are still to be played (not Final). A postponed game is re-listed on its new date. */
export function remainingGames(schedule, date) {
  const out = [];
  for (const d of Array.isArray(schedule?.dates) ? schedule.dates : []) {
    if (!isDate(d?.date) || d.date < date) continue;
    for (const g of Array.isArray(d.games) ? d.games : []) {
      if (!COMPETITIVE.has(g?.gameType)) continue;
      const abstract = g?.status?.abstractGameState;
      const detailed = String(g?.status?.detailedState ?? "");
      if (abstract === "Final" || /^(Cancelled|Postponed)/i.test(detailed)) continue;
      out.push({ date: d.date, gamePk: g?.gamePk ?? null, gameType: g.gameType });
    }
  }
  return out;
}

/**
 * @param {{ seasons: any, schedule: any, date: string }} input
 * @returns {{ state: string, reason: string, season: string|null, gamesToday: number|null, remaining: number|null, nextGameDate: string|null, calendar: object|null }}
 */
export function deriveMlbSeasonState({ seasons, schedule, date }) {
  if (!isDate(date)) throw new Error("deriveMlbSeasonState: date YYYY-MM-DD required");
  const s = (Array.isArray(seasons?.seasons) ? seasons.seasons : []).find((x) => isDate(x?.regularSeasonStartDate) && isDate(x?.regularSeasonEndDate));
  const unknown = (reason) => ({ state: MLB_SEASON.UNKNOWN, reason, season: s?.seasonId ?? null, gamesToday: null, remaining: null, nextGameDate: null, calendar: null });
  if (!s) return unknown("no StatsAPI season calendar with regular-season dates");
  const calendar = {
    regularSeasonStartDate: s.regularSeasonStartDate, regularSeasonEndDate: s.regularSeasonEndDate,
    postSeasonStartDate: isDate(s.postSeasonStartDate) ? s.postSeasonStartDate : null,
    postSeasonEndDate: isDate(s.postSeasonEndDate) ? s.postSeasonEndDate : null,
  };
  if (date < calendar.regularSeasonStartDate) {
    return { state: MLB_SEASON.OFF_SEASON, reason: `the ${s.seasonId} regular season starts ${calendar.regularSeasonStartDate}`, season: s.seasonId, gamesToday: 0, remaining: null, nextGameDate: calendar.regularSeasonStartDate, calendar };
  }
  if (date <= calendar.regularSeasonEndDate) {
    return { state: MLB_SEASON.REGULAR_SEASON, reason: `regular season (${calendar.regularSeasonStartDate} → ${calendar.regularSeasonEndDate})`, season: s.seasonId, gamesToday: null, remaining: null, nextGameDate: null, calendar };
  }
  if (!Array.isArray(schedule?.dates)) return unknown("no StatsAPI postseason schedule capture — cannot tell whether a game remains");
  const left = remainingGames(schedule, date);
  const today = left.filter((g) => g.date === date).length;
  if (left.length > 0) {
    return { state: MLB_SEASON.POSTSEASON, reason: `postseason — ${left.length} game(s) still to be played from ${date}${today ? `, ${today} today` : ", none today"}`, season: s.seasonId, gamesToday: today, remaining: left.length, nextGameDate: left[0].date, calendar };
  }
  return { state: MLB_SEASON.OFF_SEASON, reason: `the ${s.seasonId} season is over — StatsAPI lists no game left to play on or after ${date}`, season: s.seasonId, gamesToday: 0, remaining: 0, nextGameDate: null, calendar };
}

const etDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/**
 * The committed/captured season-state document is evidence for `date` only if it was derived FOR that date and
 * captured ON that ET day — the same rule the no-game verdict uses. Anything else is UNKNOWN.
 */
export function seasonStateFor(doc, date, nowIso) {
  const stamp = doc?.generatedAt ?? null;
  const at = Date.parse(stamp ?? "");
  const now = Date.parse(nowIso ?? "");
  if (!doc || doc.date !== date || !Number.isFinite(at) || !Number.isFinite(now) || at > now || etDay(stamp) !== date) {
    return { state: MLB_SEASON.UNKNOWN, reason: !doc ? "no season-state capture" : `the season-state capture is for ${doc.date ?? "?"} at ${stamp ?? "?"}, not from ${date} itself` };
  }
  return { state: Object.values(MLB_SEASON).includes(doc.state) ? doc.state : MLB_SEASON.UNKNOWN, reason: doc.reason ?? "" };
}
