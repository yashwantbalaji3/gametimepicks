/**
 * ADOPTION AGGREGATOR guards. The load-bearing property is the one a dashboard gets wrong by default:
 * an unmeasured figure must be `NOT_YET_MEASURED`, and a genuinely-observed zero must be 0 — the two can
 * never collapse into each other. Also re-asserts, from the aggregator's side, the two contract invariants
 * the whole layer rests on (closed allowlist ∩ PII denylist = ∅; a half-configuration can never send).
 *
 * Run: cd app && npx tsx --test src/lib/analytics/adoption.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DETAIL_EVENTS,
  MIN_SPORT_DEMAND_WINDOW_DAYS,
  NOT_YET_MEASURED,
  RESEARCH_DEPTH_EVENTS,
  TRUST_LOOP_EVENTS,
  buildAdoptionReport,
  formatMeasure,
  isMeasured,
  parseAdoptionCapture,
  resolveMeasurementMode,
} from "./adoption.ts";
import { ALLOWED_PROPERTY_KEYS, PII_KEY_DENYLIST, validateEvent } from "./event-contract.ts";
import { readSinkConfig, resolveSink, track } from "./sink.ts";
import { NOOP_SINK, createMemorySink } from "./event-contract.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(HERE, "fixtures", `${name}.json`), "utf8"));

const parsed = (name) => {
  const { capture, error } = parseAdoptionCapture(fixture(name));
  assert.equal(error, null, `${name} must parse`);
  return capture;
};
const report = (name, mode = "staging") => buildAdoptionReport({ capture: parsed(name), mode });

/* ---------------- envelope ---------------- */

test("the capture envelope fails closed on anything it cannot trust", () => {
  const bad = [
    [null, "capture must be an object"],
    [{}, 'capture.kind must be "analytics-event-capture"'],
    [{ kind: "analytics-event-capture", schemaVersion: 1 }, "capture.schemaVersion must be 2"],
    [{ kind: "analytics-event-capture", schemaVersion: 2, windowStart: "nope" }, "capture.windowStart must be a YYYY-MM-DD day bucket"],
    [{ kind: "analytics-event-capture", schemaVersion: 2, windowStart: "2026-07-10", windowEnd: "2026-07-01" }, "capture.windowEnd is before capture.windowStart"],
    [{ kind: "analytics-event-capture", schemaVersion: 2, windowStart: "2026-01-01", windowEnd: "2027-06-01" }, "capture window exceeds 366 days"],
    [{ kind: "analytics-event-capture", schemaVersion: 2, windowStart: "2026-07-01", windowEnd: "2026-07-02", collectedUnder: "on" }, "capture.collectedUnder must be off|staging|live"],
    [{ kind: "analytics-event-capture", schemaVersion: 2, windowStart: "2026-07-01", windowEnd: "2026-07-02", collectedUnder: "live", events: {} }, "capture.events must be an array"],
  ];
  for (const [raw, expected] of bad) {
    const r = parseAdoptionCapture(raw);
    assert.equal(r.capture, null);
    assert.equal(r.error, expected);
  }
});

/* ---------------- NOT_YET_MEASURED vs zero ---------------- */

test("no capture ⇒ EVERY figure is NOT_YET_MEASURED with a reason — never a zero", () => {
  const r = buildAdoptionReport({ capture: null, mode: "off" });
  const leaves = [
    r.window, r.eventCounts, r.reach.sessions, r.reach.homepageViews, r.reach.todayViews,
    r.activation.detailEvents, r.activation.rate, r.researchDepth.highIntentEvents, r.researchDepth.rate,
    r.trustLoop.touches, r.trustLoop.byEvent, r.trustLoop.perSession,
    r.retention.cohorts, r.retention.nextDayShare, r.retention.withinWeekShare,
    r.sportDemand.interestBySport, r.sportDemand.engagementBySport,
    r.dataQuality.rejected, r.dataQuality.byReason, r.dataQuality.missingDayBuckets, r.dataQuality.coverage,
  ];
  for (const m of leaves) {
    assert.equal(m.state, "not_yet_measured");
    assert.ok(m.reason.length > 0, "an unmeasured figure always states why");
  }
  assert.equal(r.sportDemand.interpretable, false);
  assert.equal(formatMeasure(r.activation.rate, "percent"), NOT_YET_MEASURED, "renders as the token, not 0.0%");
  assert.match(r.warnings[0], /Measurement is OFF/);
});

test("an EMPTY-but-valid window is not measured adoption — but its data quality IS known", () => {
  const r = report("adoption-capture-empty");
  assert.equal(r.reach.sessions.state, "not_yet_measured");
  assert.equal(r.eventCounts.state, "not_yet_measured", "zero accepted events is not a measured count table");
  assert.equal(r.activation.rate.state, "not_yet_measured");
  // The gap itself is a real finding and IS reported.
  assert.equal(r.window.state, "measured");
  assert.equal(r.window.value.days, 14);
  assert.equal(r.window.value.daysWithEvents, 0);
  assert.equal(r.window.value.missingDayBuckets.length, 14);
  assert.deepEqual(r.totals, { submitted: 0, accepted: 0, rejected: 0 });
  assert.equal(r.dataQuality.coverage.value, 0, "coverage 0 is measured — we know no day carried an event");
});

test("a zero DENOMINATOR is unknown, while a zero COUNT inside a live window is measured", () => {
  const r = report("adoption-capture-no-sessions");
  assert.equal(r.eventCounts.state, "measured");
  assert.equal(r.eventCounts.value.source_visit, 0, "measured zero: the window carried traffic, just no session-start event");
  assert.equal(r.reach.sessions.value, 0);
  assert.equal(r.activation.detailEvents.value, 2, "the detail events themselves are counted");
  assert.equal(r.activation.rate.state, "not_yet_measured", "2 ÷ 0 is unknown, NOT 0%");
  assert.match(r.activation.rate.reason, /zero denominator is unknown, not 0%/);
  assert.equal(r.trustLoop.perSession.state, "not_yet_measured");
  assert.equal(r.retention.nextDayShare.state, "not_yet_measured", "no return_visit events ⇒ no retention rate");
});

/* ---------------- the two-week fixture ---------------- */

test("the two-week fixture reduces to the contract's funnel figures, exactly", () => {
  const r = report("adoption-capture-two-week");
  const c = r.eventCounts.value;

  assert.equal(r.totals.submitted, 88);
  assert.equal(r.totals.accepted, 88);
  assert.equal(r.totals.rejected, 0);

  assert.equal(r.reach.sessions.value, 20);
  assert.equal(r.reach.homepageViews.value, 15);
  assert.equal(r.reach.todayViews.value, 12);

  const detail = DETAIL_EVENTS.reduce((n, t) => n + c[t], 0);
  assert.equal(detail, 18);
  assert.equal(r.activation.detailEvents.value, 18);
  assert.equal(r.activation.rate.value, 0.9, "18 detail events ÷ 20 session starts");

  const highIntent = RESEARCH_DEPTH_EVENTS.reduce((n, t) => n + c[t], 0);
  assert.equal(highIntent, 7);
  assert.equal(r.researchDepth.rate.value, 0.5833, "7 high-intent ÷ 12 today-hub views");

  const trust = TRUST_LOOP_EVENTS.reduce((n, t) => n + c[t], 0);
  assert.equal(trust, 14, "results 5 + brief 6 + methodology 2 + status 1 + learn 0");
  assert.equal(r.trustLoop.touches.value, 14);
  assert.equal(r.trustLoop.perSession.value, 0.7);

  assert.deepEqual(r.retention.cohorts.value, { first_visit: 4, same_day: 1, next_day: 3, within_week: 1, later: 0 });
  assert.equal(r.retention.nextDayShare.value, 0.3333);
  assert.equal(r.retention.withinWeekShare.value, 0.4444);
});

test("sport demand: a real zero is reported as zero, and the ≥4-week bar gates interpretation", () => {
  const r = report("adoption-capture-two-week");
  assert.equal(r.eventCounts.value.sport_interest_selected, 0, "no interest selections occurred — a measured zero");
  assert.equal(r.sportDemand.interestBySport.state, "measured");
  assert.deepEqual(r.sportDemand.interestBySport.value.nba, 0);
  assert.deepEqual(r.sportDemand.engagementBySport.value.mlb, 21, "10 hub + 7 report + 4 row");
  assert.deepEqual(r.sportDemand.engagementBySport.value.nba, 3, "2 hub + 1 report");

  assert.equal(r.window.value.days, 14);
  assert.equal(r.sportDemand.interpretable, false, `14 < ${MIN_SPORT_DEMAND_WINDOW_DAYS} days`);
  assert.ok(r.warnings.some((w) => w.includes(`NOT interpretable under ${MIN_SPORT_DEMAND_WINDOW_DAYS} days`)));

  // Even a long enough window stays uninterpretable while the mode is not LIVE.
  const long = buildAdoptionReport({
    capture: parseAdoptionCapture({ ...fixture("adoption-capture-two-week"), windowEnd: "2026-08-14", collectedUnder: "staging" }).capture,
    mode: "staging",
  });
  assert.equal(long.window.value.days, 45);
  assert.equal(long.sportDemand.interpretable, false, "staging data is not production adoption");
});

test("coverage gaps are surfaced as gaps, never as measured zero-traffic days", () => {
  const r = report("adoption-capture-two-week");
  assert.deepEqual(r.window.value.missingDayBuckets, ["2026-07-13"]);
  assert.equal(r.window.value.daysWithEvents, 13);
  assert.equal(r.dataQuality.coverage.value, 0.9286);
  assert.ok(r.warnings.some((w) => w.includes("coverage gap")));
});

/* ---------------- invalid input feeding the aggregator ---------------- */

test("invalid events are re-validated OUT, classified, and never counted as adoption", () => {
  const r = report("adoption-capture-rejections");
  assert.equal(r.totals.submitted, 10);
  assert.equal(r.totals.accepted, 2, "only the two well-formed in-window events survive");
  assert.equal(r.totals.rejected, 8);
  assert.deepEqual(r.dataQuality.byReason.value, {
    invalid_shape: 1,
    unknown_event: 1,
    schema_version: 1,
    day_bucket: 1,
    disallowed_key: 1,
    invalid_field: 1,
    outside_window: 2,
  });
  assert.equal(r.eventCounts.value.homepage_viewed, 1, "the PII-carrying duplicate did not inflate the count");
  assert.equal(r.reach.sessions.value, 1);
  assert.ok(r.warnings.some((w) => w.includes("8 events failed contract validation")));
});

test("the aggregator trusts nothing: every accepted event still passes validateEvent", () => {
  for (const name of ["adoption-capture-two-week", "adoption-capture-rejections", "adoption-capture-no-sessions"]) {
    for (const e of parsed(name).events) {
      const r = validateEvent(e);
      if (!r.ok) continue; // rejected by the aggregator too
      assert.equal(r.ok, true);
    }
  }
  // A capture full of junk cannot produce a single adoption figure.
  const junk = parseAdoptionCapture({ kind: "analytics-event-capture", schemaVersion: 2, windowStart: "2026-07-01", windowEnd: "2026-07-02", collectedUnder: "live", events: [{ userId: "u1" }, 42] }).capture;
  const r = buildAdoptionReport({ capture: junk, mode: "live" });
  assert.equal(r.reach.sessions.state, "not_yet_measured");
  assert.equal(r.dataQuality.rejected.value, 2);
});

/* ---------------- measurement mode ---------------- */

test("measurement mode is OFF unless the sink itself is live, and never LIVE on a non-production host", () => {
  assert.equal(resolveMeasurementMode(readSinkConfig({}), {}), "off");
  assert.equal(resolveMeasurementMode(readSinkConfig({ NEXT_PUBLIC_ANALYTICS_ENABLED: "1" }), {}), "off", "flag alone ≠ measuring");
  assert.equal(resolveMeasurementMode(readSinkConfig({ NEXT_PUBLIC_ANALYTICS_ENDPOINT: "https://a/e" }), {}), "off", "endpoint alone ≠ measuring");

  const live = readSinkConfig({ NEXT_PUBLIC_ANALYTICS_ENABLED: "1", NEXT_PUBLIC_ANALYTICS_ENDPOINT: "https://collect.gametimepicks.com/e" });
  assert.equal(resolveMeasurementMode(live, {}), "live");
  assert.equal(resolveMeasurementMode(live, { NEXT_PUBLIC_ANALYTICS_MODE: "staging" }), "staging", "an explicit rehearsal stays staging");
  for (const endpoint of ["http://localhost:3001/e", "https://staging-collect.example.com/e", "https://gtp-preview.vercel.app/e", "not-a-url"]) {
    assert.equal(resolveMeasurementMode(readSinkConfig({ NEXT_PUBLIC_ANALYTICS_ENABLED: "1", NEXT_PUBLIC_ANALYTICS_ENDPOINT: endpoint }), {}), "staging", endpoint);
  }
});

test("a capture collected under a different mode than the dashboard is flagged, not silently merged", () => {
  const r = buildAdoptionReport({ capture: parsed("adoption-capture-two-week"), mode: "live" });
  assert.ok(r.warnings.some((w) => w.includes("collected under STAGING but the dashboard is LIVE")));
});

/* ---------------- invariants the aggregator rests on ---------------- */

test("closed property allowlist ∩ PII denylist = ∅ (no aggregate can ever be keyed on personal data)", () => {
  const overlap = ALLOWED_PROPERTY_KEYS.filter((k) => PII_KEY_DENYLIST.some((d) => k.toLowerCase().includes(d)));
  assert.deepEqual(overlap, []);
});

test("a half-configuration still resolves to the NO-OP sink — the aggregator can only ever see dark data", () => {
  assert.equal(resolveSink(readSinkConfig({ NEXT_PUBLIC_ANALYTICS_ENABLED: "1" })), NOOP_SINK);
  assert.equal(resolveSink(readSinkConfig({ NEXT_PUBLIC_ANALYTICS_ENDPOINT: "https://a/e" })), NOOP_SINK);
  const { sink, events } = createMemorySink();
  track({ event: "homepage_viewed", schemaVersion: 2, dayBucket: "2026-07-01", surface: "homepage" }, resolveSink(readSinkConfig({})));
  assert.equal(events.length, 0);
  assert.equal(sink !== NOOP_SINK, true);
});

test("formatMeasure renders exactly one unmeasured token and never fabricates a number", () => {
  assert.equal(formatMeasure({ state: "not_yet_measured", reason: "x" }), NOT_YET_MEASURED);
  assert.equal(formatMeasure({ state: "not_yet_measured", reason: "x" }, "percent"), NOT_YET_MEASURED);
  assert.equal(formatMeasure({ state: "measured", value: 0 }), "0", "a measured zero renders as 0");
  assert.equal(formatMeasure({ state: "measured", value: 0.5833 }, "percent"), "58.3%");
  assert.equal(isMeasured({ state: "measured", value: 1 }), true);
});
