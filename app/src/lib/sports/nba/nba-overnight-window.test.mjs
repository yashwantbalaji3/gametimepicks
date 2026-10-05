/**
 * Session 13 side lane · NBA overnight tips — a tip in the 06–14Z hole is owed from 18 h out, so the last dependable
 * evening tick forecasts it; every other tip keeps the 8 h window (timing only — model and write-once unchanged).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { isOvernightTip, owedWithOvernight, OVERNIGHT_HORIZON_HOURS, WINDOW_HORIZON_HOURS } from "../../../../scripts/nba/decide-nba-forecast-window.mjs";

const rows = [
  { providerEventId: "intl", dateUtc: "2031-10-09T12:00Z" },
  { providerEventId: "west", dateUtc: "2031-10-09T04:00Z" },
  { providerEventId: "evening", dateUtc: "2031-10-09T23:30Z" },
];
const none = () => new Set();

test("an international tip is owed from the evening before; a West Coast late tip and an evening tip keep 8 h", () => {
  assert.equal(WINDOW_HORIZON_HOURS, 8);
  assert.equal(OVERNIGHT_HORIZON_HOURS, 18);
  assert.ok(isOvernightTip("2031-10-09T12:00Z") && isOvernightTip("2031-10-09T06:00Z"));
  assert.ok(!isOvernightTip("2031-10-09T04:00Z") && !isOvernightTip("2031-10-09T14:00Z") && !isOvernightTip("garbage"));
  const at22 = owedWithOvernight({ rows, storedIdsByDate: none, now: "2031-10-08T22:00:00Z" });
  const ids = at22.flatMap((o) => o.eventIds);
  assert.ok(ids.includes("intl"), "14 h before an overnight tip: owed");
  assert.ok(ids.includes("west"), "6 h before the 04:00Z tip: owed by the normal window");
  assert.ok(!ids.includes("evening"), "25.5 h before an evening tip: not owed");
  const at15 = owedWithOvernight({ rows, storedIdsByDate: none, now: "2031-10-08T15:00:00Z" });
  assert.ok(!at15.flatMap((o) => o.eventIds).includes("intl"), "21 h out is beyond even the overnight horizon");
  const done = owedWithOvernight({ rows, storedIdsByDate: () => new Set(["intl", "west"]), now: "2031-10-08T22:00:00Z" });
  assert.deepEqual(done.flatMap((o) => o.eventIds), [], "control: an already-forecast tip is never owed again");
});
