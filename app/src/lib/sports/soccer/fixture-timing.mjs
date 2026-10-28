/**
 * WHEN A LEAGUE PAGE'S FIXTURE IS STILL UPCOMING, AND WHEN ITS DATA IS STALE (P0 10-28 · U7). Pure; client-safe.
 *
 * WHY. /soccer/ligue-1 is a static export whose fixture list is read from the league's latest.json. When the daily
 * soccer-leagues run failed (10-26), that file stopped moving and the page kept listing already-played matches as
 * upcoming for two days, with no warning. A static page can also simply be viewed long after it was built — other data
 * commits rebuild it many times a day, but nothing guarantees one ran after the last kickoff. And the builder itself
 * keeps a same-day match that has already kicked off in latest.json (league-forecasts.test: "a same-day rewrite keeps
 * matches that have already kicked off"), so even a fresh file holds started matches.
 *
 * So the page never decides "upcoming" from the file's presence: a fixture is UPCOMING only while its own kickoff is in
 * the future at the clock it is evaluated against — the build clock for the static HTML, then the viewer's clock in the
 * browser (components/soccer/league-fixture-board.tsx). A started fixture with a recorded final is FINAL; one without
 * is KICKED_OFF ("Kicked off — result pending"). And when the league data's own generatedAt is more than
 * STALE_AFTER_HOURS old at that clock, the page says so, with the last update time.
 */

/** The daily run lands each morning; 30 h allows a late run without hiding a missed one (founder P0 10-28). */
export const STALE_AFTER_HOURS = 30;
export const KICKED_OFF_PENDING = "Kicked off — result pending";

const HOUR_MS = 3_600_000;

/**
 * The clock a page evaluates at in the browser: the viewer's, but never earlier than the build's — a viewer whose
 * clock lags must not see a match the build already knew had kicked off come back as upcoming.
 * @param {number} serverNowMs @param {number} viewerNowMs @returns {number}
 */
export function viewClock(serverNowMs, viewerNowMs) {
  return Number.isFinite(viewerNowMs) ? Math.max(serverNowMs, viewerNowMs) : serverNowMs;
}

/**
 * @param {string} kickoffUtc
 * @param {number} nowMs
 * @param {{ home: number, away: number } | null | undefined} [final]
 * @returns {"UPCOMING" | "KICKED_OFF" | "FINAL"}
 */
export function fixtureState(kickoffUtc, nowMs, final) {
  const k = Date.parse(String(kickoffUtc ?? ""));
  /* A row whose kickoff cannot be read is never presented as upcoming: the claim "still to play" needs a time. */
  if (Number.isFinite(k) && Number.isFinite(nowMs) && nowMs < k) return "UPCOMING";
  return final && Number.isFinite(final.home) && Number.isFinite(final.away) ? "FINAL" : "KICKED_OFF";
}

/**
 * Split a league's fixture rows at `nowMs`. Order is kept (callers pass kickoff order).
 * @template {{ eventId: string, kickoffUtc: string }} R
 * @param {R[]} rows
 * @param {number} nowMs
 * @param {Record<string, { home: number, away: number }>} [finalsById]
 * @returns {{ upcoming: R[], started: Array<{ row: R, state: "KICKED_OFF" | "FINAL", final: { home: number, away: number } | null }> }}
 */
export function partitionFixtures(rows, nowMs, finalsById = {}) {
  const upcoming = [];
  const started = [];
  for (const row of rows ?? []) {
    const final = finalsById[String(row.eventId)] ?? null;
    const state = fixtureState(row.kickoffUtc, nowMs, final);
    if (state === "UPCOMING") upcoming.push(row);
    else started.push({ row, state, final: state === "FINAL" ? final : null });
  }
  return { upcoming, started };
}

/**
 * Is the league data older than the threshold at `nowMs`? An unreadable timestamp is stale: an unknown age is never
 * presented as fresh.
 * @param {string | null | undefined} generatedAt
 * @param {number} nowMs
 * @param {number} [thresholdHours]
 * @returns {{ stale: boolean, ageHours: number | null }}
 */
export function dataStaleness(generatedAt, nowMs, thresholdHours = STALE_AFTER_HOURS) {
  const g = Date.parse(String(generatedAt ?? ""));
  if (!Number.isFinite(g) || !Number.isFinite(nowMs)) return { stale: true, ageHours: null };
  const ageHours = (nowMs - g) / HOUR_MS;
  return { stale: ageHours > thresholdHours, ageHours };
}
