"use client";
/**
 * The game's live-props record, fetched from the static export — ONE request per game per refresh.
 *
 * The record is already joined by the canonical producer (frozen forecast + live fact + settlement,
 * keyed by predictionId), so the browser never talks to ESPN and never fans out per player.
 *
 * ⚠ A failed refresh keeps the last record. Missing data is never presented as current and a live
 *   game never regresses to "nothing observed": staleness is read off the record's own `observedAt`.
 */
import { useEffect, useState } from "react";

export type LivePropsFeed = "NOT_ASKED" | "OK" | "UNAVAILABLE";
export interface LivePropsState { feed: LivePropsFeed; artifact: any | null }

const NOT_ASKED: LivePropsState = { feed: "NOT_ASKED", artifact: null };

export function useLiveProps(providerEventId: string, { active, poll, pollMs = 60_000 }: { active: boolean; poll: boolean; pollMs?: number }): LivePropsState {
  const [state, setState] = useState<LivePropsState>(NOT_ASKED);

  useEffect(() => {
    if (!active || !/^\d+$/.test(providerEventId)) return;
    let cancelled = false;
    const load = async () => {
      try {
        /* `no-cache` revalidates against the CDN's ETag: an unchanged record costs a 304, not a body. */
        const res = await fetch(`/data/nfl/live-props/${providerEventId}.json`, { cache: "no-cache" });
        if (!res.ok) throw new Error(String(res.status));
        const artifact = await res.json();
        if (!cancelled) setState({ feed: "OK", artifact });
      } catch {
        if (!cancelled) setState((s) => (s.artifact ? s : { feed: "UNAVAILABLE", artifact: null }));
      }
    };
    load();
    if (!poll) return () => { cancelled = true; };
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") load();
    }, pollMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [providerEventId, active, poll, pollMs]);

  return state;
}

/**
 * The reader's clock, or null until after hydration. A server-rendered age would be the BUILD's
 * clock — a static claim about the present that ages into a lie — and would mismatch on hydration.
 */
export function useNowMs(intervalMs = 15_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
