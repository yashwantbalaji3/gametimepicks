/**
 * A REFRESH CADENCE IS NOT A LIFECYCLE.
 *
 * Run: npx tsx --test src/lib/sports/event-lifecycle.test.mjs
 *
 * /ufc presented a card fought the previous night under the heading "Next card", with a live paper
 * ladder beneath it. Nothing was broken: the card artifact is rebuilt Tuesday, Thursday and
 * Saturday, so between a Saturday card and the following Tuesday the newest artifact legitimately
 * describes a finished event. No surface compared the event's own start time to the clock.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { eventState, isUpcoming, eventHeading, EVENT_STATE } from "./event-lifecycle.mjs";

const CARD = "2026-08-22T21:00:00Z";

test("the exact case: a card fought last night is NOT next", () => {
  assert.equal(eventState({ startUtc: CARD, nowIso: "2026-08-23T15:35:00Z" }), EVENT_STATE.COMPLETE);
  assert.equal(isUpcoming({ startUtc: CARD, nowIso: "2026-08-23T15:35:00Z" }), false);
  assert.equal(eventHeading(EVENT_STATE.COMPLETE), "Last card");
});

test("before it starts it is upcoming, and only then", () => {
  assert.equal(eventState({ startUtc: CARD, nowIso: "2026-08-22T20:59:00Z" }), EVENT_STATE.UPCOMING);
  assert.equal(eventState({ startUtc: CARD, nowIso: "2026-08-22T21:00:01Z" }), EVENT_STATE.IN_PROGRESS);
});

test("an event in progress is NEITHER upcoming NOR complete", () => {
  /*
   * Both errors are real. Calling it upcoming offers a pregame price on an event already running;
   * calling it complete starts grading picks against outcomes that are not final.
   */
  const s = eventState({ startUtc: CARD, nowIso: "2026-08-22T23:30:00Z" });
  assert.equal(s, EVENT_STATE.IN_PROGRESS);
  assert.equal(isUpcoming({ startUtc: CARD, nowIso: "2026-08-22T23:30:00Z" }), false);
  assert.match(eventHeading(s), /in progress/i);
});

test("an unreadable start time is UNKNOWN, never guessed in either direction", () => {
  for (const bad of [null, "", "soon", undefined]) {
    assert.equal(eventState({ startUtc: bad, nowIso: "2026-08-23T15:00:00Z" }), EVENT_STATE.UNKNOWN);
    assert.equal(isUpcoming({ startUtc: bad, nowIso: "2026-08-23T15:00:00Z" }), false,
      "an event we cannot place in time must not be advertised as the next one");
  }
  assert.equal(eventState({ startUtc: CARD, nowIso: "not-a-time" }), EVENT_STATE.UNKNOWN);
});

test("the duration is configurable because sports differ, and defaults generous", () => {
  // Calling something COMPLETE while it is still happening is the worse error.
  assert.equal(eventState({ startUtc: CARD, nowIso: "2026-08-23T02:00:00Z" }), EVENT_STATE.IN_PROGRESS);
  assert.equal(eventState({ startUtc: CARD, nowIso: "2026-08-23T00:30:00Z", durationHours: 3 }), EVENT_STATE.COMPLETE);
});

test("the heading is DERIVED, so it cannot disagree with what sits beneath it", () => {
  assert.equal(eventHeading(EVENT_STATE.UPCOMING, "fixture"), "Next fixture");
  assert.equal(eventHeading(EVENT_STATE.COMPLETE, "fixture"), "Last fixture");
  assert.equal(eventHeading(EVENT_STATE.UNKNOWN, "slate"), "Published slate");
});
