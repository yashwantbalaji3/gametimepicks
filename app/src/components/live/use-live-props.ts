"use client";
/**
 * The /live page's live-props records, fetched from the static export — ONE request per LIVE game per
 * shared refresh tick, from ONE owner.
 *
 * The record is already joined by the canonical producer (frozen forecast + live fact + settlement,
 * keyed by predictionId), so the browser never talks to ESPN and never fans out per player.
 *
 * ⚠ A failed refresh keeps the last record. Missing data is never presented as current and a live
 *   game never regresses to "nothing observed": staleness is read off the record's own `observedAt`.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { LIVE_PROPS_REFRESH_MS } from "@/lib/live/live-refresh-plan.mjs";
import { mergeGatewayLiveRows } from "@/lib/live/gateway-live-rows.mjs";
import { liveReadyFor, liveUrl } from "@/lib/live/client";

export type LivePropsFeed = "NOT_ASKED" | "OK" | "UNAVAILABLE";
/* Session 5 — `producerFeed` is the producer artifact alone; `feed` is OK when EITHER source was read.
   `gatewayIds` are the rows whose live value came from the gateway (gateway-live-rows.mjs). */
export interface LivePropsState { feed: LivePropsFeed; artifact: any | null; producerFeed?: LivePropsFeed; gatewayRead?: boolean; gatewayIds?: Set<string> }

export const NOT_ASKED: LivePropsState = { feed: "NOT_ASKED", artifact: null };

/**
 * THE PAGE'S ONE LIVE-PROPS OWNER. Cards never fetch and never run a timer; they receive their game's
 * record from here.
 *
 * `plan` is `liveRefreshPlan(...)`: LIVE ids are refreshed on ONE shared interval (while the tab is
 * visible), FINAL ids are fetched once, PRE ids are never fetched. When no game is live the interval
 * does not exist. A failed refresh keeps the last record — staleness is read off its own observedAt.
 */
export function useLivePropsStore(plan: { poll: string[]; once: string[]; noProducer?: string[] }, pollMs = LIVE_PROPS_REFRESH_MS): Record<string, LivePropsState> {
  const [store, setStore] = useState<Record<string, LivePropsState>>({});
  const onceDone = useRef(new Set<string>());
  const pollKey = plan.poll.join(",");
  const onceKey = plan.once.join(",");

  const noProducerKey = (plan.noProducer ?? []).join(",");
  const load = useCallback(async (id: string) => {
    const producerExists = !(noProducerKey ? noProducerKey.split(",") : []).includes(id);
    /* Session 5 — the producer record (frozen + settlement) and the gateway (live facts) on the SAME tick.
       The gateway call is the one useLiveEvent makes, CDN-cached by s-maxage; never a per-row request. */
    const [producer, gateway] = await Promise.all([
      /* `no-cache` revalidates against the CDN's ETag: an unchanged record costs a 304, not a body. */
      producerExists
        ? fetch(`/data/nfl/live-props/${id}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
      liveReadyFor("nfl")
        ? fetch(liveUrl({ sport: "nfl", event: id, players: true }), { headers: { accept: "application/json" } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
    ]);
    const merged = mergeGatewayLiveRows({ providerEventId: id, artifact: producer, envelope: gateway });
    if (!merged.artifact) {
      setStore((s) => (s[id]?.artifact ? s : { ...s, [id]: { feed: "UNAVAILABLE", artifact: null, producerFeed: "UNAVAILABLE", gatewayRead: false } }));
      return;
    }
    setStore((s) => ({ ...s, [id]: { feed: "OK", artifact: merged.artifact, producerFeed: producer ? "OK" : "UNAVAILABLE", gatewayRead: merged.gatewayRead, gatewayIds: merged.gatewayIds } }));
  }, [noProducerKey]);

  /* FINAL games: one fetch each, for the final stat. */
  useEffect(() => {
    for (const id of onceKey ? onceKey.split(",") : []) {
      if (onceDone.current.has(id)) continue;
      onceDone.current.add(id);
      void load(id);
    }
  }, [onceKey, load]);

  /* LIVE games: one shared interval for all of them — and none at all when nothing is live. */
  useEffect(() => {
    const ids = pollKey ? pollKey.split(",") : [];
    if (ids.length === 0) return;
    const tick = () => { for (const id of ids) void load(id); };
    tick();
    const timer = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") tick();
    }, pollMs);
    return () => clearInterval(timer);
  }, [pollKey, pollMs, load]);

  return store;
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
