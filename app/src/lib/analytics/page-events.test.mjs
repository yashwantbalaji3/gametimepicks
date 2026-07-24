import { test } from "node:test";
import assert from "node:assert/strict";

import { funnelEventsForPath, sourceVisitEvent } from "./page-events.ts";
import { validateEvent } from "./event-contract.ts";

const DAY = "2026-07-24";

test("each funnel path maps to the right existing event(s)", () => {
  assert.deepEqual(funnelEventsForPath("/today", { dayBucket: DAY }).map((e) => e.event), ["daily_hub_view", "daily_brief_view"]);
  assert.deepEqual(funnelEventsForPath("/games/mlb/kc-vs-det-2026-07-24", { dayBucket: DAY }).map((e) => e.event), ["game_report_open"]);
  assert.deepEqual(funnelEventsForPath("/results", { dayBucket: DAY }).map((e) => e.event), ["results_recap_open"]);
  assert.deepEqual(funnelEventsForPath("/results/mlb", { dayBucket: DAY }).map((e) => e.event), ["results_recap_open"]);
  assert.deepEqual(funnelEventsForPath("/mlb", { dayBucket: DAY }).map((e) => e.event), ["daily_hub_view"]);
});

test("home and unmapped paths emit no page-VIEW event (home CTA is a click, instrumented separately)", () => {
  assert.deepEqual(funnelEventsForPath("/", { dayBucket: DAY }), []);
  assert.deepEqual(funnelEventsForPath("/simulate", { dayBucket: DAY }), []);
  assert.deepEqual(funnelEventsForPath("/games/mlb", { dayBucket: DAY }), [], "the games index is not a single report");
});

test("trailing slashes + query strings are normalized before matching", () => {
  assert.deepEqual(funnelEventsForPath("/today/", { dayBucket: DAY }).map((e) => e.event), ["daily_hub_view", "daily_brief_view"]);
  assert.deepEqual(funnelEventsForPath("/results/?x=1", { dayBucket: DAY }).map((e) => e.event), ["results_recap_open"]);
});

test("every emitted funnel event validates against the contract (no PII, closed enums)", () => {
  for (const p of ["/today", "/games/mlb/a-vs-b-2026-07-24", "/results", "/mlb"]) {
    for (const e of funnelEventsForPath(p, { dayBucket: DAY })) assert.equal(validateEvent(e).ok, true, `${p} → ${e.event}`);
  }
  for (const s of ["x", "discord", "direct", "referral", "organic"]) assert.equal(validateEvent(sourceVisitEvent(s, DAY)).ok, true);
});
