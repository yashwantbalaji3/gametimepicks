/**
 * ESPN scoreboard window plan — the range form died on 2026-09-20 (400 on every `dates=A-B`);
 * the month form survives. These pin the request plan and the window filter that replaced it.
 *
 * Run: npx tsx --test src/lib/sports/espn-scoreboard-window.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { monthsCovering, scoreboardMonthUrls, inWindow, mergeWindowEvents } from "./espn-scoreboard-window.mjs";

test("a window inside one month asks for one month; a window crossing months asks for each, in order", () => {
  assert.deepEqual(monthsCovering("2026-09-22T14:00:00Z", "2026-09-29T14:00:00Z"), ["202609"]);
  assert.deepEqual(monthsCovering("2026-09-22T14:00:00Z", "2026-10-01T14:00:00Z"), ["202609", "202610"]);
  // a 70-day NBA window from late September touches three months
  assert.deepEqual(monthsCovering("2026-09-22T14:00:00Z", "2026-12-01T14:00:00Z"), ["202609", "202610", "202611", "202612"]);
  // year boundary
  assert.deepEqual(monthsCovering("2026-12-20T00:00:00Z", "2027-01-05T00:00:00Z"), ["202612", "202701"]);
});

test("the request form is the MONTH form, never the range form that the provider now refuses", () => {
  const urls = scoreboardMonthUrls("football/nfl", "2026-09-22T14:00:00Z", "2026-10-01T14:00:00Z");
  assert.equal(urls.length, 2);
  for (const u of urls) {
    assert.match(u, /\/football\/nfl\/scoreboard\?dates=\d{6}&limit=1000$/);
    assert.doesNotMatch(u, /dates=\d{8}-\d{8}/, "the range form answers 400 since 2026-09-20");
  }
});

test("invalid or inverted windows refuse rather than fetch nothing quietly", () => {
  assert.throws(() => monthsCovering("nope", "2026-10-01T00:00:00Z"));
  assert.throws(() => monthsCovering("2026-10-02T00:00:00Z", "2026-10-01T00:00:00Z"));
});

test("month responses are merged into exactly the window: outside-window events drop, duplicates collapse, order kept", () => {
  const d0 = "2026-09-22T14:00:00Z", d1 = "2026-10-01T14:00:00Z";
  const sept = { events: [
    { id: 1, date: "2026-09-10T17:00Z" },            // before the window — a month response carries the whole month
    { id: 2, date: "2026-09-27T17:00Z" },
    { id: 3, date: "2026-09-28T00:15Z" },
  ] };
  const oct = { events: [
    { id: 3, date: "2026-09-28T00:15Z" },            // same event echoed by the next month's response
    { id: 4, date: "2026-10-01T13:00Z" },
    { id: 5, date: "2026-10-02T17:00Z" },            // after the window
    { id: null, date: "2026-09-29T17:00Z" },         // no identity → never a row
    { id: 6, date: "not a date" },
  ] };
  const rows = mergeWindowEvents([sept, oct], d0, d1);
  assert.deepEqual(rows.map((e) => e.id), [2, 3, 4]);
  assert.equal(inWindow("2026-09-22T14:00:00Z", d0, d1), true, "inclusive start");
  assert.equal(inWindow("2026-10-01T14:00:01Z", d0, d1), false, "exclusive past the end instant");
});
