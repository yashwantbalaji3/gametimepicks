/**
 * PAGE → FUNNEL EVENT mapping — a PURE function that maps a first-party pathname to the already-defined
 * analytics events for the consumer funnel (Homepage → Today → Brief → Game Report → Results → Return).
 * It only instruments EXISTING interactions (page views) and only emits allowlisted, PII-free events; the
 * client bootstrap forwards them to the resolved sink (NO-OP unless a provider is configured).
 *
 * No React/Next imports so tsx can unit-test it directly.
 */
import { SCHEMA_VERSION, type AnalyticsEvent, type MarketFamily, type Sport, type SourceBucket } from "./event-contract";

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
  } else if (p === "/") {
    // v1 deliberately gave home no page-VIEW event (CTA-click only). Superseded by Program 058-061:
    // the public-beta funnel starts at Landing, so the homepage view is now the funnel's first step.
    events.push({ event: "homepage_viewed", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "homepage" });
  } else if (p === "/markets") {
    events.push({ event: "market_center_view", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "markets", sport });
  } else if (p === "/methodology") {
    events.push({ event: "methodology_viewed", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "methodology" });
  } else if (p === "/system-status") {
    events.push({ event: "status_viewed", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "system_status" });
  }
  return events;
}

/** The once-per-session coarse acquisition event. */
export function sourceVisitEvent(source: SourceBucket, dayBucket: string): AnalyticsEvent {
  return { event: "source_visit", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "app", source };
}

/**
 * A model-vs-market disagreement view was opened (v2 interaction) — e.g. choosing the /markets
 * "largest difference" sort. Pure builder so call sites construct the event ONE way and the shape
 * stays unit-testable. The /markets sort spans every family at once, so the family dimension is the
 * coarse catch-all bucket unless a caller scopes it to one family.
 */
export function marketDisagreementOpenedEvent(
  dayBucket: string,
  opts?: { sport?: Sport; marketFamily?: MarketFamily },
): AnalyticsEvent {
  return {
    event: "market_disagreement_opened",
    schemaVersion: SCHEMA_VERSION,
    dayBucket,
    surface: "markets",
    sport: opts?.sport ?? "mlb",
    marketFamily: opts?.marketFamily ?? "other",
  };
}
