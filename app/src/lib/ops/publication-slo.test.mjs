/**
 * The publication-SLO classifier: what the public surfaces are allowed to say about today.
 *
 * The state this exists to create is INCIDENT. Before 2026-08-27 there was no such state — a slate
 * that had not published read "Today's slate isn't published yet" at 6 AM and the same at 2 PM, so
 * the day the whole generation chain silently received no scheduled events, the site said exactly
 * what it says on a perfectly healthy morning. Nothing was wrong with the copy; there was no
 * deadline for it to be measured against.
 *
 * These cases pin the deadline's derivation (from the schedule, never a fixed hour), the six states,
 * and the two places the classifier must refuse to guess.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { classify } from "./publication-slo.mjs";

const at = (iso) => Date.parse(iso);
const game = (startUtc) => ({ gamePk: 1, startUtc, away: "A", home: "H", detailedState: null });
const noBoard = { present: false, leans: 0, pendingReason: null };
const LEAD = 90;

const call = (o) => classify({ leadMinutes: LEAD, board: noBoard, ...o });

test("the deadline comes from the earliest scheduled start, not a fixed hour", () => {
  // A 1:05 PM day and a 10:05 PM day must not share a deadline. Nobody maintains a table for this.
  const early = call({ games: [game("2026-08-27T17:05:00Z"), game("2026-08-27T23:05:00Z")], nowMs: at("2026-08-27T12:00:00Z") });
  const late = call({ games: [game("2026-08-28T02:05:00Z")], nowMs: at("2026-08-27T12:00:00Z") });
  assert.equal(early.deadlineUtc, "2026-08-27T15:35:00.000Z");
  assert.equal(late.deadlineUtc, "2026-08-28T00:35:00.000Z");
  assert.equal(early.state, "PUBLISHING");
  assert.equal(late.state, "PUBLISHING");
});

test("before the deadline, an unpublished slate is PUBLISHING — not an incident", () => {
  const v = call({ games: [game("2026-08-27T17:05:00Z")], nowMs: at("2026-08-27T15:34:59Z") });
  assert.equal(v.state, "PUBLISHING");
});

test("after the deadline, the same unpublished slate is an INCIDENT", () => {
  // The one-second difference is the entire point: lateness is a fact, not a feeling.
  const v = call({ games: [game("2026-08-27T17:05:00Z")], nowMs: at("2026-08-27T15:35:00Z") });
  assert.equal(v.state, "INCIDENT");
  assert.match(v.reason, /deadline/);
});

test("THE AUG-27 SHAPE · seven games, no board, mid-afternoon", () => {
  const games = [
    game("2026-08-27T17:05:00Z"), game("2026-08-27T18:15:00Z"), game("2026-08-27T23:05:00Z"),
    game("2026-08-27T23:07:00Z"), game("2026-08-27T23:10:00Z"), game("2026-08-27T23:15:00Z"),
    game("2026-08-28T01:45:00Z"),
  ];
  const v = call({ games, nowMs: at("2026-08-27T18:02:00Z") });
  assert.equal(v.state, "INCIDENT");
  assert.equal(v.deadlineUtc, "2026-08-27T15:35:00.000Z");
});

test("a published board outranks the clock", () => {
  const v = call({
    games: [game("2026-08-27T17:05:00Z")],
    board: { present: true, leans: 257, pendingReason: null },
    nowMs: at("2026-08-27T18:02:00Z"),
  });
  assert.equal(v.state, "PUBLISHED");
});

test("a pending shell is INPUT_GATED and names what it is waiting on — not PUBLISHED, not an incident", () => {
  const v = call({
    games: [game("2026-08-27T23:05:00Z")],
    board: { present: true, leans: 0, pendingReason: "no_events" },
    nowMs: at("2026-08-27T22:00:00Z"),
  });
  assert.equal(v.state, "INPUT_GATED");
  assert.match(v.reason, /no_events/);
});

test("a known-empty schedule is NO_EVENT — a quiet day is not an outage", () => {
  const v = call({ games: [], nowMs: at("2026-08-27T18:02:00Z") });
  assert.equal(v.state, "NO_EVENT");
  assert.equal(v.deadlineUtc, null);
});

test("REFUSAL · an unknown schedule is never green and never NO_EVENT", () => {
  // Not knowing whether games exist is a different state from knowing there are none. Collapsing
  // them is exactly how a missed morning reads as a quiet day.
  const v = call({ games: null, nowMs: at("2026-08-27T18:02:00Z") });
  assert.equal(v.state, "UNKNOWN");
  assert.notEqual(v.state, "NO_EVENT");
});

test("REFUSAL · games with no readable start time yield no deadline, so no lateness is claimed", () => {
  const v = call({ games: [game(null), game("not-a-time")], nowMs: at("2026-08-27T18:02:00Z") });
  assert.equal(v.state, "UNKNOWN");
  assert.equal(v.deadlineUtc, null);
});

test("one unreadable start does not stop the others from setting the deadline", () => {
  const v = call({ games: [game(null), game("2026-08-27T23:05:00Z")], nowMs: at("2026-08-27T12:00:00Z") });
  assert.equal(v.deadlineUtc, "2026-08-27T21:35:00.000Z");
  assert.equal(v.state, "PUBLISHING");
});

/* ── PER-SPORT LATENESS ───────────────────────────────────────────────────────────────────────── */

import { classifySport, worstOf } from "./publication-slo.mjs";

const ev = (id, startUtc) => ({ id, startUtc, label: id });
const sport = (events, publishedIds, nowIso) =>
  classifySport({ events, published: new Set(publishedIds), nowMs: at(nowIso), leadMinutes: LEAD });

test("SPORT · nothing awaiting and nothing missed is PUBLISHED", () => {
  const v = sport([ev("a", "2026-08-27T23:00:00Z"), ev("b", "2026-08-28T00:00:00Z")], ["a", "b"], "2026-08-27T18:00:00Z");
  assert.equal(v.state, "PUBLISHED");
  assert.deepEqual(v.counts, { scheduled: 2, published: 2, missedCoverage: 0, awaiting: 0 });
});

test("SPORT · the deadline belongs to the earliest event still AWAITING a forecast", () => {
  /*
   * Not the earliest event. An event already published sets no deadline, and one already started is
   * past every deadline it ever had — taking the horizon's minimum would report a sport as late for
   * a game it had already covered.
   */
  const events = [ev("done", "2026-08-27T20:00:00Z"), ev("todo", "2026-08-28T02:00:00Z")];
  const v = sport(events, ["done"], "2026-08-27T18:00:00Z");
  assert.equal(v.deadlineUtc, "2026-08-28T00:30:00.000Z");
  assert.equal(v.state, "PUBLISHING");
});

test("SPORT · past that deadline it is an INCIDENT", () => {
  const v = sport([ev("todo", "2026-08-28T02:00:00Z")], [], "2026-08-28T00:30:00Z");
  assert.equal(v.state, "INCIDENT");
});

test("SPORT · a started event with no forecast is MISSED_COVERAGE and never 'awaiting'", () => {
  // It can never gain a forecast, so counting it as pending would leave a permanent hole open
  // forever, and counting it nowhere would report the horizon as whole.
  const v = sport([ev("gone", "2026-08-27T17:00:00Z")], [], "2026-08-27T18:00:00Z");
  assert.equal(v.state, "MISSED_COVERAGE");
  assert.equal(v.counts.missedCoverage, 1);
  assert.equal(v.counts.awaiting, 0);
  assert.equal(v.counts.scheduled, 1, "it stays in the denominator");
  assert.equal(v.missed[0].id, "gone");
});

test("THE AUG-27 MLB SHAPE · six recovered, one permanently uncovered", () => {
  const events = [
    ev("822694", "2026-08-27T17:06:00Z"), ev("823014", "2026-08-27T18:15:00Z"),
    ev("823503", "2026-08-27T23:05:00Z"), ev("822771", "2026-08-27T23:07:00Z"),
    ev("823581", "2026-08-27T23:10:00Z"), ev("824879", "2026-08-27T23:15:00Z"),
    ev("823179", "2026-08-28T01:45:00Z"),
  ];
  const v = sport(events, events.slice(1).map((e) => e.id), "2026-08-27T18:30:00Z");
  assert.equal(v.state, "MISSED_COVERAGE");
  assert.equal(v.counts.scheduled, 7);
  assert.equal(v.counts.published, 6);
  assert.equal(v.counts.missedCoverage, 1);
});

test("SPORT · an unreadable start counts as started — a horizon may not be padded by a bad date", () => {
  const v = sport([ev("x", null), ev("y", "nope")], [], "2026-08-27T18:00:00Z");
  assert.equal(v.counts.missedCoverage, 2);
  assert.equal(v.counts.awaiting, 0);
});

test("REFUSAL · a horizon that could not be established is UNKNOWN, never NO_EVENT", () => {
  const v = classifySport({ events: null, published: new Set(), nowMs: at("2026-08-27T18:00:00Z"), leadMinutes: LEAD });
  assert.equal(v.state, "UNKNOWN");
  assert.equal(v.counts.scheduled, null, "an unknown horizon has no count, not a count of zero");
});

test("SPORT · a genuinely empty horizon is NO_EVENT", () => {
  assert.equal(sport([], [], "2026-08-27T18:00:00Z").state, "NO_EVENT");
});

test("WORST-OF · one late sport makes the platform late", () => {
  /*
   * Averaging a fleet of pipelines is how three-quarters-broken reads as mostly fine. On 2026-08-27
   * the dropped-event band took MLB, NFL and UFC; any rule softer than worst-of would have called
   * that a good day.
   */
  assert.equal(worstOf(["PUBLISHED", "PUBLISHED", "PUBLISHED", "INCIDENT"]), "INCIDENT");
  assert.equal(worstOf(["PUBLISHED", "NO_EVENT"]), "NO_EVENT");
  assert.equal(worstOf(["PUBLISHED", "PUBLISHING", "MISSED_COVERAGE"]), "MISSED_COVERAGE");
  assert.equal(worstOf(["INCIDENT", "UNKNOWN"]), "UNKNOWN", "not knowing outranks a known incident");
  assert.equal(worstOf([]), "PUBLISHED");
});
