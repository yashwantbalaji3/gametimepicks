/**
 * Contract v2 guards (Program 058-061, public beta).
 *
 * Locks what v2 added on top of the v1 invariants (which event-contract.test.mjs
 * still enforces):
 *   1. The schema version was bumped to 2 (new events + `marketFamily` /
 *      `feedbackTopic` property keys = a wire-shape change).
 *   2. The program taxonomy is fully mapped — every program name resolves to a
 *      declared contract event, and the v1 aliases are exactly the documented ones.
 *   3. Every v2 event validates, and rejects PII keys / open strings like any other.
 *   4. NOOP mode is intact: with the env unset nothing resolves past the no-op sink.
 *   5. No sensitive market/money fields can ride along — the allowlist carries no
 *      odds/price/line/stake-shaped key, and feedback has no free-text channel.
 *
 * Run: cd app && npx tsx --test src/lib/analytics/contract-v2.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION,
  EVENT_TYPES,
  PROGRAM_EVENT_NAMES,
  PROGRAM_EVENT_MAP,
  ALLOWED_PROPERTY_KEYS,
  PII_KEY_DENYLIST,
  MARKET_FAMILIES,
  FEEDBACK_TOPICS,
  MARKET_RESEARCH_SURFACES,
  validateEvent,
  createMemorySink,
  NOOP_SINK,
} from "./event-contract.ts";
import { readSinkConfig, resolveSink, track } from "./sink.ts";

const DAY = "2026-07-29";

/** The nine events v2 added (everything else in EVENT_TYPES predates the program). */
const V2_EVENT_TYPES = [
  "homepage_viewed",
  "market_center_view",
  "market_row_opened",
  "probability_explainer_opened",
  "market_disagreement_opened",
  "methodology_viewed",
  "status_viewed",
  "sport_interest_selected",
  "feedback_submitted",
];

const V2_SAMPLES = {
  homepage_viewed: { event: "homepage_viewed", schemaVersion: SCHEMA_VERSION, dayBucket: DAY, surface: "homepage" },
  market_center_view: { event: "market_center_view", schemaVersion: SCHEMA_VERSION, dayBucket: DAY, surface: "markets", sport: "mlb" },
  market_row_opened: { event: "market_row_opened", schemaVersion: SCHEMA_VERSION, dayBucket: DAY, surface: "markets", sport: "mlb", marketFamily: "run_line" },
  probability_explainer_opened: { event: "probability_explainer_opened", schemaVersion: SCHEMA_VERSION, dayBucket: DAY, surface: "research", sport: "mlb", marketFamily: "hits" },
  market_disagreement_opened: { event: "market_disagreement_opened", schemaVersion: SCHEMA_VERSION, dayBucket: DAY, surface: "game_report", sport: "mlb", marketFamily: "total" },
  methodology_viewed: { event: "methodology_viewed", schemaVersion: SCHEMA_VERSION, dayBucket: DAY, surface: "methodology" },
  status_viewed: { event: "status_viewed", schemaVersion: SCHEMA_VERSION, dayBucket: DAY, surface: "system_status" },
  sport_interest_selected: { event: "sport_interest_selected", schemaVersion: SCHEMA_VERSION, dayBucket: DAY, surface: "app", sport: "nba" },
  feedback_submitted: { event: "feedback_submitted", schemaVersion: SCHEMA_VERSION, dayBucket: DAY, surface: "app", feedbackTopic: "accuracy" },
};

/* ---------------------------------------------------------------- *
 * 1 · Schema version bump
 * ---------------------------------------------------------------- */

test("1 · SCHEMA_VERSION is 2 (the v2 taxonomy is a wire-shape change), and v1-stamped events are rejected", () => {
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(validateEvent({ ...V2_SAMPLES.homepage_viewed, schemaVersion: 1 }).ok, false);
});

/* ---------------------------------------------------------------- *
 * 2 · Program taxonomy is fully mapped
 * ---------------------------------------------------------------- */

test("2 · every program name maps to a declared contract event (exhaustive, no extras)", () => {
  assert.deepEqual(Object.keys(PROGRAM_EVENT_MAP).sort(), [...PROGRAM_EVENT_NAMES].sort());
  const declared = new Set(EVENT_TYPES);
  for (const [program, eventType] of Object.entries(PROGRAM_EVENT_MAP)) {
    assert.ok(declared.has(eventType), `program name '${program}' maps to undeclared event '${eventType}'`);
  }
});

test("2b · the v1 aliases are exactly the documented ones (mapped, never renamed)", () => {
  assert.equal(PROGRAM_EVENT_MAP.session_started, "source_visit");
  assert.equal(PROGRAM_EVENT_MAP.today_viewed, "daily_hub_view");
  assert.equal(PROGRAM_EVENT_MAP.game_report_viewed, "game_report_open");
  assert.equal(PROGRAM_EVENT_MAP.results_viewed, "results_recap_open");
  assert.equal(PROGRAM_EVENT_MAP.daily_brief_viewed, "daily_brief_view");
  assert.equal(PROGRAM_EVENT_MAP.return_visit, "return_visit");
  // and every genuinely-new program event maps to itself
  for (const t of V2_EVENT_TYPES) {
    if (t === "market_center_view") continue; // supplemental page-view, not a program name
    assert.equal(PROGRAM_EVENT_MAP[t], t, `${t} should be a v2-native event`);
  }
});

/* ---------------------------------------------------------------- *
 * 3 · Every v2 event validates + stays closed
 * ---------------------------------------------------------------- */

test("3 · every v2 event is declared, validates, and rejects PII/unknown keys", () => {
  const declared = new Set(EVENT_TYPES);
  for (const t of V2_EVENT_TYPES) {
    assert.ok(declared.has(t), `v2 event '${t}' missing from EVENT_TYPES`);
    const r = validateEvent(V2_SAMPLES[t]);
    assert.ok(r.ok, `sample ${t} should validate: ${r.ok ? "" : r.error}`);
    for (const bad of ["email", "userId", "referrer", "sessionId", "comment"]) {
      assert.equal(validateEvent({ ...V2_SAMPLES[t], [bad]: "x" }).ok, false, `${t} must reject key '${bad}'`);
    }
  }
});

test("3b · the v2 dimensions are closed family/topic/surface buckets, never open values", () => {
  for (const v of [...MARKET_FAMILIES, ...FEEDBACK_TOPICS, ...MARKET_RESEARCH_SURFACES]) {
    assert.match(v, /^[a-z_]+$/, `enum value '${v}' must be a snake_case bucket, never a number/price/free string`);
  }
  // a specific line or price can never pass as a market family
  assert.equal(validateEvent({ ...V2_SAMPLES.market_row_opened, marketFamily: "over_8.5_-115" }).ok, false);
  // feedback has no free-text channel — topic is the ONLY dimension
  assert.equal(validateEvent({ ...V2_SAMPLES.feedback_submitted, feedbackTopic: "the model was wrong today" }).ok, false);
  assert.equal(validateEvent({ ...V2_SAMPLES.feedback_submitted, text: "free text" }).ok, false);
});

/* ---------------------------------------------------------------- *
 * 4 · NOOP mode intact (env unset ⇒ dark)
 * ---------------------------------------------------------------- */

test("4 · with the env unset, the resolved sink is the NO-OP and v2 events go nowhere", () => {
  const cfg = readSinkConfig({});
  assert.deepEqual(cfg, { enabled: false, endpoint: null });
  assert.equal(resolveSink(cfg), NOOP_SINK);

  const globalRef = globalThis;
  const originalFetch = globalRef.fetch;
  let network = 0;
  globalRef.fetch = () => {
    network++;
    throw new Error("dark mode must not call fetch");
  };
  try {
    for (const t of V2_EVENT_TYPES) {
      assert.equal(track(V2_SAMPLES[t], resolveSink(cfg)), true, `${t} is valid — swallowed by the no-op`);
    }
    assert.equal(network, 0, "no network call in dark mode");
  } finally {
    globalRef.fetch = originalFetch;
  }
});

test("4b · v2 events reach an injected sink only when explicitly provided", () => {
  const { sink, events } = createMemorySink();
  for (const t of V2_EVENT_TYPES) track(V2_SAMPLES[t], sink);
  assert.equal(events.length, V2_EVENT_TYPES.length);
});

/* ---------------------------------------------------------------- *
 * 5 · No sensitive market/money fields
 * ---------------------------------------------------------------- */

test("5 · the allowlist carries no raw-sportsbook or money-shaped key, and the new keys are PII-clean", () => {
  const forbidden = ["odds", "price", "line", "stake", "wager", "bankroll", "payout", "bet", "money", "unit"];
  for (const key of ALLOWED_PROPERTY_KEYS) {
    const lower = key.toLowerCase();
    for (const banned of forbidden) {
      assert.ok(!lower.includes(banned), `allowed key '${key}' looks like a raw market/money field ('${banned}')`);
    }
  }
  for (const newKey of ["marketFamily", "feedbackTopic"]) {
    assert.ok(ALLOWED_PROPERTY_KEYS.includes(newKey), `v2 key '${newKey}' must be allowlisted`);
    for (const banned of PII_KEY_DENYLIST) {
      assert.ok(!newKey.toLowerCase().includes(banned), `v2 key '${newKey}' hits PII token '${banned}'`);
    }
  }
});
