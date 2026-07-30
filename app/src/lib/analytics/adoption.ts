/**
 * ADOPTION AGGREGATOR — the PURE reduction from a capture of validated v2 analytics events to the internal
 * adoption read (/ops). It is the only place the funnel definitions in `docs/PUBLIC_BETA_ANALYTICS_CONTRACT.md`
 * §4 are turned into numbers, and it is deliberately dumb about where the events came from.
 *
 * Honesty contract (the reason this module exists rather than a chart library):
 *   • A metric is either MEASURED or `NOT_YET_MEASURED` with a reason. A rate whose denominator is 0 is
 *     UNKNOWN, never "0%" — a fabricated zero would read as a measured failure.
 *   • A COUNT of an event that genuinely did not occur inside a window that DID carry traffic is a real
 *     measured zero, and is reported as such. That distinction is the whole point of the two states.
 *   • Every event is re-validated here against the contract. The aggregator NEVER trusts its input file;
 *     rejected events are counted and surfaced as a data-quality signal instead of silently dropped.
 *   • The contract has no session identity by design (day buckets only), so "activation" and "research
 *     depth" are EVENT-COUNT ratios, not per-user rates. Each carries its `basis` string so the dashboard
 *     cannot present them as something they are not.
 *   • Sport demand is not interpretable under `MIN_SPORT_DEMAND_WINDOW_DAYS` of live measurement (the
 *     strategy doc's ≥ 4-week bar); the report says so rather than leaving the caller to remember.
 *
 * Pure: no clock, no fs, no network, no module-level state. The caller supplies the parsed capture.
 */
import {
  EVENT_TYPES,
  RETURN_COHORTS,
  SCHEMA_VERSION,
  SPORTS,
  dayBucketDeltaDays,
  isValidDayBucket,
  validateEvent,
  type AnalyticsEvent,
  type EventType,
  type ReturnCohort,
  type Sport,
} from "./event-contract";
import { NOT_YET_MEASURED } from "./growth-ops";
import type { SinkConfig } from "./sink";

/** Re-exported so the dashboard renders ONE "not measured" token across every internal panel. */
export { NOT_YET_MEASURED };

/* ------------------------------------------------------------------ *
 * Measurement state
 * ------------------------------------------------------------------ */

export type Measured<T> = { state: "measured"; value: T };
export type NotYetMeasured = { state: "not_yet_measured"; reason: string };
export type Measure<T> = Measured<T> | NotYetMeasured;

export const measured = <T>(value: T): Measured<T> => ({ state: "measured", value });
export const notYetMeasured = (reason: string): NotYetMeasured => ({ state: "not_yet_measured", reason });
export const isMeasured = <T>(m: Measure<T>): m is Measured<T> => m.state === "measured";

/** OFF = nothing is collected. STAGING = collected against a non-production endpoint. LIVE = production. */
export const MEASUREMENT_MODES = ["off", "staging", "live"] as const;
export type MeasurementMode = (typeof MEASUREMENT_MODES)[number];

/** Hosts that can never be production measurement, however the endpoint env is set. */
const NON_PRODUCTION_HOST_RE = /(^|\.)(localhost|127\.0\.0\.1|0\.0\.0\.0)$|staging|preview|\.vercel\.app$/i;

/** Hostname only — the port is irrelevant to whether a host can be production. */
function endpointHost(endpoint: string | null): string | null {
  if (!endpoint) return null;
  try {
    return new URL(endpoint).hostname;
  } catch {
    return null;
  }
}

/**
 * Resolve the measurement mode from the (already fail-closed) sink config. OFF unless the sink itself is
 * live — so the dashboard can never claim measurement the sink is not doing. `NEXT_PUBLIC_ANALYTICS_MODE=staging`
 * forces STAGING for a rehearsal against a production-shaped endpoint; a non-production host implies it.
 */
export function resolveMeasurementMode(config: SinkConfig, env?: Record<string, string | undefined>): MeasurementMode {
  if (!config.enabled || !config.endpoint) return "off";
  const e = env ?? (typeof process !== "undefined" && process.env ? process.env : {});
  if (String(e.NEXT_PUBLIC_ANALYTICS_MODE ?? "").trim().toLowerCase() === "staging") return "staging";
  const host = endpointHost(config.endpoint);
  if (host == null || NON_PRODUCTION_HOST_RE.test(host)) return "staging";
  return "live";
}

/* ------------------------------------------------------------------ *
 * Capture envelope (the fixture / future production file format)
 * ------------------------------------------------------------------ */

export const CAPTURE_KIND = "analytics-event-capture" as const;
/** Bounded so a malformed window can never make day enumeration unbounded work. */
export const MAX_CAPTURE_WINDOW_DAYS = 366;
/** The ≥ 4-week bar from the ratified strategy — below it, sport demand is NOT interpreted. */
export const MIN_SPORT_DEMAND_WINDOW_DAYS = 28;

/**
 * A capture is a window of raw event payloads plus the window it claims to cover. It carries NO identity,
 * NO raw payload beyond the closed-enum events themselves, and no timestamps finer than a day bucket.
 * Production will write this same shape; fixtures are the only source until activation.
 */
export interface AdoptionCapture {
  kind: typeof CAPTURE_KIND;
  schemaVersion: typeof SCHEMA_VERSION;
  /** Coarse ET day bucket the window opens on (inclusive). */
  windowStart: string;
  /** Coarse ET day bucket the window closes on (inclusive). */
  windowEnd: string;
  /** The mode the capture was collected under — a capture can never be more live than its collection. */
  collectedUnder: MeasurementMode;
  events: unknown[];
}

export type CaptureParse = { capture: AdoptionCapture; error: null } | { capture: null; error: string };

/** Parse + fail closed on the envelope. An unusable capture is an error, never an empty-but-valid window. */
export function parseAdoptionCapture(raw: unknown): CaptureParse {
  const bad = (error: string): CaptureParse => ({ capture: null, error });
  if (typeof raw !== "object" || raw === null) return bad("capture must be an object");
  const r = raw as Record<string, unknown>;
  if (r.kind !== CAPTURE_KIND) return bad(`capture.kind must be "${CAPTURE_KIND}"`);
  if (r.schemaVersion !== SCHEMA_VERSION) return bad(`capture.schemaVersion must be ${SCHEMA_VERSION}`);
  if (!isValidDayBucket(r.windowStart)) return bad("capture.windowStart must be a YYYY-MM-DD day bucket");
  if (!isValidDayBucket(r.windowEnd)) return bad("capture.windowEnd must be a YYYY-MM-DD day bucket");
  const span = dayBucketDeltaDays(r.windowStart as string, r.windowEnd as string);
  if (span < 0) return bad("capture.windowEnd is before capture.windowStart");
  if (span + 1 > MAX_CAPTURE_WINDOW_DAYS) return bad(`capture window exceeds ${MAX_CAPTURE_WINDOW_DAYS} days`);
  if (!MEASUREMENT_MODES.includes(r.collectedUnder as MeasurementMode)) return bad("capture.collectedUnder must be off|staging|live");
  if (!Array.isArray(r.events)) return bad("capture.events must be an array");
  return {
    capture: {
      kind: CAPTURE_KIND,
      schemaVersion: SCHEMA_VERSION,
      windowStart: r.windowStart as string,
      windowEnd: r.windowEnd as string,
      collectedUnder: r.collectedUnder as MeasurementMode,
      events: r.events as unknown[],
    },
    error: null,
  };
}

/* ------------------------------------------------------------------ *
 * Rejection accounting
 * ------------------------------------------------------------------ */

/** Closed rejection taxonomy — the dashboard shows WHY events were dropped, never a raw error string. */
export const REJECTION_REASONS = ["invalid_shape", "unknown_event", "schema_version", "day_bucket", "disallowed_key", "invalid_field", "outside_window"] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

function classifyRejection(raw: unknown, window: { start: string; end: string }): RejectionReason | null {
  if (typeof raw !== "object" || raw === null) return "invalid_shape";
  const r = raw as Record<string, unknown>;
  if (r.schemaVersion !== SCHEMA_VERSION) return "schema_version";
  const result = validateEvent(raw);
  if (!result.ok) {
    const e = result.error;
    if (e.startsWith("unknown event type")) return "unknown_event";
    if (e.startsWith("disallowed property key")) return "disallowed_key";
    if (e.startsWith("dayBucket")) return "day_bucket";
    return "invalid_field";
  }
  const day = r.dayBucket as string;
  if (dayBucketDeltaDays(window.start, day) < 0 || dayBucketDeltaDays(day, window.end) < 0) return "outside_window";
  return null;
}

/* ------------------------------------------------------------------ *
 * Funnel event groupings (fixed by the contract, not by the data)
 * ------------------------------------------------------------------ */

/** Funnel step 3 — a specific game or market is examined. Reaching this is ACTIVATION. */
export const DETAIL_EVENTS: readonly EventType[] = ["game_report_open", "market_center_view", "market_row_opened", "probability_explainer_opened", "market_disagreement_opened"];
/** High-intent research behavior (contract §4: the step-4 events plus `market_row_opened`). */
export const RESEARCH_DEPTH_EVENTS: readonly EventType[] = ["market_row_opened", "probability_explainer_opened", "market_disagreement_opened"];
/** The trust loop: settled results + brief + methodology + status + the clarity pages. */
export const TRUST_LOOP_EVENTS: readonly EventType[] = ["results_recap_open", "daily_brief_view", "methodology_viewed", "status_viewed", "learn_trust_open"];
/** Events carrying a `sport` dimension that counts as engagement demand (contract §4). */
const SPORT_ENGAGEMENT_EVENTS: readonly EventType[] = ["daily_hub_view", "game_report_open", "market_row_opened"];

/* ------------------------------------------------------------------ *
 * Report shape
 * ------------------------------------------------------------------ */

export interface AdoptionWindow {
  start: string;
  end: string;
  /** Inclusive day count. */
  days: number;
  daysWithEvents: number;
  /** Days inside the window carrying zero accepted events — a coverage gap, not a zero-traffic claim. */
  missingDayBuckets: string[];
}

export interface AdoptionReport {
  /** The mode the DASHBOARD is running under (from the sink config), not what the file claims. */
  mode: MeasurementMode;
  /** The mode the capture says it was collected under; `null` when there is no capture. */
  collectedUnder: MeasurementMode | null;
  window: Measure<AdoptionWindow>;
  totals: { submitted: number; accepted: number; rejected: number };
  /** Per-type counts. A 0 here is a MEASURED zero: the window carried traffic and this event did not occur. */
  eventCounts: Measure<Record<EventType, number>>;
  reach: { sessions: Measure<number>; homepageViews: Measure<number>; todayViews: Measure<number> };
  activation: { detailEvents: Measure<number>; rate: Measure<number>; basis: string };
  researchDepth: { highIntentEvents: Measure<number>; rate: Measure<number>; basis: string };
  trustLoop: { touches: Measure<number>; byEvent: Measure<Record<string, number>>; perSession: Measure<number> };
  retention: { cohorts: Measure<Record<ReturnCohort, number>>; nextDayShare: Measure<number>; withinWeekShare: Measure<number>; basis: string };
  sportDemand: {
    interestBySport: Measure<Record<Sport, number>>;
    engagementBySport: Measure<Record<Sport, number>>;
    /** False until the window reaches the ≥ 4-week bar — the dashboard must not interpret it before then. */
    interpretable: boolean;
    minWindowDays: number;
  };
  dataQuality: { rejected: Measure<number>; byReason: Measure<Record<RejectionReason, number>>; missingDayBuckets: Measure<string[]>; coverage: Measure<number> };
  warnings: string[];
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

function zeroCounts<K extends string>(keys: readonly K[]): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const k of keys) out[k] = 0;
  return out;
}

function enumerateDays(start: string, end: string): string[] {
  const days: string[] = [];
  const span = dayBucketDeltaDays(start, end);
  const base = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i <= span; i += 1) days.push(new Date(base + i * 86_400_000).toISOString().slice(0, 10));
  return days;
}

/* ------------------------------------------------------------------ *
 * The aggregation
 * ------------------------------------------------------------------ */

/**
 * Reduce a capture to the adoption report. With no capture — or a capture whose window carried no valid
 * event — EVERY figure is `NOT_YET_MEASURED` with a reason; nothing is rendered as zero.
 *
 * @param input.capture parsed capture, or null when none exists yet (the current production state).
 * @param input.mode    the dashboard's own measurement mode (from the sink config).
 * @param input.captureError parse error to surface as the not-measured reason, when there was one.
 */
export function buildAdoptionReport(input: { capture: AdoptionCapture | null; mode: MeasurementMode; captureError?: string | null }): AdoptionReport {
  const { capture, mode } = input;

  if (!capture) {
    const reason = input.captureError ? `no usable event capture (${input.captureError})` : "no event capture exists — measurement has not been activated";
    return emptyReport(mode, null, reason, [
      mode === "off"
        ? "Measurement is OFF: no analytics endpoint is configured, so no adoption figure on this page is measured."
        : `Measurement mode is ${mode.toUpperCase()} but no capture has been ingested yet.`,
    ]);
  }

  const window = { start: capture.windowStart, end: capture.windowEnd };
  const accepted: AnalyticsEvent[] = [];
  const byReason = zeroCounts(REJECTION_REASONS);
  for (const raw of capture.events) {
    const reason = classifyRejection(raw, window);
    if (reason) byReason[reason] += 1;
    else accepted.push(raw as AnalyticsEvent);
  }
  const rejected = capture.events.length - accepted.length;

  const days = enumerateDays(capture.windowStart, capture.windowEnd);
  const seenDays = new Set(accepted.map((e) => e.dayBucket));
  const missingDayBuckets = days.filter((d) => !seenDays.has(d));
  const win: AdoptionWindow = { start: capture.windowStart, end: capture.windowEnd, days: days.length, daysWithEvents: seenDays.size, missingDayBuckets };

  const warnings: string[] = [];
  if (mode !== "live") warnings.push(`Measurement mode is ${mode.toUpperCase()} — these figures are not production adoption.`);
  if (capture.collectedUnder !== mode) warnings.push(`Capture was collected under ${capture.collectedUnder.toUpperCase()} but the dashboard is ${mode.toUpperCase()}.`);
  if (rejected > 0) warnings.push(`${rejected} event${rejected === 1 ? "" : "s"} failed contract validation and were excluded.`);
  if (missingDayBuckets.length > 0) warnings.push(`${missingDayBuckets.length} day${missingDayBuckets.length === 1 ? "" : "s"} in the window carry no events — a coverage gap, not measured zero traffic.`);
  if (win.days < MIN_SPORT_DEMAND_WINDOW_DAYS) warnings.push(`Window is ${win.days} day${win.days === 1 ? "" : "s"}; sport demand is NOT interpretable under ${MIN_SPORT_DEMAND_WINDOW_DAYS} days of live measurement.`);

  if (accepted.length === 0) {
    const report = emptyReport(mode, capture.collectedUnder, "the capture window carries no event that passes contract validation", warnings);
    // Data quality is genuinely known even when nothing was accepted — that IS the finding.
    report.window = measured(win);
    report.totals = { submitted: capture.events.length, accepted: 0, rejected };
    report.dataQuality = {
      rejected: measured(rejected),
      byReason: measured(byReason),
      missingDayBuckets: measured(missingDayBuckets),
      coverage: measured(0),
    };
    return report;
  }

  const counts = zeroCounts(EVENT_TYPES);
  const cohorts = zeroCounts(RETURN_COHORTS);
  const interestBySport = zeroCounts(SPORTS);
  const engagementBySport = zeroCounts(SPORTS);
  for (const e of accepted) {
    counts[e.event] += 1;
    if (e.event === "return_visit") cohorts[e.cohortBucket] += 1;
    if (e.event === "sport_interest_selected") interestBySport[e.sport] += 1;
    if (SPORT_ENGAGEMENT_EVENTS.includes(e.event)) engagementBySport[(e as { sport: Sport }).sport] += 1;
  }

  const sum = (types: readonly EventType[]): number => types.reduce((n, t) => n + counts[t], 0);
  const sessions = counts.source_visit;
  const detailEvents = sum(DETAIL_EVENTS);
  const highIntent = sum(RESEARCH_DEPTH_EVENTS);
  const trustTouches = sum(TRUST_LOOP_EVENTS);
  const returnVisits = counts.return_visit;

  /** A rate with a zero denominator is UNKNOWN, never 0%. */
  const rate = (numerator: number, denominator: number, denomLabel: string): Measure<number> =>
    denominator > 0 ? measured(round4(numerator / denominator)) : notYetMeasured(`no ${denomLabel} in the window — a rate with a zero denominator is unknown, not 0%`);

  const trustByEvent: Record<string, number> = {};
  for (const t of TRUST_LOOP_EVENTS) trustByEvent[t] = counts[t];

  return {
    mode,
    collectedUnder: capture.collectedUnder,
    window: measured(win),
    totals: { submitted: capture.events.length, accepted: accepted.length, rejected },
    eventCounts: measured(counts),
    reach: { sessions: measured(sessions), homepageViews: measured(counts.homepage_viewed), todayViews: measured(counts.daily_hub_view) },
    activation: {
      detailEvents: measured(detailEvents),
      rate: rate(detailEvents, sessions, "session_started (source_visit) events"),
      basis: "detail-event count ÷ session-start count — the contract carries no session identity, so this is an event-count ratio, not a per-visitor rate",
    },
    researchDepth: {
      highIntentEvents: measured(highIntent),
      rate: rate(highIntent, counts.daily_hub_view, "daily_hub_view events"),
      basis: "high-intent research events ÷ today-hub views (contract §4 research-depth read) — an event-count ratio",
    },
    trustLoop: {
      touches: measured(trustTouches),
      byEvent: measured(trustByEvent),
      perSession: rate(trustTouches, sessions, "session_started (source_visit) events"),
    },
    retention: {
      cohorts: measured(cohorts),
      nextDayShare: rate(cohorts.next_day, returnVisits, "return_visit events"),
      withinWeekShare: rate(cohorts.next_day + cohorts.within_week, returnVisits, "return_visit events"),
      basis: "share of coarse return-visit cohort buckets — day-granularity only; per-user session counts are not collected by design",
    },
    sportDemand: {
      interestBySport: measured(interestBySport),
      engagementBySport: measured(engagementBySport),
      interpretable: win.days >= MIN_SPORT_DEMAND_WINDOW_DAYS && mode === "live",
      minWindowDays: MIN_SPORT_DEMAND_WINDOW_DAYS,
    },
    dataQuality: {
      rejected: measured(rejected),
      byReason: measured(byReason),
      missingDayBuckets: measured(missingDayBuckets),
      coverage: measured(round4(seenDays.size / win.days)),
    },
    warnings,
  };
}

/** Every figure unmeasured, with ONE reason — the shape the dashboard renders while production stays dark. */
function emptyReport(mode: MeasurementMode, collectedUnder: MeasurementMode | null, reason: string, warnings: string[]): AdoptionReport {
  const n = notYetMeasured(reason);
  return {
    mode,
    collectedUnder,
    window: n,
    totals: { submitted: 0, accepted: 0, rejected: 0 },
    eventCounts: n,
    reach: { sessions: n, homepageViews: n, todayViews: n },
    activation: { detailEvents: n, rate: n, basis: "detail-event count ÷ session-start count — an event-count ratio, not a per-visitor rate" },
    researchDepth: { highIntentEvents: n, rate: n, basis: "high-intent research events ÷ today-hub views (contract §4) — an event-count ratio" },
    trustLoop: { touches: n, byEvent: n, perSession: n },
    retention: { cohorts: n, nextDayShare: n, withinWeekShare: n, basis: "share of coarse return-visit cohort buckets — day-granularity only" },
    sportDemand: { interestBySport: n, engagementBySport: n, interpretable: false, minWindowDays: MIN_SPORT_DEMAND_WINDOW_DAYS },
    dataQuality: { rejected: n, byReason: n, missingDayBuckets: n, coverage: n },
    warnings,
  };
}

/* ------------------------------------------------------------------ *
 * Rendering helpers (shared by the dashboard so the token is identical everywhere)
 * ------------------------------------------------------------------ */

/** Render a measure as a display string. Unmeasured ⇒ the single NOT YET MEASURED token, never "0". */
export function formatMeasure(m: Measure<number>, kind: "count" | "percent" = "count"): string {
  if (!isMeasured(m)) return NOT_YET_MEASURED;
  return kind === "percent" ? `${round4(m.value * 100).toFixed(1)}%` : String(m.value);
}
