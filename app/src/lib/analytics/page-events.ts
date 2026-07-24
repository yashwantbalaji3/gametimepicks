/**
 * PAGE → FUNNEL EVENT mapping — a PURE function that maps a first-party pathname to the already-defined
 * analytics events for the consumer funnel (Homepage → Today → Brief → Game Report → Results → Return).
 * It only instruments EXISTING interactions (page views) and only emits allowlisted, PII-free events; the
 * client bootstrap forwards them to the resolved sink (NO-OP unless a provider is configured).
 *
 * No React/Next imports so tsx can unit-test it directly.
 */
import { SCHEMA_VERSION, type AnalyticsEvent, type Sport, type SourceBucket } from "./event-contract";

/** Coarse pathname → the funnel event(s) a page VIEW represents. Day bucket + sport supplied by the caller. */
export function funnelEventsForPath(pathname: string, ctx: { dayBucket: string; sport?: Sport }): AnalyticsEvent[] {
  const p = (pathname || "/").split("?")[0].replace(/\/+$/, "") || "/";
  const dayBucket = ctx.dayBucket;
  const sport: Sport = ctx.sport ?? "mlb";
  const events: AnalyticsEvent[] = [];

  if (p === "/today") {
    events.push({ event: "daily_hub_view", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "daily_hub", sport, slateDateBucket: dayBucket });
    events.push({ event: "daily_brief_view", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "daily_hub", sport });
  } else if (/^\/games\/[a-z_]+\/[a-z0-9-]+$/.test(p)) {
    events.push({ event: "game_report_open", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "game_report", sport });
  } else if (p === "/results" || p.startsWith("/results/")) {
    events.push({ event: "results_recap_open", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "results", sport });
  } else if (p === "/mlb") {
    events.push({ event: "daily_hub_view", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "daily_hub", sport: "mlb", slateDateBucket: dayBucket });
  }
  // Home ("/") has no page-VIEW funnel event — its CTA is a click, instrumented separately when wired.
  return events;
}

/** The once-per-session coarse acquisition event. */
export function sourceVisitEvent(source: SourceBucket, dayBucket: string): AnalyticsEvent {
  return { event: "source_visit", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "app", source };
}
