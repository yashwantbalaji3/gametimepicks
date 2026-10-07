/**
 * TODAY'S GAMES — one cross-sport list of the reader's ET day (Stage 9 · Today command center).
 *
 * WHY THIS EXISTS. /today's slate table is framed on MLB's presented slate, so on 2026-10-05 it listed
 * two MLB games while Monday Night Football was played, and the day claim ("N events today") is a
 * count with no rows behind it. `product-day.ts` already counts each sport's day from its schedule
 * owner; this module turns the same inputs into ROWS, so the list and the count cannot disagree.
 *
 * ⚠ THIS MODULE NEVER SAYS "LIVE". It sees schedule captures and a clock, nothing else. The only owner
 * allowed to say a game is in play is the live gateway's envelope (`lib/live/lifecycle.mjs`), read on
 * the reader's clock. So a started game here is STARTED ("Started 7:05 PM ET"), and a page may upgrade
 * it to Live only where the sport has a gateway (`liveFeed: true`) and the envelope says so. A static
 * page that asserts "live" is the Phase 6 defect.
 *
 * ⚠ TERMINAL FACTS COME ONLY FROM THE PROVIDER CAPTURE. A capture's FINAL / POSTPONED / CANCELLED is
 * a fact about the past and cannot go stale in the harmful direction. A capture's SCHEDULED can (it
 * may be a day old), so it is never read as "not started": the clock decides that, through the
 * registered clock-only vocabulary (`sports/event-lifecycle.mjs`). A started game with no final in
 * the capture is "result not in yet", never "Final".
 *
 * FOUNDER T1 (2026-10-07): NBA and Ligue 1 games and finals are listed as facts even with no forecast;
 * "game exists" stays separate from "GTP forecast available" (`forecast` / `forecastText`), and a
 * missing prediction never produces "schedule still loading" (only an unreadable schedule can).
 *
 * Day basis: the ET calendar day of the event's own start instant, the site's anchor. MNF at 00:15Z
 * Tuesday is Monday. Postponed and cancelled games do not count toward "events today" (the same rule
 * as `sportTodayFrom`) but are listed, so a reader is told rather than left to wonder.
 *
 * NO NODE IMPORTS: a client island re-derives phases on the reader's clock with this same function.
 */
import { EVENT_STATE, eventState } from "../sports/event-lifecycle.mjs";

export const TODAYS_GAMES_SCHEMA_VERSION = 1;

/** Display order of sports in the list and the filter chips. */
export const TODAY_SPORTS = Object.freeze(["nfl", "mlb", "nba", "epl", "ligue-1", "ufc"]);

export const TODAY_SPORT_LABEL = Object.freeze({
  nfl: "NFL", mlb: "MLB", nba: "NBA", epl: "Premier League", "ligue-1": "Ligue 1", ufc: "UFC",
});

/** A row's phase. Clock-and-capture only: none of these is a claim that play is happening now. */
export const ROW_PHASE = Object.freeze({
  UPCOMING: "UPCOMING",
  STARTED: "STARTED",               // the clock is past the start; no final in the capture
  RESULT_NOT_IN: "RESULT_NOT_IN",   // long past the start, and the capture still has no final
  FINAL: "FINAL",                   // the provider capture says final
  POSTPONED: "POSTPONED",
  CANCELLED: "CANCELLED",
  UNKNOWN: "UNKNOWN",               // no readable start time
});

/** Groups, in page order. Started first: it is what a reader opening Today most wants. */
export const TODAY_GROUPS = Object.freeze(["STARTED", "UPCOMING", "FINISHED", "NOT_PLAYED"]);

export const TODAY_GROUP_LABEL = Object.freeze({
  STARTED: "Started",
  UPCOMING: "Upcoming",
  FINISHED: "Finished",
  NOT_PLAYED: "Postponed or cancelled",
});

const GROUP_OF = Object.freeze({
  STARTED: "STARTED",
  UPCOMING: "UPCOMING",
  UNKNOWN: "UPCOMING",
  RESULT_NOT_IN: "FINISHED",
  FINAL: "FINISHED",
  POSTPONED: "NOT_PLAYED",
  CANCELLED: "NOT_PLAYED",
});

const NOT_PLAYED = /POSTPONED|CANCEL/i;
const FINAL = /FINAL|^FT$|PLAYED|COMPLETED/i;

/** ET calendar day of an instant (YYYY-MM-DD), or null. */
export function etDayOf(isoOrMs) {
  const t = typeof isoOrMs === "number" ? isoOrMs : Date.parse(String(isoOrMs ?? ""));
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
}

/** "7:05 PM ET". */
export function etClock(iso) {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return null;
  return `${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(new Date(t))} ET`;
}

/** Provider status text → a terminal fact, or null when the capture states nothing terminal. */
export function terminalFact(providerStatus) {
  const s = String(providerStatus ?? "");
  if (!s) return null;
  if (/CANCEL/i.test(s)) return ROW_PHASE.CANCELLED;
  if (/POSTPON/i.test(s)) return ROW_PHASE.POSTPONED;
  if (FINAL.test(s)) return ROW_PHASE.FINAL;
  return null;
}

/**
 * Phase of one row on a given clock.
 * @param {{ startUtc: string|null, providerStatus?: string|null }} row
 * @param {number} nowMs
 */
export function rowPhase(row, nowMs) {
  const fact = terminalFact(row.providerStatus);
  if (fact) return fact;
  const st = eventState({ startUtc: row.startUtc, nowIso: new Date(nowMs).toISOString() });
  if (st === EVENT_STATE.UPCOMING) return ROW_PHASE.UPCOMING;
  if (st === EVENT_STATE.IN_PROGRESS) return ROW_PHASE.STARTED;
  if (st === EVENT_STATE.COMPLETE) return ROW_PHASE.RESULT_NOT_IN;
  return ROW_PHASE.UNKNOWN;
}

/**
 * The words beside a row. `settled` and `hasForecast` only change the FINAL wording: a game we made
 * no forecast for has nothing to grade, so it is plain "Final".
 */
export function rowStatusText(row, phase) {
  const at = etClock(row.startUtc);
  switch (phase) {
    case ROW_PHASE.UPCOMING: return at ?? "Time to be confirmed";
    case ROW_PHASE.STARTED: return row.liveFeed ? `Started ${at}` : `Started ${at} · no live scores here`;
    case ROW_PHASE.RESULT_NOT_IN: return `Started ${at} · result not in yet`;
    case ROW_PHASE.FINAL: return !row.hasForecast ? "Final" : row.settled ? "Final · graded" : "Final · grading pending";
    case ROW_PHASE.POSTPONED: return "Postponed";
    case ROW_PHASE.CANCELLED: return "Cancelled";
    default: return "Time to be confirmed";
  }
}

/**
 * @typedef {object} TodayRowInput
 * @property {string} eventId
 * @property {string|null} startUtc
 * @property {string|null} [providerStatus]
 * @property {string} href
 * @property {boolean} hasForecast
 * @property {boolean} [settled]
 * @property {boolean} [liveFeed]
 * @property {string|null} [away]
 * @property {string|null} [home]
 * @property {string|null} [title]
 * @property {number|null} [boutCount]
 */

/**
 * Build the day.
 *
 * @param {object} o
 * @param {string} o.today ET day, YYYY-MM-DD
 * @param {number} o.nowMs the clock phases are judged on (build clock on the server; the reader's in the island)
 * @param {Array<{ sport: string, known: boolean, required?: boolean, rows: Array<TodayRowInput> }>} o.sports
 *   one entry per sport. `required: false` marks a sport whose only source is forecasts (it cannot
 *   prove a quiet day), so it never blocks a NO_EVENTS claim and is disclosed instead.
 */
export function buildTodaysGames({ today, nowMs, sports }) {
  const rows = [];
  const bySport = [];
  for (const s of sports) {
    const seen = new Set();
    const mine = [];
    for (const r of s.rows ?? []) {
      if (!r || !r.eventId || seen.has(r.eventId)) continue;
      if (etDayOf(r.startUtc) !== today) continue; // undated rows never land on a day
      seen.add(r.eventId);
      const phase = rowPhase(r, nowMs);
      mine.push({
        ...r,
        sport: s.sport,
        sportLabel: TODAY_SPORT_LABEL[s.sport] ?? s.sport.toUpperCase(),
        phase,
        group: GROUP_OF[phase],
        statusText: rowStatusText(r, phase),
        /* T1 (Yash 2026-10-07): "game exists" and "GTP forecast available" are separate facts, shown
           separately. A game is listed and counted whether or not we forecast it. */
        forecast: r.hasForecast ? "AVAILABLE" : "NONE",
        forecastText: r.hasForecast ? "GameTimePicks forecast" : "No GameTimePicks forecast",
      });
    }
    const played = mine.filter((r) => r.group !== "NOT_PLAYED");
    bySport.push({
      sport: s.sport,
      known: Boolean(s.known) || played.length > 0,
      required: s.required !== false,
      eventsToday: played.length,
      forecastsToday: played.filter((r) => r.hasForecast).length,
      notPlayed: mine.length - played.length,
    });
    rows.push(...mine);
  }

  const order = (sport) => { const i = TODAY_SPORTS.indexOf(sport); return i === -1 ? TODAY_SPORTS.length : i; };
  rows.sort((a, b) =>
    TODAY_GROUPS.indexOf(a.group) - TODAY_GROUPS.indexOf(b.group)
    || String(a.startUtc ?? "9999").localeCompare(String(b.startUtc ?? "9999"))
    || order(a.sport) - order(b.sport)
    || String(a.eventId).localeCompare(String(b.eventId)));

  const eventsToday = bySport.reduce((n, s) => n + s.eventsToday, 0);
  const allRequiredKnown = bySport.filter((s) => s.required).every((s) => s.known);
  const state = eventsToday > 0 ? "EVENTS" : allRequiredKnown && bySport.some((s) => s.required) ? "NO_EVENTS" : "UNKNOWN";
  const unproven = bySport.filter((s) => !s.required && s.eventsToday === 0).map((s) => s.sport);

  return {
    schemaVersion: TODAYS_GAMES_SCHEMA_VERSION,
    today,
    state,
    eventsToday,
    forecastsToday: bySport.reduce((n, s) => n + s.forecastsToday, 0),
    headline: state === "EVENTS" ? `${eventsToday} game${eventsToday === 1 ? "" : "s"} today`
      : state === "NO_EVENTS" ? "No games today on the schedules we track"
        : "Today's schedule is still loading",
    /** Sports that could not prove a quiet day (forecast-only sources). Disclosed, never hidden. */
    unproven,
    bySport,
    groups: TODAY_GROUPS
      .map((g) => ({ key: g, label: TODAY_GROUP_LABEL[g], rows: rows.filter((r) => r.group === g) }))
      .filter((g) => g.rows.length > 0),
    rows,
  };
}

/**
 * Which rows a reader-side live island may upgrade from STARTED to a gateway state. Only sports with a
 * gateway, only games the clock says have started, and never a terminal capture fact.
 */
export function liveCandidates(day) {
  return day.rows.filter((r) => r.liveFeed && (r.phase === ROW_PHASE.STARTED || r.phase === ROW_PHASE.UPCOMING));
}

/**
 * The words a STATIC (build-time) page may print beside a row. A built page is read hours later, so it
 * states only what stays true: the start time, or a terminal fact from the capture. It never prints a
 * clock-derived "Started" or "result not in yet", which a later reader could find wrong.
 */
export function staticStatusText(row) {
  const fact = terminalFact(row.providerStatus);
  if (fact === ROW_PHASE.FINAL) return rowStatusText(row, fact);
  if (fact === ROW_PHASE.POSTPONED) return "Postponed";
  if (fact === ROW_PHASE.CANCELLED) return "Cancelled";
  return etClock(row.startUtc) ?? "Time to be confirmed";
}
