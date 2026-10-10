/**
 * LIVE SLATE SCOPE — which provider rows belong to TODAY's hub, and what the hub may say about them.
 *
 * Pure: no React, no fetch, no clock of its own. The hook and the gateway pass `nowMs` in, so every
 * rule below is unit-testable on a pinned instant.
 *
 * THE DEFECT THIS EXISTS FOR (LV-1..3, independent audit 2026-10-07). The MLB hub asked StatsAPI for
 * its schedule with NO date. StatsAPI's own notion of "today" can still be yesterday's slate after
 * midnight ET, so the hub received a slate of finals, read "every game is terminal", stopped polling
 * for good, and kept rendering "Live feed updated 2 sec ago" from a clock that had stopped ticking.
 * Three separate rules close it:
 *
 *   1. the request always names today's ET date            -> etDateAt()
 *   2. only rows for games on today's roster count          -> scopeSlate()
 *   3. the poll stops only when TODAY's roster is all final -> nextSlatePollMs()
 *
 * and the hub states what it actually knows, never "updated recently" off a stale instant
 *                                                           -> slateFeedStatus()
 */
import { isInPlay } from "./contract.mjs";
import { HIDDEN_TAB_MIN_INTERVAL_MS, TTL_SECONDS } from "./freshness.mjs";
import { slateStillMoving } from "./lifecycle.mjs";

/**
 * The America/New_York calendar date of an instant — the only date shape MLB is asked for.
 * en-CA renders ISO-shaped YYYY-MM-DD, so no manual part assembly can transpose month and day.
 */
export function etDateAt(nowMs) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(nowMs));
}

/**
 * What one slate poll should ask for (guards 3, 6, 7).
 *
 * - With a roster, the request names THE ROSTER's own ET date. Before the first rebuild after
 *   midnight ET a page legitimately carries the previous day's roster; asking today's feed against
 *   those cards would join nothing and could paint them wrongly, so the join keeps the roster's date
 *   and the hub labels it (`rosterIsToday: false`). A today roster therefore always asks for today.
 * - An empty roster asks for nothing: an off day spends no request at all.
 * - Without a roster, MLB asks for its active slate date (`activeDate`, see below; first poll:
 *   `initialUnrosteredDate`); NFL sends no date (ESPN's current week), unchanged.
 */
/**
 * @param {{ sport: string, roster: { rosterIds: string[], rosterDate: string } | null, nowMs: number, activeDate?: string | null }} input
 */
export function slateRequestPlan({ sport, roster, nowMs, activeDate = null }) {
  const today = etDateAt(nowMs);
  if (roster) {
    const rosterIsToday = roster.rosterDate === today;
    if (roster.rosterIds.length === 0) return { fetch: false, date: roster.rosterDate, rosterIsToday };
    /* UFC, like MLB, names its card's date (the gateway pins an undated UFC request to today too). */
    return { fetch: true, date: sport === "mlb" || sport === "ufc" ? roster.rosterDate : undefined, rosterIsToday };
  }
  return { fetch: true, date: sport === "mlb" ? activeDate ?? initialUnrosteredDate(nowMs) : undefined, rosterIsToday: null };
}

/**
 * LATE GAMES ACROSS MIDNIGHT ET (Yash, 2026-10-07 14:48Z).
 *
 * A game that began on the previous ET date and is still in play after midnight belongs to THAT
 * date's slate. Callers without a build-time roster (My GameTime, Ask) therefore follow the slate,
 * not the wall clock: they keep asking for the prior date while any of its games is in play, and
 * move to today only once that slate is done. Callers with a roster already follow the roster's
 * own date (`slateRequestPlan`), which stays the prior day until the next build.
 *
 * The prior day is only probed in the first hours after midnight: no MLB game runs later, and it
 * keeps the daytime cost at one request.
 */
export const PRIOR_DAY_WINDOW_HOURS = 6;

/** The ET calendar day before `etDate` (YYYY-MM-DD). Noon UTC keeps the arithmetic DST-proof. */
export function priorEtDate(etDate) {
  const d = new Date(`${etDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** The hour (0–23) in America/New_York. */
export function etHourAt(nowMs) {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(nowMs));
  return Number(h);
}

/** The first date a roster-less MLB reader asks for: the prior day in the early hours, else today. */
export function initialUnrosteredDate(nowMs) {
  const today = etDateAt(nowMs);
  return etHourAt(nowMs) < PRIOR_DAY_WINDOW_HOURS ? priorEtDate(today) : today;
}

/**
 * After an ACCEPTED body for `activeDate`: which date to ask next.
 *
 * Today's slate is kept. A prior-day slate is kept while any of its games is in play (a game that
 * legitimately began yesterday); once none is, the reader moves to today. Only a body whose date
 * matched the request may be passed here — a wrong-date body never decides a transition.
 */
export function nextUnrosteredDate({ activeDate, today, states }) {
  if (activeDate >= today) return activeDate;
  return (states ?? []).some(isInPlay) ? activeDate : today;
}

/**
 * Does this response describe the date we asked for? (guard 2)
 *
 * The gateway echoes the date it asked the provider for. A body for another date, or one with no
 * date at all (an older cached response), is not evidence about the requested slate: it must not
 * replace the slate, advance freshness or stop the poll. A request with no date (NFL) accepts any.
 */
export function acceptSlateBody(body, requestedDate) {
  if (!requestedDate) return true;
  return typeof body?.date === "string" && body.date === requestedDate;
}

/**
 * Join a provider slate to the roster.
 *
 * `rosterIds` null means "no roster to join" (a caller that wants the whole dated slate). Otherwise
 * a row whose eventId is not on the roster is dropped: it may be a real game, but it is not one the
 * hub shows, so it must neither set the poll's pace nor count toward freshness.
 *
 * @param {Array<Record<string, any>>} events
 * @param {string[] | null} rosterIds
 */
export function scopeSlate(events, rosterIds) {
  const allow = rosterIds ? new Set(rosterIds.map(String)) : null;
  /** @type {Record<string, any>} */
  const byGamePk = {};
  let outside = 0;
  for (const e of Array.isArray(events) ? events : []) {
    if (!e?.eventId) continue;
    const id = String(e.eventId);
    if (allow && !allow.has(id)) {
      outside++;
      continue;
    }
    byGamePk[id] = e;
  }
  const states = Object.values(byGamePk).map((e) => e.state);
  return { byGamePk, states, matched: states.length, outside };
}

/** While any of today's games is live or upcoming, match the live cadence. */
export const MOVING_INTERVAL_MS = TTL_SECONDS.LIVE * 1000 + 5_000;
/** Today's games are not in the feed yet: keep asking, slowly. Never a stop. */
export const WAITING_INTERVAL_MS = 60_000;

/**
 * Milliseconds until the next slate poll, or null to stop.
 *
 * The ONLY stop is "every game on today's roster is in the feed and terminal". An empty match is
 * not a finished slate — it is a feed that has not caught up to today yet, so the loop keeps going.
 */
export function nextSlatePollMs({ states, rosterSize, hidden }) {
  if (rosterSize === 0) return null; // nothing on today's roster to track
  let ms;
  // With no roster (NFL, My GameTime) an empty answer keeps the pre-existing live cadence.
  if (!states || states.length === 0) ms = rosterSize === null ? MOVING_INTERVAL_MS : WAITING_INTERVAL_MS;
  else if (slateStillMoving(states)) ms = MOVING_INTERVAL_MS;
  else if (rosterSize === null || states.length >= rosterSize) return null;
  else ms = WAITING_INTERVAL_MS; // some of today's games are final, the rest have not appeared yet
  return hidden ? Math.max(ms, HIDDEN_TAB_MIN_INTERVAL_MS) : ms;
}

/**
 * What the hub's one feed line may claim. The hub maps each value to its copy.
 *
 * OFF · NO_GAMES · PRIOR_DAY_DONE · UNAVAILABLE · CHECKING · NO_TODAY_DATA · ALL_FINAL · AGE_UNKNOWN ·
 * STALE · FRESH
 */
/**
 * @param {{ enabled: boolean, rosterIsToday?: boolean | null, rosterSize: number | null, unavailable: any, loading: boolean, matched: number, settled: boolean, freshnessLevel: string, ageSecs: number | null | undefined }} input
 */
export function slateFeedStatus({ enabled, rosterIsToday = null, rosterSize, unavailable, loading, matched, settled, freshnessLevel, ageSecs }) {
  if (!enabled) return "OFF";
  if (rosterSize === 0) return "NO_GAMES";
  /*
   * PRIOR_DAY_DONE (Yash, 2026-10-07 15:01Z): the page's roster is a previous ET day's AND every one
   * of its games is in the feed and terminal (`settled` is only ever set on full roster coverage, so
   * a partial response cannot reach here). That slate is retired at once: the hub stops showing it
   * and says today's games appear once today's list is published, instead of waiting for the next
   * build. While any of its games is still in play, `settled` is false and the late game stays.
   */
  if (rosterIsToday === false && settled) return "PRIOR_DAY_DONE";
  if (unavailable) return "UNAVAILABLE";
  if (loading) return "CHECKING";
  if (!matched) return "NO_TODAY_DATA";
  if (settled) return "ALL_FINAL";
  if (ageSecs === null || ageSecs === undefined) return "AGE_UNKNOWN";
  if (freshnessLevel === "STALE") return "STALE";
  return "FRESH";
}

/**
 * Gateway cache cap for an MLB request about today or later.
 *
 * A terminal slate is cached for TTL_SECONDS.TERMINAL (one hour) — right for a past date, wrong for
 * today, where a status correction or a late game must not be hidden behind an hour-old answer.
 */
export const TODAY_MAX_TTL_SECONDS = TTL_SECONDS.PRE_DISTANT;

export function capTtlForDate(ttlSeconds, requestDate, nowMs) {
  if (!requestDate || requestDate >= etDateAt(nowMs)) return Math.min(ttlSeconds, TODAY_MAX_TTL_SECONDS);
  return ttlSeconds;
}
