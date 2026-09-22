/**
 * ESPN public scoreboard — window → request plan.
 *
 * WHY THIS EXISTS. Both schedule captures (NFL, NBA) asked the scoreboard for a date RANGE
 * (`?dates=YYYYMMDD-YYYYMMDD`). From 2026-09-20 the endpoint answers every range request with
 * `400 {"code":400,"message":"Failed to get events endpoint."}` while the single-day form
 * (`?dates=YYYYMMDD`) and the month form (`?dates=YYYYMM`) still answer 200 (reproduced 2026-09-22
 * against football/nfl and basketball/nba). sport-schedules.yml refused "NFL schedule" and
 * "NBA schedule" on every run from 2026-09-20 (runs 35513825563, 35621730109, 35737261812).
 *
 * The plan below asks for every MONTH the window touches (1–4 requests for a 9–70-day window) and
 * the caller keeps only events whose date falls inside [d0, d1]. The window semantics the captures
 * promise — explicit, never "the whole season" — are unchanged; only the transport changed.
 * Pure: no I/O, so the plan and the filter are unit-tested.
 */

const pad = (n) => String(n).padStart(2, "0");

/** `YYYYMM` for every calendar month between d0 and d1 inclusive (UTC), in order. */
export function monthsCovering(d0, d1) {
  const a = new Date(d0), b = new Date(d1);
  if (!Number.isFinite(a.getTime()) || !Number.isFinite(b.getTime())) throw new Error("monthsCovering: invalid date");
  if (b < a) throw new Error("monthsCovering: window end precedes start");
  const out = [];
  let y = a.getUTCFullYear(), m = a.getUTCMonth();
  const yEnd = b.getUTCFullYear(), mEnd = b.getUTCMonth();
  while (y < yEnd || (y === yEnd && m <= mEnd)) {
    out.push(`${y}${pad(m + 1)}`);
    m += 1; if (m === 12) { m = 0; y += 1; }
  }
  return out;
}

/** The scoreboard URLs to fetch for `sportPath` (e.g. "football/nfl") over [d0, d1]. */
export function scoreboardMonthUrls(sportPath, d0, d1) {
  return monthsCovering(d0, d1).map(
    (ym) => `https://site.api.espn.com/apis/site/v2/sports/${sportPath}/scoreboard?dates=${ym}&limit=1000`,
  );
}

/** True when an event's ISO date lies inside the window [d0, d1] (inclusive, UTC instants). */
export function inWindow(dateIso, d0, d1) {
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return false;
  return t >= new Date(d0).getTime() && t <= new Date(d1).getTime();
}

/**
 * Merge the events of several month responses: keep one row per provider event id (first wins),
 * keep only events inside the window. Order is preserved from the responses.
 */
export function mergeWindowEvents(responses, d0, d1) {
  const seen = new Set();
  const out = [];
  for (const data of responses) {
    for (const e of data?.events ?? []) {
      const id = e?.id == null ? null : String(e.id);
      if (!id || seen.has(id)) continue;
      if (!inWindow(e.date, d0, d1)) continue;
      seen.add(id);
      out.push(e);
    }
  }
  return out;
}
