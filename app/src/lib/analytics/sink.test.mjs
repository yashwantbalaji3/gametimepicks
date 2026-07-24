import { test } from "node:test";
import assert from "node:assert/strict";

import { readSinkConfig, createBeaconSink, resolveSink, track } from "./sink.ts";
import { NOOP_SINK, createMemorySink, SCHEMA_VERSION } from "./event-contract.ts";

const DAY = "2026-07-24";
const valid = { event: "daily_brief_view", schemaVersion: SCHEMA_VERSION, dayBucket: DAY, surface: "daily_hub", sport: "mlb" };

test("provider is OFF unless BOTH the kill-switch is on AND an endpoint is set", () => {
  assert.deepEqual(readSinkConfig({}), { enabled: false, endpoint: null });
  assert.deepEqual(readSinkConfig({ NEXT_PUBLIC_ANALYTICS_ENABLED: "1" }), { enabled: false, endpoint: null }, "flag alone ≠ on");
  assert.deepEqual(readSinkConfig({ NEXT_PUBLIC_ANALYTICS_ENDPOINT: "https://a/e" }), { enabled: false, endpoint: "https://a/e" }, "endpoint alone ≠ on");
  assert.deepEqual(readSinkConfig({ NEXT_PUBLIC_ANALYTICS_ENABLED: "1", NEXT_PUBLIC_ANALYTICS_ENDPOINT: "https://a/e" }), { enabled: true, endpoint: "https://a/e" });
});

test("resolveSink returns the NO-OP unless enabled AND endpoint (default = dark)", () => {
  assert.equal(resolveSink({ enabled: false, endpoint: null }), NOOP_SINK);
  assert.equal(resolveSink({ enabled: false, endpoint: "https://a/e" }), NOOP_SINK);
  assert.equal(resolveSink({ enabled: true, endpoint: null }), NOOP_SINK);
  assert.notEqual(resolveSink({ enabled: true, endpoint: "https://a/e" }), NOOP_SINK, "fully-configured → a real sink");
});

test("a valid event reaches an injected sink; the kill-switch (NOOP) prevents emission", () => {
  const captured = [];
  const sink = createBeaconSink("https://a/e", { send: (url, body) => { captured.push({ url, body }); return true; } });
  assert.equal(track(valid, sink), true);
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, "https://a/e");
  assert.equal(JSON.parse(captured[0].body).event, "daily_brief_view");
  // kill switch: resolved NOOP sink forwards nothing observable
  captured.length = 0;
  track(valid, resolveSink({ enabled: false, endpoint: null }));
  assert.equal(captured.length, 0);
});

test("invalid / PII-like / unknown-property events are DROPPED, never partially sent", () => {
  const { sink, events } = createMemorySink();
  assert.equal(track({ event: "not_a_real_event", schemaVersion: SCHEMA_VERSION, dayBucket: DAY }, sink), false);
  assert.equal(track({ ...valid, email: "a@b.com" }, sink), false, "PII-like key rejected by the closed allowlist");
  assert.equal(track({ ...valid, userId: "u123" }, sink), false, "unknown property rejected");
  assert.equal(track({ ...valid, source: "not_a_bucket", event: "source_visit", surface: "app" }, sink), false, "bad enum rejected");
  assert.equal(track({ ...valid, dayBucket: "2026-07-24T10:00:00Z" }, sink), false, "precise timestamp rejected (day-granularity only)");
  assert.equal(events.length, 0, "no invalid event ever reached the sink");
});

test("a sink outage never breaks the caller (analytics must never break the site)", () => {
  const throwingSink = () => { throw new Error("network down"); };
  assert.doesNotThrow(() => track(valid, throwingSink));
  assert.equal(track(valid, throwingSink), false);
  // a beacon whose send() throws is also swallowed
  const boom = createBeaconSink("https://a/e", { send: () => { throw new Error("beacon boom"); } });
  assert.doesNotThrow(() => track(valid, boom));
});

test("no outbound call happens without an explicitly injected/resolved real sink", () => {
  // With the default (no env) config, resolveSink is NOOP → track forwards to nothing observable.
  let sent = 0;
  const cfg = readSinkConfig({}); // dark
  const sink = cfg.enabled && cfg.endpoint ? createBeaconSink(cfg.endpoint, { send: () => { sent++; return true; } }) : resolveSink(cfg);
  track(valid, sink);
  assert.equal(sent, 0, "dark config emits nothing");
});
