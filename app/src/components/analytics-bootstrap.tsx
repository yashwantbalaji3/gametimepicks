/**
 * AnalyticsBootstrap — the ONE client-side glue that turns the pure analytics layers into runtime signal on
 * a statically-exported site (no server, no vendor SDK). On mount / navigation it:
 *   1. resolves the active sink from build-time config — NO-OP unless a provider endpoint is configured AND
 *      the kill-switch is enabled, so by default NOTHING leaves the browser;
 *   2. emits ONE coarse `source_visit` per session (first-party sessionStorage guard; day-granularity; no
 *      identifier, no full referrer URL);
 *   3. emits the allowlisted funnel page-view events for the current path.
 * Every step is wrapped so analytics can NEVER break the site. This component renders nothing.
 */
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { emitEvent } from "@/lib/analytics/event-contract";
import { readSinkConfig, resolveSink } from "@/lib/analytics/sink";
import { classifySource } from "@/lib/analytics/source";
import { funnelEventsForPath, sourceVisitEvent } from "@/lib/analytics/page-events";
import { currentEtDate } from "@/lib/freshness";

export default function AnalyticsBootstrap() {
  const pathname = usePathname();
  useEffect(() => {
    // Default = dark: with no approved provider endpoint, this resolves to the NO-OP sink.
    const sink = resolveSink(readSinkConfig());
    const dayBucket = currentEtDate();

    // Coarse acquisition source — once per session only.
    try {
      if (typeof window !== "undefined" && window.sessionStorage && !window.sessionStorage.getItem("gtp_src")) {
        const params = new URLSearchParams(window.location.search);
        let referrerHost = "";
        try {
          referrerHost = document.referrer ? new URL(document.referrer).host : "";
        } catch {
          referrerHost = "";
        }
        const sameOrigin = referrerHost !== "" && referrerHost === window.location.host;
        const source = classifySource({ sourceParam: params.get("source"), referrerHost, sameOrigin });
        window.sessionStorage.setItem("gtp_src", source);
        emitEvent(sourceVisitEvent(source, dayBucket), sink);
      }
    } catch {
      /* analytics must never break the site */
    }

    // Funnel page-view events for this path.
    try {
      for (const ev of funnelEventsForPath(pathname ?? "/", { dayBucket })) emitEvent(ev, sink);
    } catch {
      /* swallow */
    }
  }, [pathname]);

  return null;
}
