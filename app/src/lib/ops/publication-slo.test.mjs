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
