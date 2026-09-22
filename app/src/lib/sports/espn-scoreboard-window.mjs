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

/* ───────────────────────── the one I/O owner (v1.8 B4) ─────────────────────────
 * Ten scripts each carried their own `fetch(scoreboard?dates=A-B)`; the range form died for
 * basketball/nba, football/nfl and every soccer league on 2026-09-20 (mma/ufc still answered),
 * and the three RESULTS captures — which swallow every fetch error as SOURCE_STALE and exit 0 —
 * went green while writing nothing for a week (NFL results froze at 2026-09-15). One fetcher,
 * one error type, so a caller can tell a provider REFUSAL (4xx: the request form is wrong and
 * will stay wrong) from an OUTAGE (network / 5xx / malformed: last-known-good stands).
 */

export class ScoreboardFetchError extends Error {
  constructor(message, { status = null, url = null, malformed = false } = {}) {
    super(message);
    this.name = "ScoreboardFetchError";
    this.status = status;
    this.url = url;
    this.malformed = malformed;
  }
}

/** A 4xx from the provider: the request itself is rejected — a contract change, never an outage. */
export function isProviderRefusal(err) {
  return Number.isInteger(err?.status) && err.status >= 400 && err.status < 500;
}

/** Start of the UTC calendar day containing `d` (the old `dates=YYYYMMDD` form was day-granular). */
export function utcDayStart(d) {
  const t = new Date(d);
  if (!Number.isFinite(t.getTime())) throw new Error("utcDayStart: invalid date");
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 0, 0, 0, 0));
}

/** End of the UTC calendar day containing `d`, inclusive to the millisecond. */
export function utcDayEnd(d) {
  const t = new Date(d);
  if (!Number.isFinite(t.getTime())) throw new Error("utcDayEnd: invalid date");
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 23, 59, 59, 999));
}

/**
 * Fetch every month the window touches and merge to exactly [d0, d1]. Throws ScoreboardFetchError
 * on a non-2xx status (with `.status`) or a payload without an `events` array (`.malformed`).
 * `fetch` is injectable so the call path is unit-tested without the network.
 */
export async function fetchScoreboardWindowEvents(sportPath, d0, d1, { fetch: fetchImpl = globalThis.fetch, headers = {} } = {}) {
  if (typeof sportPath !== "string" || !/^[a-z-]+\/[a-z0-9.-]+$/.test(sportPath)) throw new Error(`fetchScoreboardWindowEvents: sportPath must look like "football/nfl", got ${JSON.stringify(sportPath)}`);
  const urls = scoreboardMonthUrls(sportPath, d0, d1);
  const responses = [];
  for (const url of urls) {
    const res = await fetchImpl(url, { headers: { accept: "application/json", ...headers } });
    if (!res.ok) throw new ScoreboardFetchError(`scoreboard fetch ${res.status} (${url})`, { status: res.status, url });
    let body;
    try { body = await res.json(); } catch { throw new ScoreboardFetchError(`scoreboard payload is not JSON (${url})`, { status: res.status, url, malformed: true }); }
    if (!Array.isArray(body?.events)) throw new ScoreboardFetchError(`scoreboard payload has no events array (${url})`, { status: res.status, url, malformed: true });
    responses.push(body);
  }
  return { events: mergeWindowEvents(responses, d0, d1), urls, requests: urls.length };
}
