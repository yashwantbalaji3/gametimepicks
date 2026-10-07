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
 * OFF · NOT_TODAY · NO_GAMES · UNAVAILABLE · CHECKING · NO_TODAY_DATA · ALL_FINAL · AGE_UNKNOWN ·
 * STALE · FRESH
 */
export function slateFeedStatus({ enabled, rosterIsToday, rosterSize, unavailable, loading, matched, settled, freshnessLevel, ageSecs }) {
  if (!enabled) return "OFF";
  if (rosterIsToday === false) return "NOT_TODAY";
  if (rosterSize === 0) return "NO_GAMES";
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
