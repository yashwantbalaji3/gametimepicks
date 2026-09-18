/**
 * ASK LIVE TOOL — the present, read through the existing gateway and no other way.
 *
 * WHY ASK DOES NOT CALL A PROVIDER. `api/live.mjs` is "the only place a live provider is called", and
 * that sentence stops being true the moment a second caller reaches for ESPN or StatsAPI directly. So
 * this tool calls the GATEWAY — the same URL a reader's browser calls — and inherits everything the
 * gateway already owns: the `LIVE_PUBLIC_SPORTS` allowlist, the `LIVE_GATEWAY_ENABLED` kill switch,
 * the bounded upstream read, the memo, and the CDN cache that keeps one upstream refresh serving every
 * concurrent reader.
 *
 * The consequence that matters most: NFL live state stays refused. Not because this file checks for
 * NFL, but because the gateway's `publicSports()` defaults to `["mlb"]` and answers UNSUPPORTED_SPORT
 * for anything else, before a socket is opened. Ask cannot widen that from here — enabling NFL live is
 * a change to the gateway's own allowlist, which is a founder gate.
 */
import { ASK_ERROR, ASK_STATUS } from "../contract.mjs";

/**
 * @param {{sport: string}} args
 * @param {{ liveFetch?: (sport: string) => Promise<any> }} ctx  injected so the suite drives fixtures
 */
export async function getLiveSlate(args, ctx) {
  const sport = String(args.sport).toLowerCase();

  if (typeof ctx.liveFetch !== "function") {
    return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE, detail: "the live gateway is not reachable from here" };
  }

  let payload;
  try {
    payload = await ctx.liveFetch(sport);
  } catch {
    return { status: ASK_STATUS.ERROR, error: ASK_ERROR.ASSET_UNAVAILABLE, sport: args.sport };
  }

  /*
   * THE GATEWAY'S REFUSAL IS THE ANSWER. It returns a typed unavailable envelope rather than an error
   * status, and every reason is passed through unchanged — UNSUPPORTED_SPORT, FEATURE_DISABLED,
   * PROVIDER_ERROR and PROVIDER_MALFORMED mean different things and a reader deserves the real one.
   */
  if (!payload || payload.unavailable) {
    const reason = String(payload?.reason ?? "PROVIDER_ERROR");
    return {
      status: ASK_STATUS.UNSUPPORTED,
      error: reason === "UNSUPPORTED_SPORT" ? ASK_ERROR.UNSUPPORTED_SPORT : ASK_ERROR.ASSET_UNAVAILABLE,
      sport: args.sport,
      reason,
      /*
       * What a reader can have INSTEAD. An unsupported live sport still has a scheduled matchup, a
       * recorded history and — where one is published — a pregame forecast. The refusal ends with a
       * route rather than an apology (§27).
       */
      alternatives: [
        { id: "matchup", what: "scheduled matchup context", tool: "getMatchupContext" },
        { id: "research", what: "recorded game history", tool: "runGameFinder" },
        { id: "forecast", what: "published pregame forecast", tool: "getPublishedForecasts" },
      ],
      links: [{ id: "live", label: "See which sports GameTime tracks live", href: "/live/" }],
    };
  }

  const events = (payload.events ?? []).map((e) => ({
    eventId: e.eventId,
    startTime: e.startTime ?? null,
    /*
     * STATE AND SCORE TRAVEL TOGETHER, AND A PRE-GAME CARRIES NO SCORE. The provider zeroes scores at
     * "Pre-Game" roughly an hour before first pitch, so a PRE event reporting 0–0 would read as a
     * scoreless game in progress. The gateway's adapter already strips it; this repeats the rule so a
     * future adapter change cannot leak a zero through as a score.
     */
    state: e.state,
    stateDetail: e.stateDetail ?? null,
    away: e.away?.abbreviation ?? e.away?.name ?? null,
    home: e.home?.abbreviation ?? e.home?.name ?? null,
    awayScore: e.state === "PRE" ? null : e.away?.score ?? null,
    homeScore: e.state === "PRE" ? null : e.home?.score ?? null,
    period: e.period ?? null,
  }));

  const live = events.filter((e) => e.state === "LIVE" || e.state === "IN");
  return {
    status: ASK_STATUS.OK,
    sport: args.sport,
    /* The instant the payload describes — repeated verbatim so the writer can say "as of", and must. */
    fetchedAt: payload.fetchedAt ?? null,
    total: events.length,
    liveCount: live.length,
    events: events.slice(0, 20),
    /*
     * A PROVIDER FINAL IS NOT A SETTLED RESULT. Settlement grades forecasts against the official box
     * score and can land hours later, so a FINAL event here says nothing about whether GameTime has
     * graded it. The distinction is carried as data so the writer states it rather than blurring it.
     */
    settlementNote: "a final score here is the provider's; GameTime grading can land later",
    links: [{ id: "live", label: "Open GameTime Live", href: "/live/" }],
  };
}

/**
 * The production live transport: the deployment's own `/api/live/` gateway.
 *
 * Bounded and abortable like every other read. It deliberately does NOT retry: a retry loop across many
 * readers is the request storm the gateway's own comment forbids, and its stale-while-revalidate cache
 * already covers a single slow response.
 */
export function originLiveFetch(origin, { timeoutMs = 8000 } = {}) {
  return async (sport) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${origin}/api/live/?sport=${encodeURIComponent(sport)}`, {
        signal: controller.signal,
        headers: { accept: "application/json" },
        redirect: "error",
      });
      if (!res.ok) return { unavailable: true, reason: "PROVIDER_ERROR" };
      const text = await res.text();
      if (text.length > 3_000_000) return { unavailable: true, reason: "PROVIDER_MALFORMED" };
      return JSON.parse(text);
    } catch {
      return { unavailable: true, reason: "PROVIDER_ERROR" };
    } finally {
      clearTimeout(timer);
    }
  };
}
