/**
 * EPL results capture — the pure parts of scripts/epl/capture-epl-results.mjs (v1.7 F2 repair, G2).
 *
 * WHY MONTHS. From 2026-09-16 ESPN's public scoreboard rejected the date-RANGE query form the capture
 * had always used (`dates=YYYYMMDD-YYYYMMDD` → HTTP 400 "Failed to get events endpoint.") while the
 * single-day (`dates=YYYYMMDD`) and month (`dates=YYYYMM`) forms kept returning 200. The capture
 * treated that as SOURCE_STALE and exited 0, so seven nightly epl-settle runs were green while the
 * results artifact froze at 2026-09-15T01:10:22Z and ~23 P304 forecasts of record went ungraded.
 *
 * One request per month from the season start reproduces the season-to-date window the range
 * expressed, in a form the provider honours, at ten requests for a whole season.
 *
 * No fs, no network, no clock — the script supplies them.
 */

import { monthsCovering } from "../sports/espn-scoreboard-window.mjs";

/** Exit code for a provider failure: nothing written, last-known-good stands; the workflow tells it from a crash (1) and a quiet day (0). */
export const EXIT_SOURCE_STALE = 4;

/**
 * The `dates=YYYYMM` keys the season-to-date window spans, oldest first, year roll included.
 * One owner for the month plan: `sports/espn-scoreboard-window.mjs` (the NFL and NBA captures hit the
 * same 2026-09-20 range-form death and share it). This keeps the EPL signature — an invalid or
 * inverted window answers `[]` here, and the caller refuses on an empty plan.
 */
export function scoreboardMonths(seasonStartIso, nowIso) {
  const start = Date.parse(`${seasonStartIso}T00:00:00Z`);
  const end = Date.parse(nowIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  return monthsCovering(new Date(start).toISOString(), new Date(end).toISOString());
}

/** Season start ≤ event date < the end of NOW's UTC day — exactly the window the old range request expressed. */
export function inCaptureWindow(eventDateIso, seasonStartIso, nowIso) {
  const t = Date.parse(eventDateIso ?? "");
  if (!Number.isFinite(t)) return false;
  const dayEnd = Date.parse(`${String(nowIso).slice(0, 10)}T00:00:00Z`) + 86_400_000;
  return t >= Date.parse(`${seasonStartIso}T00:00:00Z`) && t < dayEnd;
}
