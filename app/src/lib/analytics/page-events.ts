/**
 * PAGE → FUNNEL EVENT mapping — a PURE function that maps a first-party pathname to the already-defined
 * analytics events for the consumer funnel (Homepage → Today → Brief → Game Report → Results → Return).
 * It only instruments EXISTING interactions (page views) and only emits allowlisted, PII-free events; the
 * client bootstrap forwards them to the resolved sink (NO-OP unless a provider is configured).
 *
 * No React/Next imports so tsx can unit-test it directly.
 */
import {
  SCHEMA_VERSION,
  type AnalyticsEvent,
  type CtaDestination,
  type CtaKind,
  type MarketFamily,
  type Sport,
  type SourceBucket,
  type TrustSurface,
} from "./event-contract";

/**
 * The clarity/trust pages that already exist as routes. A page VIEW is the control here — these are
 * server-rendered reading surfaces with nothing to click — so the bootstrap's existing page-view path is
 * the honest instrumentation point. `/methodology` and `/system-status` are deliberately absent: they
 * carry their own v2 page-view events (`methodology_viewed` / `status_viewed`), and emitting a second
 * trust event for the same view would double-count the trust loop.
 */
const TRUST_ROUTES: Record<string, { surface: "learn" | "trust"; trustSurface: TrustSurface }> = {
  "/learn": { surface: "learn", trustSurface: "how_it_works" },
  "/market-guide": { surface: "learn", trustSurface: "market_guide" },
  "/responsible-use": { surface: "trust", trustSurface: "responsible_use" },
};

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
  } else if (TRUST_ROUTES[p]) {
    const t = TRUST_ROUTES[p];
    events.push({ event: "learn_trust_open", schemaVersion: SCHEMA_VERSION, dayBucket, surface: t.surface, trustSurface: t.trustSurface });
  }
  return events;
}

/** The once-per-session coarse acquisition event. */
export function sourceVisitEvent(source: SourceBucket, dayBucket: string): AnalyticsEvent {
  return { event: "source_visit", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "app", source };
}

/**
 * Map a first-party CTA href to the closed `destination` bucket. A BUCKET, never the URL — an unrecognised
 * destination is `other` rather than leaking the path. Pure; query/hash/trailing slash are stripped first.
 */
export function ctaDestinationForHref(href: string): CtaDestination {
  const p = (href || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (p === "/simulate") return "simulate";
  if (p === "/today") return "today";
  if (p === "/results" || p.startsWith("/results/")) return "results";
  if (p === "/learn" || p === "/market-guide" || p === "/methodology") return "learn";
  if (p === "/games" || p.startsWith("/games/")) return "games";
  return "other";
}

/**
 * The homepage hero CTA click. THE public builder for that call site: a component passes the href it
 * already renders and the coarse bucket is derived here, so no call site can invent a destination value.
 */
export function homeCtaClickEvent(dayBucket: string, cta: CtaKind, href: string): AnalyticsEvent {
  return { event: "home_cta_click", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "homepage", cta, destination: ctaDestinationForHref(href) };
}

/** The return loop's forward step — a results-surface control that routes back to today's slate. */
export function todaySlateClickedFromResultsEvent(dayBucket: string, sport: Sport = "mlb"): AnalyticsEvent {
  return { event: "today_slate_clicked_from_results", schemaVersion: SCHEMA_VERSION, dayBucket, surface: "results", sport };
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
