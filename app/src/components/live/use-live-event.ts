"use client";
/**
 * useLiveEvent — the ONLY polling loop in GameTime Live.
 *
 * Every cost rule in §12 is enforced here rather than at each call site, because a second poller
 * written by a future page is exactly how "one upstream refresh serves many users" quietly becomes
 * one per component:
 *
 *   - the cadence comes from the SERVER's policy for the event's actual state, not from a constant
 *   - a terminal event stops the loop dead (clearTimeout, no rescheduling) — a finished game is free
 *   - a hidden tab backs off to >= 2 minutes and re-checks immediately on becoming visible again
 *   - a failed request keeps the LAST GOOD envelope and lets it age; it never blanks the UI and
 *     never retries in a tight loop
 *   - the feature flag is checked before the first fetch, so flag-off costs zero requests
 *
 * Freshness is recomputed on a 1s ticker against the reader's own clock (Rule B) — the badge ages
 * even when no request is in flight, so a dead feed visibly goes stale instead of looking live.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { liveReadyFor, liveUrl } from "@/lib/live/client";
import { effectiveIntervalMs, freshnessOf, refreshPolicyFor } from "@/lib/live/freshness.mjs";
import { isUnavailable } from "@/lib/live/contract.mjs";

type Envelope = Record<string, any>;

export interface LiveEventResult {
  /** The last envelope we successfully received. Kept across a failure, and allowed to age. */
  envelope: Envelope | null;
  /** A typed refusal from the gateway, or a transport failure expressed the same way. */
  unavailable: { reason: string } | null;
  freshness: { level: string; ageMs: number | null };
  /** True until the first response of any kind. */
  loading: boolean;
}

export function useLiveEvent(
  sport: "nfl" | "mlb",
  eventId: string | null,
  options: { players?: boolean; etDate?: string } = {},
): LiveEventResult {
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [unavailable, setUnavailable] = useState<{ reason: string } | null>(null);
  const [loading, setLoading] = useState(true);
  // A ticker that only advances the clock. Freshness is derived, never stored, so it cannot go stale.
  const [nowMs, setNowMs] = useState(() => Date.now());

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  const stopped = useRef(false);
  const players = options.players === true;
  // The event's ET date scopes the provider's slate to the one that contains this event.
  const etDate = options.etDate;

  const clearTimer = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const poll = useCallback(async () => {
    if (stopped.current || !eventId) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    let next: Envelope | null = null;
    try {
      const res = await fetch(liveUrl({ sport, event: eventId, players, date: etDate }), {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      const body = await res.json();
      if (isUnavailable(body)) {
        // A refusal does NOT discard the last good envelope: showing the previous state with a stale
        // badge is more truthful than blanking a game because one request failed.
        setUnavailable({ reason: body.reason });
      } else if (body?.event) {
        next = body.event;
        setEnvelope(body.event);
        setUnavailable(null);
      }
    } catch {
      if (controller.signal.aborted) return;
      setUnavailable({ reason: "PROVIDER_ERROR" });
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setNowMs(Date.now());
      }
    }

    if (stopped.current) return;
    // Schedule from the state we just observed. A terminal event returns a null interval and nothing
    // is scheduled — the loop ends here rather than continuing at a slower pace.
    const basis = next ?? envelope;
    if (!basis) {
      timer.current = setTimeout(poll, 60_000);
      return;
    }
    const policy = refreshPolicyFor(basis, Date.now());
    const interval = effectiveIntervalMs(policy, typeof document !== "undefined" && document.hidden);
    if (interval === null) return;
    timer.current = setTimeout(poll, interval);
  }, [sport, eventId, players, etDate, envelope]);

  useEffect(() => {
    if (!liveReadyFor(sport) || !eventId) {
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
    // `poll` intentionally omitted: it closes over `envelope` and including it would restart the
    // loop on every response, which is the accidental-tight-loop this hook exists to prevent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, eventId, players, etDate]);

  // Returning to the tab re-checks at once rather than waiting out a backed-off interval.
  useEffect(() => {
    if (!liveReadyFor(sport) || !eventId) return;
    const onVisible = () => {
      if (document.hidden || stopped.current) return;
      if (envelope && refreshPolicyFor(envelope, Date.now()).clientIntervalMs === null) return;
      clearTimer();
      void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [poll, clearTimer, envelope, eventId, sport]);

  // The age ticker. Runs only while an in-play envelope is on screen, so a finished game is idle.
  useEffect(() => {
    if (!envelope) return;
    if (refreshPolicyFor(envelope, Date.now()).clientIntervalMs === null) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [envelope]);

  const freshness = envelope
    ? freshnessOf(envelope, nowMs)
    : { level: "NOT_APPLICABLE" as const, ageMs: null };

  return { envelope, unavailable, freshness, loading };
}
