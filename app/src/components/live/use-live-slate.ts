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
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { liveReadyFor, liveUrl } from "@/lib/live/client";
import { isUnavailable } from "@/lib/live/contract.mjs";
import { HIDDEN_TAB_MIN_INTERVAL_MS, TTL_SECONDS, freshnessOf } from "@/lib/live/freshness.mjs";
import { slateStillMoving } from "@/lib/live/lifecycle.mjs";

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
}

/** While anything is moving, match the live cadence; otherwise the loop ends. */
const MOVING_INTERVAL_MS = TTL_SECONDS.LIVE * 1000 + 5_000;

export function useLiveSlate(sport: "mlb" = "mlb"): LiveSlateResult {
  const [byGamePk, setByGamePk] = useState<Record<string, Envelope>>({});
  const [unavailable, setUnavailable] = useState<{ reason: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

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
    try {
      const res = await fetch(liveUrl({ sport }), { signal: controller.signal, headers: { accept: "application/json" } });
      const body = await res.json();
      if (isUnavailable(body)) {
        // Keep the last good slate and let it age; a refusal never blanks the hub.
        setUnavailable({ reason: body.reason });
      } else if (Array.isArray(body?.events)) {
        const map: Record<string, Envelope> = {};
        for (const e of body.events) if (e?.eventId) map[e.eventId] = e;
        setByGamePk(map);
        setFetchedAt(body.fetchedAt ?? null);
        setUnavailable(null);
        states = body.events.map((e: Envelope) => e.state);
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
    // An all-terminal slate ends the loop. Not a longer interval — a stop.
    if (states.length > 0 && !slateStillMoving(states)) return;
    const hidden = typeof document !== "undefined" && document.hidden;
    timer.current = setTimeout(poll, hidden ? HIDDEN_TAB_MIN_INTERVAL_MS : MOVING_INTERVAL_MS);
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
  }, [sport, poll, clearTimer]);

  // Age ticker — only while something is still moving, so a finished slate is idle.
  useEffect(() => {
    const states = Object.values(byGamePk).map((e) => e.state);
    if (states.length === 0 || !slateStillMoving(states)) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [byGamePk]);

  const freshness = fetchedAt
    ? freshnessOf({ state: "LIVE", fetchedAt }, nowMs)
    : { level: "NOT_APPLICABLE" as const, ageMs: null };

  return { byGamePk, unavailable, loading, freshness, requestCount };
}
