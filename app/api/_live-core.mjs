/**
 * LIVE GATEWAY CORE (v1.1 · §8, §12, §14) — every decision the live endpoint makes, with no I/O.
 *
 * Transport lives in `live.mjs`; this module is pure so the rules below are unit-testable without a
 * network, which §20 requires ("do not make the unit suite depend on a currently live provider").
 *
 * WHAT THIS OWNS
 *   - the kill switch (default OFF — a feature nobody enabled cannot spend anything)
 *   - request validation: sport allowlist, event-id shape, mode
 *   - the upstream URL, built ONLY from validated pieces (§14: never proxy a user-supplied URL)
 *   - the cache header that makes one upstream refresh serve many readers
 */
import { TTL_SECONDS } from "../src/lib/live/freshness.mjs";

/** Sports the gateway will call upstream for. Anything else is refused before a socket is opened. */
export const SUPPORTED_SPORTS = Object.freeze(["nfl", "mlb"]);

/** Hard caps. A bounded read can neither hang a function nor be used to pull an arbitrary payload. */
export const UPSTREAM_TIMEOUT_MS = 6_000;
export const MAX_UPSTREAM_BYTES = 3_000_000;

/**
 * OFF unless explicitly enabled.
 *
 * Reversal is one environment variable with no rebuild of any model artifact (§21.10): unset
 * LIVE_GATEWAY_ENABLED and every request answers FEATURE_DISABLED on the next invocation.
 */
export function gatewayDisabled(env = process.env) {
  const v = env.LIVE_GATEWAY_ENABLED;
  return v === undefined || v === "" || v === "0" || v === "false";
}

/**
 * Provider event ids are digits only — verified for both providers (MLB gamePk, ESPN event id).
 *
 * This is the §14 sanitization boundary: the id is interpolated into an upstream URL, so anything
 * that is not a short run of digits never reaches one.
 */
const EVENT_ID = /^[0-9]{1,12}$/;

/** An ET calendar date, the only date shape MLB's schedule endpoint is asked for. */
const ET_DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * Validate a request into a plan, or refuse it.
 *
 * Modes: `scoreboard` (one batch call covering a whole slate — the cheap default) and `event` (one
 * event, plus the heavy NFL summary only when player stats are asked for).
 */
export function planRequest(query) {
  const sport = String(query?.sport ?? "").toLowerCase();
  if (!SUPPORTED_SPORTS.includes(sport)) return { ok: false, reason: "UNSUPPORTED_SPORT" };

  const eventRaw = query?.event === undefined || query?.event === null ? "" : String(query.event);
  const date = query?.date === undefined || query?.date === null ? "" : String(query.date);
  if (date && !ET_DATE.test(date)) return { ok: false, reason: "PROVIDER_MALFORMED" };

  if (eventRaw) {
    if (!EVENT_ID.test(eventRaw)) return { ok: false, reason: "EVENT_NOT_FOUND" };
    return {
      ok: true,
      sport,
      mode: "event",
      eventId: eventRaw,
      date: date || null,
      // Player stats cost a 567 KB upstream read, so they are opt-in per request and NFL-only.
      withPlayers: sport === "nfl" && String(query?.players ?? "") === "1",
    };
  }
  return { ok: true, sport, mode: "scoreboard", eventId: null, date: date || null, withPlayers: false };
}

/**
 * The upstream URLs for a plan. Built here so no other module can spell a provider host.
 *
 * MLB uses ONE schedule call for the whole slate in both modes — a single event is selected from the
 * batch rather than fetched separately, so an MLB detail view costs the same upstream call as the
 * hub and two readers on different games share one response.
 */
export function upstreamUrls(plan) {
  if (plan.sport === "mlb") {
    const date = plan.date ? `&date=${plan.date}` : "";
    return {
      scoreboard: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=linescore,team${date}`,
      summary: null,
    };
  }
  /*
   * ⚠ ESPN's scoreboard defaults to the CURRENT week. Asking it for a future or past event without a
   * date returns a slate that does not contain the event, and the gateway would answer a truthful
   * but useless EVENT_NOT_FOUND — observed 2026-09-15, when three Week 3 games read as "no live data
   * source covers this game" while their data was one parameter away.
   *
   * ⚠ AND THE DATE IS THE EVENT'S ET DATE, NOT ITS UTC DATE. Verified: DET @ BUF kicks off
   * 2026-09-18T00:15Z and is returned by `dates=20260917` (its ET date) while `dates=20260918`
   * returns zero events. That is the same `eventEtDate` rule the rest of this repository already
   * enforces — the caller passes an ET date and nothing here re-derives one from a UTC instant.
   */
  const dates = plan.date ? `?dates=${plan.date.replace(/-/g, "")}` : "";
  return {
    scoreboard: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard${dates}`,
    summary:
      plan.mode === "event" && plan.withPlayers
        ? `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${plan.eventId}`
        : null,
  };
}

/**
 * The Cache-Control header that IS the cost control.
 *
 * `s-maxage` lets the Vercel CDN answer every reader from one stored response, so upstream volume
 * scales with ACTIVE EVENTS × TIME and not with concurrent readers — §12.1's requirement, met by the
 * edge we already pay for rather than by a new service. `stale-while-revalidate` means a slow
 * upstream shows the last good state instead of an error, and the envelope's own age still tells the
 * reader how old it is. `private`-free and cookie-free: nothing here is per-user.
 */
export function cacheHeaderFor(ttlSeconds) {
  const swr = Math.max(30, Math.floor(ttlSeconds * 2));
  /*
   * ⚠ `max-age=0` is load-bearing, not boilerplate. Without it a browser applies its own heuristic
   * freshness and can keep serving a response from its PRIVATE cache — observed 2026-09-15, when a
   * reader held a stale "live data unavailable" refusal for a game whose feed had already recovered,
   * while a cache-bypassing fetch of the identical URL returned the event. A stale refusal looks
   * exactly like a real one, so the reader had no way to tell.
   *
   * `s-maxage` still lets the SHARED edge cache answer every reader from one upstream refresh, which
   * is the whole cost model. The browser revalidates and gets that shared copy — cheap, and never a
   * private copy of a moment that has passed.
   */
  return `public, max-age=0, s-maxage=${ttlSeconds}, stale-while-revalidate=${swr}`;
}

/** The TTL for a whole scoreboard: the shortest any of its events wants. */
export function scoreboardTtl(envelopes) {
  if (!envelopes.length) return TTL_SECONDS.UNKNOWN;
  let ttl = TTL_SECONDS.TERMINAL;
  for (const e of envelopes) {
    const t =
      e.state === "LIVE" || e.state === "DELAYED"
        ? TTL_SECONDS.LIVE
        : e.state === "PRE"
          ? TTL_SECONDS.PRE_IMMINENT
          : e.state === "UNKNOWN"
            ? TTL_SECONDS.UNKNOWN
            : TTL_SECONDS.TERMINAL;
    if (t < ttl) ttl = t;
  }
  return ttl;
}
