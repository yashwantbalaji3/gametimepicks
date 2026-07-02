/**
 * Freshness DISPLAY layer — the honest "is this current?" badge text. The critical guarantee: a slate
 * whose date is behind the real wall clock NEVER reads "Live today". Pure, so we drive it with fixed dates.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { freshnessDisplay } from "./freshness-display.ts";

test("same-day slate → 'Live today', live tone, no warning", () => {
  const f = freshnessDisplay("2026-07-05", "2026-07-05");
  assert.equal(f.state, "current");
  assert.equal(f.tone, "live");
  assert.equal(f.text, "Live today");
  assert.equal(f.warning, null);
  assert.equal(f.ageDays, 0);
});

test("one day behind → 'Latest slate · yesterday', recent tone, no hard warning", () => {
  const f = freshnessDisplay("2026-07-04", "2026-07-05");
  assert.equal(f.state, "previous");
  assert.equal(f.tone, "recent");
  assert.equal(f.text, "Latest slate · yesterday");
  assert.equal(f.warning, null);
  assert.equal(f.ageDays, 1);
});

test("two-plus days behind → stale tone + 'awaiting refresh' warning, NEVER 'Live today'", () => {
  const f = freshnessDisplay("2026-07-01", "2026-07-05");
  assert.equal(f.state, "previous");
  assert.equal(f.tone, "stale");
  assert.equal(f.text, "Latest slate · 4 days ago");
  assert.match(f.warning, /newer slate hasn't been generated/i);
  assert.match(f.warning, /2026-07-01/);
  assert.notEqual(f.text, "Live today");
  assert.equal(f.ageDays, 4);
});

test("future slate → 'Upcoming', future tone", () => {
  assert.equal(freshnessDisplay("2026-07-06", "2026-07-05").text, "Upcoming · tomorrow");
  assert.equal(freshnessDisplay("2026-07-06", "2026-07-05").tone, "future");
  assert.equal(freshnessDisplay("2026-07-10", "2026-07-05").text, "Upcoming · 2026-07-10");
});

test("no slate date → muted 'No current slate', NaN age", () => {
  const f = freshnessDisplay(null, "2026-07-05");
  assert.equal(f.state, "no_data");
  assert.equal(f.tone, "muted");
  assert.equal(f.text, "No current slate");
  assert.ok(Number.isNaN(f.ageDays));
});

test("noun override flows into the label + warning", () => {
  assert.equal(freshnessDisplay("2026-07-05", "2026-07-05", { noun: "board" }).text, "Live today");
  assert.equal(freshnessDisplay("2026-07-04", "2026-07-05", { noun: "board" }).text, "Latest board · yesterday");
  assert.match(freshnessDisplay("2026-07-01", "2026-07-05", { noun: "results" }).warning, /newer results hasn't/i);
});
