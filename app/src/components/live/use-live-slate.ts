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
 * ⚠ TODAY ONLY (LV-1..3). MLB is always asked for today's ET date, and when the caller passes its
 * roster only those games count: a slate of yesterday's finals can neither stop the poll nor make
 * the hub claim a fresh feed. The rules live in `slate-scope.mjs` so they are tested without a DOM.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { liveReadyFor, liveUrl } from "@/lib/live/client";
import { isUnavailable } from "@/lib/live/contract.mjs";
import { freshnessOf } from "@/lib/live/freshness.mjs";
import { etDateAt, nextSlatePollMs, scopeSlate } from "@/lib/live/slate-scope.mjs";

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
  /** False when the caller's roster is not for today's ET date (null until the reader's clock is known). */
  rosterIsToday: boolean | null;
}

/** The roster a hub shows: only these games count toward pace and freshness. */
export interface LiveSlateScope {
  rosterIds: string[];
  rosterDate: string;
}

export function useLiveSlate(sport: "nfl" | "mlb" = "mlb", scope?: LiveSlateScope): LiveSlateResult {
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
    const roster = scopeRef.current ?? null;
    // MLB always names today's ET date; NFL keeps ESPN's current week, which its roster is built on.
    const date = sport === "mlb" ? etDateAt(Date.now()) : undefined;
    if (roster && date && roster.rosterDate !== date) {
      // The roster on this page is not today's. Nothing here can be joined to today's feed, so no
      // request is spent and the hub says so rather than painting another day's games as today's.
      setRosterIsToday(false);
      setLoading(false);
      return;
    }
    if (roster) setRosterIsToday(true);
    try {
      const res = await fetch(liveUrl({ sport, date }), { signal: controller.signal, headers: { accept: "application/json" } });
      const body = await res.json();
      if (isUnavailable(body)) {
        // Keep the last good slate and let it age; a refusal never blanks the hub.
        setUnavailable({ reason: body.reason });
      } else if (Array.isArray(body?.events)) {
        const scoped = scopeSlate(body.events, roster ? roster.rosterIds : null);
        setByGamePk(scoped.byGamePk);
        setMatched(scoped.matched);
        setFetchedAt(body.fetchedAt ?? null);
        setUnavailable(null);
        states = scoped.states;
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
