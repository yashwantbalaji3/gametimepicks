/**
 * Product-measurement event contract (provider-neutral, PII-free).
 *
 * Phase 9 of the product-adoption sprint. This module is the single typed
 * source of truth for the small set of product-adoption events described in
 * `docs/PRODUCT_ANALYTICS_EVENT_CONTRACT.md`. It answers ONE question per
 * surface — "is clarity + daily use improving?" — WITHOUT collecting personal
 * data and WITHOUT activating any third-party tracker.
 *
 * What this module is:
 *   - A discriminated union of the P0 adoption events + their minimal,
 *     closed-enum, non-PII properties.
 *   - A pure `validateEvent()` shape checker.
 *   - A pure `emitEvent(event, sink?)` whose DEFAULT sink is a NO-OP. Nothing
 *     is sent, persisted, or logged unless a real sink is explicitly injected.
 *
 * What this module is NOT (hard constraints):
 *   - It imports NO external SDK and makes NO network request.
 *   - It reads NO cookies, localStorage, navigator, IP, geo, or device data.
 *   - It defines NO field that could carry personal data. The property-key
 *     allowlist is closed and the accompanying test asserts it never overlaps
 *     the PII denylist.
 *   - It has ZERO module-level side effects, so it tree-shakes away entirely
 *     until a caller imports `emitEvent` AND a sink is approved/injected.
 *
 * Turning on a real (privacy-first, no-cookie, self-hosted) provider is a
 * FOUNDER DECISION documented in the contract doc — not something this module
 * does on its own.
 */

/* ------------------------------------------------------------------ *
 * Versioning + coarse dimensions
 * ------------------------------------------------------------------ */

/** Bumped only when the wire shape of an event changes. */
export const SCHEMA_VERSION = 1 as const;

/**
 * A "day bucket" is a coarse ET calendar day, `YYYY-MM-DD` — day granularity
 * ONLY, never a precise timestamp. It is the same public slate date every
 * visitor sees, so it identifies a calendar day, never a person.
 */
export const DAY_BUCKET_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Sports that currently have a live product surface. */
export const SPORTS = ["mlb", "nba", "nhl", "ipl", "ufc", "multi", "unknown"] as const;
export type Sport = (typeof SPORTS)[number];

/** Which homepage CTA was clicked. */
export const CTA_KINDS = ["primary", "secondary"] as const;
export type CtaKind = (typeof CTA_KINDS)[number];

/** Coarse route the homepage CTA points at — a bucket, never a full URL/query. */
export const CTA_DESTINATIONS = ["simulate", "today", "results", "learn", "games", "other"] as const;
export type CtaDestination = (typeof CTA_DESTINATIONS)[number];

/** How a share was initiated. No recipient, target, or channel is recorded. */
export const SHARE_METHODS = ["native", "copy_link"] as const;
export type ShareMethod = (typeof SHARE_METHODS)[number];

/** Coarse surface a share started from. */
export const SHARE_ORIGINS = ["game_report", "results", "daily_hub", "other"] as const;
export type ShareOrigin = (typeof SHARE_ORIGINS)[number];

/** Top-level surface for the "understand the product" family. */
export const LEARN_SURFACES = ["learn", "trust"] as const;
export type LearnSurface = (typeof LEARN_SURFACES)[number];

/** Which clarity/trust page was opened. */
export const TRUST_SURFACES = [
  "how_it_works",
  "methodology",
  "market_guide",
  "responsible_use",
  "results_trust",
] as const;
export type TrustSurface = (typeof TRUST_SURFACES)[number];

/**
 * Coarse return-visit cohort derived from a privacy-first, first-party day
 * bucket (see `classifyReturnCohort`). It is a bucket, never a visit count or
 * timestamp, and carries no cross-site identifier.
 */
export const RETURN_COHORTS = ["first_visit", "same_day", "next_day", "within_week", "later"] as const;
export type ReturnCohort = (typeof RETURN_COHORTS)[number];

/* ------------------------------------------------------------------ *
 * Event discriminated union
 * ------------------------------------------------------------------ */

/** All event discriminants. The order is not significant. */
export const EVENT_TYPES = [
  "home_cta_click",
  "daily_hub_view",
  "game_report_open",
  "results_recap_open",
  "share_action",
  "learn_trust_open",
  "return_visit",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Fields carried by every event. */
interface BaseEvent {
  /** Discriminant. */
  event: EventType;
  /** Wire-shape version. */
  schemaVersion: typeof SCHEMA_VERSION;
  /** Coarse ET calendar day (`YYYY-MM-DD`). Day granularity only. */
  dayBucket: string;
}

/** Homepage primary/secondary CTA click. */
export interface HomeCtaClickEvent extends BaseEvent {
  event: "home_cta_click";
  surface: "homepage";
  cta: CtaKind;
  destination: CtaDestination;
}

/** A daily hub (e.g. /today or a sport hub) was viewed. */
export interface DailyHubViewEvent extends BaseEvent {
  event: "daily_hub_view";
  surface: "daily_hub";
  sport: Sport;
  /** The slate's public date, as a coarse day bucket. */
  slateDateBucket: string;
}

/** A game report was opened. */
export interface GameReportOpenEvent extends BaseEvent {
  event: "game_report_open";
  surface: "game_report";
  sport: Sport;
}

/** A results / receipts recap was opened. */
export interface ResultsRecapOpenEvent extends BaseEvent {
  event: "results_recap_open";
  surface: "results";
  sport: Sport;
}

/** A share control was activated. Only that a share started is recorded. */
export interface ShareActionEvent extends BaseEvent {
  event: "share_action";
  surface: ShareOrigin;
  method: ShareMethod;
  sport: Sport;
}

/** A "how it works" / trust / clarity page was opened. */
export interface LearnTrustOpenEvent extends BaseEvent {
  event: "learn_trust_open";
  surface: LearnSurface;
  trustSurface: TrustSurface;
}

/** A return-day visit, bucketed from a first-party day bucket. */
export interface ReturnVisitEvent extends BaseEvent {
  event: "return_visit";
  surface: "app";
  returning: boolean;
  cohortBucket: ReturnCohort;
}

/** The full set of product-adoption events. */
export type AnalyticsEvent =
  | HomeCtaClickEvent
  | DailyHubViewEvent
  | GameReportOpenEvent
  | ResultsRecapOpenEvent
  | ShareActionEvent
  | LearnTrustOpenEvent
  | ReturnVisitEvent;

/**
 * The adoption question each event answers. Typed as an exhaustive record so
 * that adding an `EventType` without documenting its question fails the
 * TypeScript build.
 */
export const ADOPTION_QUESTIONS: Record<EventType, string> = {
  home_cta_click: "Does the homepage hero convert visitors into the core action (simulate / today)?",
  daily_hub_view: "Are people reaching the daily hub, and for which sport?",
  game_report_open: "Are game reports — the core value surface — actually being opened?",
  results_recap_open: "Do visitors check results/receipts (the trust loop)?",
  share_action: "Is the content compelling enough that people share it?",
  learn_trust_open: "Are visitors seeking to understand the product (the clarity loop)?",
  return_visit: "Do people come back on later days (daily-use habit / retention)?",
};

/* ------------------------------------------------------------------ *
 * Non-PII property governance
 * ------------------------------------------------------------------ */

/**
 * The CLOSED set of property keys any event may carry. A key outside this set
 * is rejected by `validateEvent`. New keys must be added deliberately here and
 * must not overlap `PII_KEY_DENYLIST` (a test enforces the empty intersection).
 */
export const ALLOWED_PROPERTY_KEYS = [
  "event",
  "schemaVersion",
  "dayBucket",
  "surface",
  "cta",
  "destination",
  "sport",
  "slateDateBucket",
  "method",
  "trustSurface",
  "returning",
  "cohortBucket",
] as const;
export type AllowedPropertyKey = (typeof ALLOWED_PROPERTY_KEYS)[number];

/**
 * Substrings that must never appear in a property key. This is a belt-and-
 * suspenders guard on top of the closed allowlist: it makes it impossible to
 * quietly grow the allowlist into anything that reads personal data.
 */
export const PII_KEY_DENYLIST = [
  "email",
  "name",
  "user",
  "uid",
  "ipaddr",
  "ipaddress",
  "geo",
  "latitude",
  "longitude",
  "coord",
  "gps",
  "fingerprint",
  "device",
  "phone",
  "address",
  "postal",
  "ssn",
  "passport",
  "cookie",
  "referer",
  "referrer",
  "useragent",
  "gender",
  "birth",
  "dob",
  "sessionid",
  "precise",
  "location",
  "screen",
  "timezone",
] as const;

/* ------------------------------------------------------------------ *
 * Runtime lookup sets (module-local, no side effects)
 * ------------------------------------------------------------------ */

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);
const ALLOWED_PROPERTY_KEY_SET: ReadonlySet<string> = new Set(ALLOWED_PROPERTY_KEYS);
const SPORT_SET: ReadonlySet<string> = new Set(SPORTS);
const CTA_KIND_SET: ReadonlySet<string> = new Set(CTA_KINDS);
const CTA_DESTINATION_SET: ReadonlySet<string> = new Set(CTA_DESTINATIONS);
const SHARE_METHOD_SET: ReadonlySet<string> = new Set(SHARE_METHODS);
const SHARE_ORIGIN_SET: ReadonlySet<string> = new Set(SHARE_ORIGINS);
const LEARN_SURFACE_SET: ReadonlySet<string> = new Set(LEARN_SURFACES);
const TRUST_SURFACE_SET: ReadonlySet<string> = new Set(TRUST_SURFACES);
const RETURN_COHORT_SET: ReadonlySet<string> = new Set(RETURN_COHORTS);

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export type ValidationResult = { ok: true } | { ok: false; error: string };

const OK: ValidationResult = { ok: true };
const err = (error: string): ValidationResult => ({ ok: false, error });

/** Compile-time exhaustiveness guard — unreachable at runtime. */
function assertNever(x: never): ValidationResult {
  return err(`unhandled event type: ${JSON.stringify(x)}`);
}

/** True when `s` is a well-formed coarse day bucket (`YYYY-MM-DD`). */
export function isValidDayBucket(s: unknown): s is string {
  return typeof s === "string" && DAY_BUCKET_RE.test(s);
}

/**
 * Validate an event's runtime shape against the contract. Pure — no I/O, never
 * throws. Checks: object shape, known discriminant, schema version, day-bucket
 * format, the closed property-key allowlist, and per-type enum membership.
 */
export function validateEvent(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) return err("event must be an object");
  const rec = input as Record<string, unknown>;

  if (typeof rec.event !== "string" || !EVENT_TYPE_SET.has(rec.event)) {
    return err(`unknown event type: ${String(rec.event)}`);
  }
  if (rec.schemaVersion !== SCHEMA_VERSION) {
    return err(`schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!isValidDayBucket(rec.dayBucket)) {
    return err("dayBucket must be a YYYY-MM-DD day bucket");
  }

  // Closed property-key allowlist — rejects unknown or PII-ish keys.
  for (const key of Object.keys(rec)) {
    if (!ALLOWED_PROPERTY_KEY_SET.has(key)) return err(`disallowed property key: ${key}`);
  }

  const type = rec.event as EventType;
  switch (type) {
    case "home_cta_click":
      if (rec.surface !== "homepage") return err("home_cta_click.surface must be 'homepage'");
      if (!CTA_KIND_SET.has(rec.cta as string)) return err("home_cta_click.cta invalid");
      if (!CTA_DESTINATION_SET.has(rec.destination as string)) return err("home_cta_click.destination invalid");
      return OK;

    case "daily_hub_view":
      if (rec.surface !== "daily_hub") return err("daily_hub_view.surface must be 'daily_hub'");
      if (!SPORT_SET.has(rec.sport as string)) return err("daily_hub_view.sport invalid");
      if (!isValidDayBucket(rec.slateDateBucket)) return err("daily_hub_view.slateDateBucket invalid");
      return OK;

    case "game_report_open":
      if (rec.surface !== "game_report") return err("game_report_open.surface must be 'game_report'");
      if (!SPORT_SET.has(rec.sport as string)) return err("game_report_open.sport invalid");
      return OK;

    case "results_recap_open":
      if (rec.surface !== "results") return err("results_recap_open.surface must be 'results'");
      if (!SPORT_SET.has(rec.sport as string)) return err("results_recap_open.sport invalid");
      return OK;

    case "share_action":
      if (!SHARE_ORIGIN_SET.has(rec.surface as string)) return err("share_action.surface invalid");
      if (!SHARE_METHOD_SET.has(rec.method as string)) return err("share_action.method invalid");
      if (!SPORT_SET.has(rec.sport as string)) return err("share_action.sport invalid");
      return OK;

    case "learn_trust_open":
      if (!LEARN_SURFACE_SET.has(rec.surface as string)) return err("learn_trust_open.surface invalid");
      if (!TRUST_SURFACE_SET.has(rec.trustSurface as string)) return err("learn_trust_open.trustSurface invalid");
      return OK;

    case "return_visit":
      if (rec.surface !== "app") return err("return_visit.surface must be 'app'");
      if (typeof rec.returning !== "boolean") return err("return_visit.returning must be boolean");
      if (!RETURN_COHORT_SET.has(rec.cohortBucket as string)) return err("return_visit.cohortBucket invalid");
      return OK;

    default:
      return assertNever(type);
  }
}

/* ------------------------------------------------------------------ *
 * Sinks + emitter
 * ------------------------------------------------------------------ */

/** A sink receives already-validated events. It must not throw. */
export type AnalyticsEventSink = (event: AnalyticsEvent) => void;

/**
 * The DEFAULT sink: a pure no-op. It performs no network call, writes no
 * storage, logs nothing, and mutates no shared state. Until a real sink is
 * approved and injected, every `emitEvent` call resolves to this.
 */
export const NOOP_SINK: AnalyticsEventSink = () => {
  /* intentionally empty — no provider is activated */
};

/**
 * Opt-in developer sink. NOT wired anywhere and never the default; a developer
 * may pass it explicitly while working locally. Guards `console` so it is safe
 * in any runtime.
 */
export const devConsoleSink: AnalyticsEventSink = (event) => {
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[gtp:analytics]", event.event, event);
  }
};

/**
 * In-memory sink factory for tests and inspection. Captures events in an array;
 * performs no I/O.
 */
export function createMemorySink(): { sink: AnalyticsEventSink; events: AnalyticsEvent[] } {
  const events: AnalyticsEvent[] = [];
  return {
    sink: (event) => {
      events.push(event);
    },
    events,
  };
}

/**
 * Emit a product-adoption event.
 *
 * By default this routes to `NOOP_SINK` — nothing is sent, stored, or logged,
 * and no provider is activated. A real sink may be injected AFTER founder
 * approval (see `docs/PRODUCT_ANALYTICS_EVENT_CONTRACT.md`). Only VALID events
 * reach the sink; malformed events are dropped silently so a bad call can never
 * throw inside a user session.
 *
 * @returns `true` when a valid event was forwarded to the sink, else `false`.
 */
export function emitEvent(event: AnalyticsEvent, sink: AnalyticsEventSink = NOOP_SINK): boolean {
  if (!validateEvent(event).ok) return false;
  sink(event);
  return true;
}

/* ------------------------------------------------------------------ *
 * Return-visit helpers (privacy-first, pure — no storage access here)
 * ------------------------------------------------------------------ */

/**
 * Whole-day delta between two day buckets (`toDay - fromDay`). Returns 0 on any
 * malformed input. Pure.
 */
export function dayBucketDeltaDays(fromDay: string, toDay: string): number {
  if (!isValidDayBucket(fromDay) || !isValidDayBucket(toDay)) return 0;
  const a = Date.parse(`${fromDay}T00:00:00Z`);
  const b = Date.parse(`${toDay}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Classify a return-visit cohort from first-party day buckets. Pure: it does
 * NOT read storage, cookies, or the clock — the caller supplies the buckets it
 * already holds (e.g. read from same-origin storage in a future hook). The
 * inputs are coarse calendar days, never timestamps or identifiers.
 */
export function classifyReturnCohort(input: {
  firstSeenDayBucket: string | null;
  lastSeenDayBucket: string | null;
  todayDayBucket: string;
}): ReturnCohort {
  const { firstSeenDayBucket, lastSeenDayBucket, todayDayBucket } = input;
  if (!firstSeenDayBucket) return "first_visit";
  const prior = lastSeenDayBucket ?? firstSeenDayBucket;
  const gap = dayBucketDeltaDays(prior, todayDayBucket);
  if (gap <= 0) return "same_day";
  if (gap === 1) return "next_day";
  if (gap <= 7) return "within_week";
  return "later";
}

/**
 * Build a validated `ReturnVisitEvent` from first-party day buckets. Pure — no
 * storage or clock access. Convenience so callers construct the event one way.
 */
export function buildReturnVisitEvent(input: {
  firstSeenDayBucket: string | null;
  lastSeenDayBucket: string | null;
  todayDayBucket: string;
}): ReturnVisitEvent {
  const cohortBucket = classifyReturnCohort(input);
  return {
    event: "return_visit",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: input.todayDayBucket,
    surface: "app",
    returning: input.firstSeenDayBucket != null && cohortBucket !== "first_visit",
    cohortBucket,
  };
}
