"use client";
/**
 * useLiveSlate — ONE poll for the whole hub.
 *
 * The cost rule §10 makes concrete: the hub asks the gateway's BATCH scoreboard mode once per
 * cadence and every card reads from that one answer. A per-card hook would produce N requests with
 * N distinct URLs, which would also defeat the CDN (it caches by request url) and the gateway's
 * upstream memo. So there is deliberately no per-card fetch anywhere in the hub.
 *
 * Cadence is a property of the SLATE: while any game is live or upcoming the hub refreshes; once
 * every game is terminal it stops entirely, so an evening of finished baseball costs nothing.
 * Hidden tabs back off. Freshness is recomputed on the reader's clock, never frozen into a payload.
 *
 * ⚠ ONE DATED SLATE (LV-1..3). MLB always names its date in the URL: the roster's own ET date when
 * the caller passes a roster (today's, once the day's build is out), otherwise today's. Only roster
 * games count, a body for another date is ignored, and an empty roster asks for nothing: a slate of
 * another day's finals can neither stop the poll nor make the hub claim a fresh feed. The rules live
 * in `slate-scope.mjs` so they are tested without a DOM.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { type LiveSport, liveReadyFor, liveUrl } from "@/lib/live/client";
import { isUnavailable } from "@/lib/live/contract.mjs";
import { freshnessOf } from "@/lib/live/freshness.mjs";
import { acceptSlateBody, etDateAt, nextSlatePollMs, nextUnrosteredDate, scopeSlate, slateRequestPlan } from "@/lib/live/slate-scope.mjs";

type Envelope = Record<string, any>;

export interface LiveSlateResult {
  /** eventId → envelope. Empty until the first successful response. */
  byGamePk: Record<string, Envelope>;
  unavailable: { reason: string } | null;
  loading: boolean;
  /** Age of the whole slate response, recomputed on the reader's clock. */
  freshness: { level: string; ageMs: number | null };
  /** How many requests this hook has issued — surfaced so a test can prove "one, not N". */
  requestCount: number;
  /**
   * The instant of the last SUCCESSFUL slate response, kept across a refusal.
   *
   * This is what §9's "Last observed" states. It is the payload's own instant, not the moment the
   * refusal arrived — a failed poll must not advance the reader's sense of how fresh the data is.
   */
  lastObservedAt: string | null;
  /** Re-poll now. Used by the outage notice's Retry, which must not reload the page. */
  retry: () => void;
  /** Roster games the feed has answered for. 0 means no live data for today's games yet. */
  matched: number;
  /** Every roster game is in the feed and terminal, so polling has stopped. */
  settled: boolean;
  /** False when the caller's roster is not for today's ET date (null until the reader's clock is known, or with no roster). */
  rosterIsToday: boolean | null;
}

/** The roster a hub shows: only these games count toward pace and freshness. */
export interface LiveSlateScope {
  rosterIds: string[];
  rosterDate: string;
}

export function useLiveSlate(sport: LiveSport = "mlb", scope?: LiveSlateScope): LiveSlateResult {
  const [byGamePk, setByGamePk] = useState<Record<string, Envelope>>({});
  const [unavailable, setUnavailable] = useState<{ reason: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [matched, setMatched] = useState(0);
  const [settled, setSettled] = useState(false);
  const [rosterIsToday, setRosterIsToday] = useState<boolean | null>(null);

  // Read through a ref so a new array identity on each render does not restart the loop.
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const scopeKey = scope ? `${scope.rosterDate}|${scope.rosterIds.join(",")}` : "";

  /* Without a roster (My GameTime): the slate date being followed. Held on the prior ET day while one
     of its games is still in play after midnight, then moved to today (`nextUnrosteredDate`). */
  const activeDate = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const stopped = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const poll = useCallback(async () => {
    if (stopped.current) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let states: string[] = [];
    let accepted = false;
    const roster = scopeRef.current ?? null;
    // MLB always names a date in the URL itself (the CDN keys on it): the roster's own ET date, or
    // the followed slate's date without a roster. NFL keeps ESPN's current week, which its roster is built on.
    const plan = slateRequestPlan({ sport, roster, nowMs: Date.now(), activeDate: activeDate.current });
    const date = plan.date;
    setRosterIsToday(plan.rosterIsToday);
    if (!plan.fetch) {
      // An off day: nothing on the roster to track, so no request is spent.
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(liveUrl({ sport, date }), { signal: controller.signal, headers: { accept: "application/json" } });
      const body = await res.json();
      if (isUnavailable(body)) {
        // Keep the last good slate and let it age; a refusal never blanks the hub.
        setUnavailable({ reason: body.reason });
      } else if (!acceptSlateBody(body, date)) {
        // A body for another date (or an undated one) is not evidence about this slate: it neither
        // replaces the slate nor advances freshness, and the poll keeps waiting for the right one.
      } else if (Array.isArray(body?.events)) {
        const scoped = scopeSlate(body.events, roster ? roster.rosterIds : null);
        setByGamePk(scoped.byGamePk);
        setMatched(scoped.matched);
        setFetchedAt(body.fetchedAt ?? null);
        setUnavailable(null);
        states = scoped.states;
        accepted = true;
      }
    } catch {
      if (controller.signal.aborted) return;
      setUnavailable({ reason: "PROVIDER_ERROR" });
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRequestCount((n) => n + 1);
        setNowMs(Date.now());
      }
    }

    if (stopped.current) return;
    if (sport === "mlb" && !roster && accepted && date) {
      // A prior-day slate with no game in play hands over to today at once — never a stop.
      const nextDate = nextUnrosteredDate({ activeDate: date, today: etDateAt(Date.now()), states });
      activeDate.current = nextDate;
      if (nextDate !== date) {
        timer.current = setTimeout(poll, 0);
        return;
      }
    }
    const hidden = typeof document !== "undefined" && document.hidden;
    const next = nextSlatePollMs({ states, rosterSize: roster ? roster.rosterIds.length : null, hidden });
    // Every one of TODAY's roster games is terminal: the loop ends. Not a longer interval — a stop.
    if (next === null) {
      setSettled(states.length > 0);
      return;
    }
    setSettled(false);
    timer.current = setTimeout(poll, next);
  }, [sport]);

  useEffect(() => {
    if (!liveReadyFor(sport)) {
      setLoading(false);
      return;
    }
    stopped.current = false;
    void poll();
    return () => {
      stopped.current = true;
      clearTimer();
      abort.current?.abort();
    };
  }, [sport, poll, clearTimer, scopeKey]);

  /* A stopped hub must still notice midnight ET: a roster that was today's at its last poll becomes the
     prior day's, so the hub can retire it rather than keep calling yesterday's finals "today's".
     Clock only — no request. */
  useEffect(() => {
    if (!scope) return;
    const id = setInterval(() => setRosterIsToday(slateRequestPlan({ sport, roster: scopeRef.current ?? null, nowMs: Date.now() }).rosterIsToday), 60_000);
    return () => clearInterval(id);
  }, [sport, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Age ticker — runs whenever an age is being shown, so "N sec ago" can never freeze while the page
  // stays open. A settled slate shows no age (the hub states the last-checked time instead), so it
  // is idle.
  useEffect(() => {
    if (!fetchedAt || settled) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fetchedAt, settled]);

  const freshness = fetchedAt && !settled
    ? freshnessOf({ state: "LIVE", fetchedAt }, nowMs)
    : { level: "NOT_APPLICABLE" as const, ageMs: null };

  /* Restarts a loop that an all-terminal slate (or an outage) had ended. */
  const retry = useCallback(() => {
    clearTimer();
    stopped.current = false;
    setLoading(true);
    void poll();
  }, [clearTimer, poll]);

  return { byGamePk, unavailable, loading, freshness, requestCount, lastObservedAt: fetchedAt, retry, matched, settled, rosterIsToday };
}
