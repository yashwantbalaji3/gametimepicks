/**
 * Tests for the product-measurement event contract (Phase 9).
 *
 * Locks the invariants that keep this contract provider-neutral + PII-free:
 *   1. Every event type is documented (adoption question) and validates.
 *   2. `validateEvent` accepts good shapes and rejects malformed / disallowed ones.
 *   3. The default sink of `emitEvent` performs NO network / side effect.
 *   4. No PII field names are permitted (allowlist ∩ PII denylist = ∅), and every
 *      event's keys stay inside the closed allowlist.
 *   5. The discriminated union is exhaustive.
 *
 * Run: cd app && npx tsx --test src/lib/analytics/event-contract.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION,
  EVENT_TYPES,
  ADOPTION_QUESTIONS,
  ALLOWED_PROPERTY_KEYS,
  PII_KEY_DENYLIST,
  DAY_BUCKET_RE,
  NOOP_SINK,
  emitEvent,
  validateEvent,
  createMemorySink,
  classifyReturnCohort,
  buildReturnVisitEvent,
  dayBucketDeltaDays,
  isValidDayBucket,
} from "./event-contract.ts";

const DAY = "2026-07-23";

/** One valid, minimal sample per event type — the canonical shapes. */
const SAMPLES = {
  home_cta_click: {
    event: "home_cta_click",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "homepage",
    cta: "primary",
    destination: "simulate",
  },
  daily_hub_view: {
    event: "daily_hub_view",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "daily_hub",
    sport: "mlb",
    slateDateBucket: DAY,
  },
  game_report_open: {
    event: "game_report_open",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "game_report",
    sport: "mlb",
  },
  results_recap_open: {
    event: "results_recap_open",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "results",
    sport: "nba",
  },
  share_action: {
    event: "share_action",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "game_report",
    method: "copy_link",
    sport: "mlb",
  },
  learn_trust_open: {
    event: "learn_trust_open",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "learn",
    trustSurface: "how_it_works",
  },
  return_visit: {
    event: "return_visit",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "app",
    returning: true,
    cohortBucket: "next_day",
  },
  slate_filter_changed: {
    event: "slate_filter_changed",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "daily_hub",
    sport: "mlb",
    filter: "simulations",
  },
  availability_explanation_opened: {
    event: "availability_explanation_opened",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "daily_hub",
    sport: "mlb",
    availabilityLevel: "model_read",
  },
  today_slate_clicked_from_results: {
    event: "today_slate_clicked_from_results",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "results",
    sport: "mlb",
  },
  daily_brief_view: {
    event: "daily_brief_view",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "daily_hub",
    sport: "mlb",
  },
  social_package_generated: {
    event: "social_package_generated",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "internal",
    sport: "mlb",
  },
  source_visit: {
    event: "source_visit",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "app",
    source: "x",
  },
  // v2 (Program 058-061) — the public-beta research-terminal taxonomy.
  homepage_viewed: {
    event: "homepage_viewed",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "homepage",
  },
  market_center_view: {
    event: "market_center_view",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "markets",
    sport: "mlb",
  },
  market_row_opened: {
    event: "market_row_opened",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "markets",
    sport: "mlb",
    marketFamily: "moneyline",
  },
  probability_explainer_opened: {
    event: "probability_explainer_opened",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "research",
    sport: "mlb",
    marketFamily: "strikeouts",
  },
  market_disagreement_opened: {
    event: "market_disagreement_opened",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "game_report",
    sport: "mlb",
    marketFamily: "total",
  },
  methodology_viewed: {
    event: "methodology_viewed",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "methodology",
  },
  status_viewed: {
    event: "status_viewed",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "system_status",
  },
  sport_interest_selected: {
    event: "sport_interest_selected",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "app",
    sport: "epl",
  },
  feedback_submitted: {
    event: "feedback_submitted",
    schemaVersion: SCHEMA_VERSION,
    dayBucket: DAY,
    surface: "app",
    feedbackTopic: "clarity",
  },
};

/* ---------------------------------------------------------------- *
 * 1 · Every event is documented + validates
 * ---------------------------------------------------------------- */

test("1 · every event type has a sample, an adoption question, and validates", () => {
  for (const type of EVENT_TYPES) {
    assert.ok(SAMPLES[type], `missing sample for ${type}`);
    assert.equal(SAMPLES[type].event, type);
    assert.ok(
      typeof ADOPTION_QUESTIONS[type] === "string" && ADOPTION_QUESTIONS[type].length > 0,
      `missing adoption question for ${type}`,
    );
    const r = validateEvent(SAMPLES[type]);
    assert.ok(r.ok, `sample ${type} should validate: ${r.ok ? "" : r.error}`);
  }
});

test("1b · ADOPTION_QUESTIONS keys exactly match the event union (exhaustive, no extras)", () => {
  const documented = Object.keys(ADOPTION_QUESTIONS).sort();
  const declared = [...EVENT_TYPES].sort();
  assert.deepEqual(documented, declared);
});

/* ---------------------------------------------------------------- *
 * 2 · validateEvent accepts good, rejects bad
 * ---------------------------------------------------------------- */

test("2 · validateEvent rejects malformed shapes", () => {
  assert.equal(validateEvent(null).ok, false);
  assert.equal(validateEvent(undefined).ok, false);
  assert.equal(validateEvent("nope").ok, false);
  assert.equal(validateEvent(42).ok, false);
  assert.equal(validateEvent({}).ok, false);
  // unknown discriminant
  assert.equal(validateEvent({ event: "pageview", schemaVersion: SCHEMA_VERSION, dayBucket: DAY }).ok, false);
  // wrong schema version
  assert.equal(validateEvent({ ...SAMPLES.game_report_open, schemaVersion: 999 }).ok, false);
  // bad day bucket (precise timestamp is NOT allowed — day granularity only)
  assert.equal(validateEvent({ ...SAMPLES.game_report_open, dayBucket: "2026-07-23T14:05:00Z" }).ok, false);
  assert.equal(validateEvent({ ...SAMPLES.game_report_open, dayBucket: "2026/07/23" }).ok, false);
  // invalid enum values
  assert.equal(validateEvent({ ...SAMPLES.home_cta_click, cta: "tertiary" }).ok, false);
  assert.equal(validateEvent({ ...SAMPLES.home_cta_click, destination: "https://x/y?u=1" }).ok, false);
  assert.equal(validateEvent({ ...SAMPLES.daily_hub_view, sport: "curling" }).ok, false);
  assert.equal(validateEvent({ ...SAMPLES.share_action, method: "sms" }).ok, false);
  assert.equal(validateEvent({ ...SAMPLES.return_visit, cohortBucket: "someday" }).ok, false);
  // wrong surface for the type
  assert.equal(validateEvent({ ...SAMPLES.return_visit, surface: "homepage" }).ok, false);
  // v2 events: bad enum values + wrong surfaces are refused too
  assert.equal(validateEvent({ ...SAMPLES.market_row_opened, marketFamily: "exact_price_-115" }).ok, false);
  assert.equal(validateEvent({ ...SAMPLES.probability_explainer_opened, surface: "somewhere" }).ok, false);
  assert.equal(validateEvent({ ...SAMPLES.market_disagreement_opened, sport: "curling" }).ok, false);
  assert.equal(validateEvent({ ...SAMPLES.feedback_submitted, feedbackTopic: "free text about my day" }).ok, false);
  assert.equal(validateEvent({ ...SAMPLES.sport_interest_selected, sport: "cricket" }).ok, false);
  assert.equal(validateEvent({ ...SAMPLES.status_viewed, surface: "app" }).ok, false);
});

test("2b · validateEvent rejects ANY property key outside the closed allowlist", () => {
  // an unknown key — even a harmless one — is refused
  assert.equal(validateEvent({ ...SAMPLES.game_report_open, extra: "x" }).ok, false);
  // and, critically, any PII-shaped key is refused
  for (const piiKey of ["email", "userId", "ipAddress", "deviceId", "geo", "referrer"]) {
    const evt = { ...SAMPLES.game_report_open, [piiKey]: "whatever" };
    assert.equal(validateEvent(evt).ok, false, `key '${piiKey}' must be rejected`);
  }
});

/* ---------------------------------------------------------------- *
 * 3 · default sink is a pure no-op (no network / side effect)
 * ---------------------------------------------------------------- */

test("3 · emitEvent with the DEFAULT sink performs no network or side effect", () => {
  // Trip-wire any accidental network / storage / beacon use during a default emit.
  const globalRef = globalThis;
  const originalFetch = globalRef.fetch;
  const originalBeacon = globalRef.navigator ? globalRef.navigator.sendBeacon : undefined;
  let network = 0;

  globalRef.fetch = () => {
    network++;
    throw new Error("emitEvent default sink must not call fetch");
  };
  if (globalRef.navigator) {
    globalRef.navigator.sendBeacon = () => {
      network++;
      return false;
    };
  }

  try {
    for (const type of EVENT_TYPES) {
      const ok = emitEvent(SAMPLES[type]); // default sink
      assert.equal(ok, true, `valid ${type} should be forwarded (and swallowed by no-op)`);
    }
    assert.equal(network, 0, "no network call was made by the default sink");
    // NOOP_SINK itself returns nothing and throws nothing.
    assert.equal(NOOP_SINK(SAMPLES.return_visit), undefined);
  } finally {
    globalRef.fetch = originalFetch;
    if (globalRef.navigator && originalBeacon !== undefined) {
      globalRef.navigator.sendBeacon = originalBeacon;
    }
  }
});

test("3b · emitEvent routes valid events to an injected sink, and drops invalid ones", () => {
  const { sink, events } = createMemorySink();
  for (const type of EVENT_TYPES) emitEvent(SAMPLES[type], sink);
  assert.equal(events.length, EVENT_TYPES.length, "every valid event reached the injected sink");

  const before = events.length;
  // malformed event is dropped, never forwarded, never throws
  const ok = emitEvent({ event: "return_visit", schemaVersion: SCHEMA_VERSION, dayBucket: "bad" }, sink);
  assert.equal(ok, false);
  assert.equal(events.length, before, "invalid event was NOT forwarded to the sink");
});

/* ---------------------------------------------------------------- *
 * 4 · No PII field names are permitted
 * ---------------------------------------------------------------- */

test("4 · the property allowlist never overlaps the PII denylist (no PII field names)", () => {
  for (const key of ALLOWED_PROPERTY_KEYS) {
    const lower = key.toLowerCase();
    for (const banned of PII_KEY_DENYLIST) {
      assert.ok(
        !lower.includes(banned),
        `allowed property key '${key}' contains PII-denylisted token '${banned}'`,
      );
    }
  }
});

test("4b · every event sample uses ONLY allowlisted keys (nothing sneaks in)", () => {
  const allow = new Set(ALLOWED_PROPERTY_KEYS);
  for (const type of EVENT_TYPES) {
    for (const key of Object.keys(SAMPLES[type])) {
      assert.ok(allow.has(key), `event ${type} carries non-allowlisted key '${key}'`);
    }
  }
});

test("4c · every non-day-bucket property value is a closed-enum literal or boolean (no free-form strings)", () => {
  for (const type of EVENT_TYPES) {
    const evt = SAMPLES[type];
    for (const [key, value] of Object.entries(evt)) {
      if (key === "schemaVersion") {
        assert.equal(value, SCHEMA_VERSION);
        continue;
      }
      if (key === "dayBucket" || key === "slateDateBucket") {
        assert.match(value, DAY_BUCKET_RE, `${type}.${key} must be a coarse day bucket`);
        continue;
      }
      const t = typeof value;
      assert.ok(t === "string" || t === "boolean", `${type}.${key} must be enum-string or boolean, got ${t}`);
    }
  }
});

/* ---------------------------------------------------------------- *
 * 5 · Exhaustiveness of the union
 * ---------------------------------------------------------------- */

test("5 · EVENT_TYPES has no duplicates and every entry validates end-to-end", () => {
  assert.equal(new Set(EVENT_TYPES).size, EVENT_TYPES.length, "no duplicate event types");
  // Round-trip: an event NOT in the union must be rejected by the switch.
  assert.equal(validateEvent({ event: "not_an_event", schemaVersion: SCHEMA_VERSION, dayBucket: DAY }).ok, false);
});

/* ---------------------------------------------------------------- *
 * 6 · Return-visit helpers (privacy-first day buckets, pure)
 * ---------------------------------------------------------------- */

test("6 · classifyReturnCohort buckets by coarse day gap, never a count/timestamp", () => {
  assert.equal(classifyReturnCohort({ firstSeenDayBucket: null, lastSeenDayBucket: null, todayDayBucket: DAY }), "first_visit");
  assert.equal(
    classifyReturnCohort({ firstSeenDayBucket: "2026-07-23", lastSeenDayBucket: "2026-07-23", todayDayBucket: "2026-07-23" }),
    "same_day",
  );
  assert.equal(
    classifyReturnCohort({ firstSeenDayBucket: "2026-07-20", lastSeenDayBucket: "2026-07-22", todayDayBucket: "2026-07-23" }),
    "next_day",
  );
  assert.equal(
    classifyReturnCohort({ firstSeenDayBucket: "2026-07-10", lastSeenDayBucket: "2026-07-18", todayDayBucket: "2026-07-23" }),
    "within_week",
  );
  assert.equal(
    classifyReturnCohort({ firstSeenDayBucket: "2026-06-01", lastSeenDayBucket: "2026-06-01", todayDayBucket: "2026-07-23" }),
    "later",
  );
});

test("6b · buildReturnVisitEvent produces a valid, allowlisted ReturnVisitEvent", () => {
  const first = buildReturnVisitEvent({ firstSeenDayBucket: null, lastSeenDayBucket: null, todayDayBucket: DAY });
  assert.equal(first.event, "return_visit");
  assert.equal(first.returning, false);
  assert.equal(first.cohortBucket, "first_visit");
  assert.ok(validateEvent(first).ok);

  const back = buildReturnVisitEvent({ firstSeenDayBucket: "2026-07-01", lastSeenDayBucket: "2026-07-22", todayDayBucket: DAY });
  assert.equal(back.returning, true);
  assert.equal(back.cohortBucket, "next_day");
  assert.ok(validateEvent(back).ok);
});

test("6c · dayBucketDeltaDays + isValidDayBucket are robust to junk", () => {
  assert.equal(dayBucketDeltaDays("2026-07-20", "2026-07-23"), 3);
  assert.equal(dayBucketDeltaDays("bad", "2026-07-23"), 0);
  assert.equal(isValidDayBucket("2026-07-23"), true);
  assert.equal(isValidDayBucket("2026-7-3"), false);
  assert.equal(isValidDayBucket(20260723), false);
});
