/**
 * Tests for the Sports Event Hub schedule layer (`event-schedules.ts`).
 *
 * These lock the honesty contract for a SCHEDULE-ONLY surface:
 *   - source metadata is complete and attributable for every league;
 *   - events carry schedule fields only (no odds/projection/pick fields);
 *   - the date-grouping + formatting helpers are deterministic, bin by
 *     Eastern calendar day, sort ascending, and never mutate input;
 *   - empty + disabled sources are distinguishable so the UI can render
 *     the honest "no events" vs "not connected" states.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EVENT_LEAGUE_ORDER,
  getLeagueSchedule,
  listLeagueSchedules,
  isSourceConnected,
  formatEventDateLabel,
  formatEventTimeLabel,
  groupEventsByDate,
  summarizeSource,
} from "./event-schedules.ts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T/;

/** Schedule-only fields an event is allowed to expose. */
const ALLOWED_EVENT_KEYS = new Set([
  "id",
  "startUtc",
  "name",
  "shortName",
  "venue",
  "detail",
  "competitors",
]);

// ---------------------------------------------------------------------------
// Registry / ordering
// ---------------------------------------------------------------------------

test("league order is WNBA, UFC, MLS (the completed 2026 World Cup is delisted from the events hub)", () => {
  assert.deepEqual(EVENT_LEAGUE_ORDER, ["wnba", "ufc", "mls"]);
});

test("listLeagueSchedules returns leagues in tab order", () => {
  const keys = listLeagueSchedules().map((l) => l.key);
  assert.deepEqual(keys, EVENT_LEAGUE_ORDER);
});

test("getLeagueSchedule returns the requested league", () => {
  for (const key of EVENT_LEAGUE_ORDER) {
    assert.equal(getLeagueSchedule(key).key, key);
  }
});

// ---------------------------------------------------------------------------
// Source metadata (attribution honesty)
// ---------------------------------------------------------------------------

test("every league carries complete, attributable source metadata", () => {
  for (const league of listLeagueSchedules()) {
    const { source } = league;
    assert.ok(source.name.length > 0, `${league.key} source name`);
    assert.match(source.url, /^https:\/\//, `${league.key} source url`);
    assert.match(source.retrievedAt, ISO_INSTANT, `${league.key} retrievedAt`);
    assert.match(source.rangeStart, ISO_DATE, `${league.key} rangeStart`);
    assert.match(source.rangeEnd, ISO_DATE, `${league.key} rangeEnd`);
    assert.ok(source.note.length > 10, `${league.key} note`);
    assert.ok(
      source.rangeStart <= source.rangeEnd,
      `${league.key} range is ordered`,
    );
    assert.ok(league.label.length > 0 && league.longLabel.length > 0);
  }
});

test("summarizeSource names the source and the snapshot day", () => {
  const wnba = getLeagueSchedule("wnba");
  const summary = summarizeSource(wnba.source);
  assert.ok(summary.includes(wnba.source.name));
  assert.ok(summary.includes("snapshot"));
  assert.ok(summary.includes(wnba.source.retrievedAt.slice(0, 10)));
});

// ---------------------------------------------------------------------------
// Schedule-only honesty: no betting fields leak in
// ---------------------------------------------------------------------------

test("events expose schedule-only fields (no odds/projection/pick keys)", () => {
  for (const league of listLeagueSchedules()) {
    for (const event of league.events) {
      for (const key of Object.keys(event)) {
        assert.ok(
          ALLOWED_EVENT_KEYS.has(key),
          `${league.key} event ${event.id} has disallowed field "${key}"`,
        );
      }
      assert.match(event.startUtc, ISO_INSTANT);
      assert.ok(event.name.length > 0);
    }
  }
});

test("UFC cards are schedule-only (named cards, no betting fields)", () => {
  const ufc = getLeagueSchedule("ufc");
  assert.ok(ufc.events.length >= 1, "UFC has upcoming cards");
  for (const card of ufc.events) {
    assert.ok(card.name.length > 0, "card has a name");
    assert.match(card.startUtc, ISO_INSTANT);
    // schedule-only — no odds/projection/pick fields ever
    assert.equal(card.odds, undefined);
    assert.equal(card.projection, undefined);
    assert.equal(card.pick, undefined);
  }
});

test("MLS is a real schedule-only league with future fixtures", () => {
  const mls = getLeagueSchedule("mls");
  assert.equal(mls.key, "mls");
  assert.equal(mls.status, "connected");
  assert.ok(mls.events.length >= 1, "MLS has upcoming fixtures");
  for (const ev of mls.events) {
    assert.match(ev.startUtc, ISO_INSTANT);
    assert.ok(ev.name.length > 0);
  }
});

// ---------------------------------------------------------------------------
// Connected / disabled state
// ---------------------------------------------------------------------------

test("all baked leagues report as connected", () => {
  for (const league of listLeagueSchedules()) {
    assert.equal(isSourceConnected(league), true);
  }
});

test("isSourceConnected is false for a disabled source", () => {
  const disabled = {
    key: "wnba",
    label: "WNBA",
    longLabel: "Women's National Basketball Association",
    status: "disabled",
    source: getLeagueSchedule("wnba").source,
    events: [],
  };
  assert.equal(isSourceConnected(disabled), false);
});

// ---------------------------------------------------------------------------
// Date grouping
// ---------------------------------------------------------------------------

test("groupEventsByDate returns [] for no events (empty state)", () => {
  assert.deepEqual(groupEventsByDate([]), []);
});

test("groupEventsByDate bins by Eastern calendar day and sorts ascending", () => {
  // Two clearly distinct UTC days, passed in reverse order.
  const events = [
    { id: "b", startUtc: "2026-07-02T18:00Z", name: "Second" },
    { id: "a", startUtc: "2026-07-01T18:00Z", name: "First" },
  ];
  const groups = groupEventsByDate(events);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].dateKey, "2026-07-01");
  assert.equal(groups[1].dateKey, "2026-07-02");
  assert.equal(groups[0].events[0].id, "a");
  assert.equal(groups[1].events[0].id, "b");
});

test("late-night UTC tip-offs collapse into one Eastern day", () => {
  // Three games at 23:30Z (7:30pm ET) + one at 02:00Z next UTC day
  // (10:00pm ET same Eastern evening) → all one Eastern calendar day.
  // Synthetic fixture so the test is robust to schedule refreshes.
  const events = [
    { id: "1", startUtc: "2026-06-02T23:30Z", name: "A" },
    { id: "2", startUtc: "2026-06-02T23:30Z", name: "B" },
    { id: "3", startUtc: "2026-06-02T23:30Z", name: "C" },
    { id: "4", startUtc: "2026-06-03T02:00Z", name: "D" },
  ];
  const groups = groupEventsByDate(events);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].dateKey, "2026-06-02");
  assert.equal(groups[0].events.length, 4);
  // Sorted ascending by start; the 02:00Z game is last.
  assert.equal(groups[0].events[3].startUtc, "2026-06-03T02:00Z");
});

test("groupEventsByDate does not mutate its input", () => {
  const events = [
    { id: "b", startUtc: "2026-07-02T18:00Z", name: "Second" },
    { id: "a", startUtc: "2026-07-01T18:00Z", name: "First" },
  ];
  const before = events.map((e) => e.id);
  groupEventsByDate(events);
  assert.deepEqual(
    events.map((e) => e.id),
    before,
  );
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

test("formatEventTimeLabel renders an ET-suffixed clock time", () => {
  const label = formatEventTimeLabel("2026-05-29T23:30Z");
  assert.ok(label.endsWith(" ET"), label);
  assert.ok(label.includes("7:30"), label);
  assert.ok(label.includes("PM"), label);
});

test("formatEventTimeLabel distinguishes different instants", () => {
  const a = formatEventTimeLabel("2026-05-29T23:30Z");
  const b = formatEventTimeLabel("2026-05-30T02:00Z");
  assert.notEqual(a, b);
});

test("formatEventDateLabel renders a weekday/month/day label", () => {
  const label = formatEventDateLabel("2026-05-29T23:30Z");
  assert.ok(label.includes("May"), label);
  assert.ok(label.includes("29"), label);
});
