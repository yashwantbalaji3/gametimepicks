/**
 * MARKET-CENTER ANALYTICS WIRING (Program 058-061, v2). Guards the one interaction call site wired this
 * program — `market_disagreement_opened` on the /markets "largest difference" sort — the same way
 * bootstrap-wiring.test.mjs guards the page-view bootstrap: the component resolves the (default NO-OP)
 * sink from config, emits ONLY through the validated track/builder path, and can never leak a raw
 * network call. Also unit-tests the pure event builder.
 *
 * Run: cd app && npx tsx --test src/lib/analytics/market-center-wiring.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { marketDisagreementOpenedEvent } from "./page-events.ts";
import { NOOP_SINK, createMemorySink, validateEvent } from "./event-contract.ts";
import { readSinkConfig, resolveSink, track } from "./sink.ts";

const app = process.cwd();
const src = fs.readFileSync(path.join(app, "src/components/market-center.tsx"), "utf8");

const DAY = "2026-07-29";

test("the component resolves the sink from config (NO-OP unless a provider is configured)", () => {
  assert.match(src, /resolveSink\(readSinkConfig\(\)\)/, "sink comes from config, never hard-coded");
});

test("it emits ONLY through the validated track + builder path — no raw network call", () => {
  assert.match(src, /track\(marketDisagreementOpenedEvent\(/, "uses the pure builder through track()");
  assert.ok(!/\bfetch\(|XMLHttpRequest|new WebSocket|sendBeacon\(|axios/.test(src), "no ad-hoc network call in the component");
});

test("the emission is the disagreement-sort interaction, guarded against repeat fires", () => {
  // Fires when the reader CHOOSES the largest-difference sort, not on every re-render/re-select.
  assert.match(src, /v === "gap" && sort !== "gap"/, "only an actual sort CHANGE to 'gap' emits");
});

test("the builder produces a valid, closed-enum v2 event (and defaults to the coarse family bucket)", () => {
  const e = marketDisagreementOpenedEvent(DAY);
  assert.equal(e.event, "market_disagreement_opened");
  assert.equal(e.surface, "markets");
  assert.equal(e.marketFamily, "other", "the /markets sort spans families — coarse bucket by default");
  assert.ok(validateEvent(e).ok);
  assert.ok(validateEvent(marketDisagreementOpenedEvent(DAY, { sport: "mlb", marketFamily: "strikeouts" })).ok);
});

test("with the env unset the interaction goes to the NO-OP sink; an injected sink receives it", () => {
  assert.equal(resolveSink(readSinkConfig({})), NOOP_SINK, "dark by default");
  assert.equal(track(marketDisagreementOpenedEvent(DAY), NOOP_SINK), true, "valid — swallowed by the no-op");

  const { sink, events } = createMemorySink();
  assert.equal(track(marketDisagreementOpenedEvent(DAY), sink), true);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "market_disagreement_opened");
});
