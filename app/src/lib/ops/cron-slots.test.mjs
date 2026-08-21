/**
 * The watchdog's correctness risk is not "does it detect a miss" — it is "does it stay quiet when a
 * sport simply had nothing on". A watchdog that fires on a bye week is worse than no watchdog, so
 * most of these assert SILENCE.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { cronMatches, expectedSlots, failureStreak, missedSlots, windowFloor } from "./cron-slots.mjs";

const at = (iso) => new Date(iso);
const ms = (iso) => Date.parse(iso);
const H = 3600_000;

test("cron fields match the forms these workflows actually use", () => {
  assert.ok(cronMatches("30 14 * * *", at("2026-08-19T14:30:00Z")));
  assert.ok(!cronMatches("30 14 * * *", at("2026-08-19T14:31:00Z")));
  // 2026-08-18 is a Tuesday (day 2) — ufc-fight-week's cadence.
  assert.equal(at("2026-08-18T11:00:00Z").getUTCDay(), 2);
  assert.ok(cronMatches("0 11 * * 2", at("2026-08-18T11:00:00Z")));
  assert.ok(!cronMatches("0 11 * * 2", at("2026-08-19T11:00:00Z")), "Wednesday is not in a Tuesday cron");
});

test("Sunday is 0 AND 7, because GitHub accepts both", () => {
  const sunday = at("2026-08-16T07:00:00Z");
  assert.equal(sunday.getUTCDay(), 0);
  assert.ok(cronMatches("0 7 * * 0", sunday));
  assert.ok(cronMatches("0 7 * * 7", sunday), "a cron written with 7 must not silently never fire");
});

test("lists, ranges and steps parse", () => {
  assert.ok(cronMatches("0 11 * * 2,4,6", at("2026-08-20T11:00:00Z")), "Thursday is in the list");
  assert.ok(!cronMatches("0 11 * * 2,4,6", at("2026-08-19T11:00:00Z")), "Wednesday is not");
  assert.ok(cronMatches("0 */6 * * *", at("2026-08-19T12:00:00Z")));
  assert.ok(!cronMatches("0 */6 * * *", at("2026-08-19T13:00:00Z")));
  assert.throws(() => cronMatches("0 11 * *", at("2026-08-19T11:00:00Z")), /5 fields/);
});

test("slots are enumerated across a window, not just the first", () => {
  const slots = expectedSlots(["0 11 * * 2,4,6"], ms("2026-08-17T00:00:00Z"), ms("2026-08-23T00:00:00Z"));
  assert.deepEqual(slots.map((t) => new Date(t).toISOString()), [
    "2026-08-18T11:00:00.000Z", "2026-08-20T11:00:00.000Z", "2026-08-22T11:00:00.000Z",
  ]);
});

test("a LATE run still counts — the scheduler drifts, and lateness is not absence", () => {
  const slot = ms("2026-08-18T11:00:00Z");
  const late = [slot + 90 * 60_000];               // 1.5h late, observed behaviour here
  const now = ms("2026-08-19T00:00:00Z");
  assert.deepEqual(missedSlots([slot], late, { nowMs: now }), [], "a drifted run is not a miss");
});

test("a slot with NO run at all is reported", () => {
  const slot = ms("2026-08-18T11:00:00Z");
  const now = ms("2026-08-19T00:00:00Z");
  assert.deepEqual(missedSlots([slot], [], { nowMs: now }), [slot]);
  // and a run belonging to a different day must not cover it
  assert.deepEqual(missedSlots([slot], [ms("2026-08-16T11:00:00Z")], { nowMs: now }), [slot]);
});

test("a slot that has not come due yet is NEVER reported", () => {
  // Otherwise the watchdog alarms on the current slot every single time it runs.
  const slot = ms("2026-08-19T11:00:00Z");
  const now = slot + 30 * 60_000;                   // 30 min after, inside tolerance
  assert.deepEqual(missedSlots([slot], [], { nowMs: now }), [], "not yet due is not missed");
});

test("A QUIET WEEK IS SILENT — the failure mode that would kill trust in this watchdog", () => {
  // ufc-fight-week fired on all three slots and produced nothing, because there was no card. Every
  // run exists, so there is nothing to report. This is the whole reason the check watches runs.
  const slots = expectedSlots(["0 11 * * 2,4,6"], ms("2026-08-17T00:00:00Z"), ms("2026-08-23T00:00:00Z"));
  const ran = slots.map((s) => s + 20 * 60_000);
  assert.deepEqual(missedSlots(slots, ran, { nowMs: ms("2026-08-24T00:00:00Z") }), [],
    "a sport with nothing on must not trip the watchdog");
});

test("A SLOT BEFORE THE WORKFLOW EXISTED IS NOT A MISS", () => {
  // The first live run reported five missed slots across UFC and EPL and every one predated the
  // workflow file — 100% false positives, on the very failure this watchdog was shaped to avoid.
  const created = ms("2026-08-18T00:00:00Z");
  const from = ms("2026-08-10T00:00:00Z");
  assert.equal(windowFloor(from, created), created, "the window starts when the job started existing");

  const slots = expectedSlots(["0 7 * * 4,6,0"], windowFloor(from, created), ms("2026-08-19T00:00:00Z"));
  assert.deepEqual(slots, [], "a job created on the 18th has no slots on the 13th");
});

test("an undateable workflow does not get an invented floor", () => {
  const from = ms("2026-08-10T00:00:00Z");
  for (const bad of [NaN, null, undefined]) assert.equal(windowFloor(from, bad), from);
});

/* ── FIRING IS NOT THE SAME AS WORKING ──────────────────────────────────────────────────────────
 *
 * The watchdog knew whether a slot fired and nothing else, so nfl-event-window could fail three
 * consecutive daily runs and still be reported `OK`. These pin the other half of the question.
 */

test("a run that fired and FAILED is not a healthy slot", () => {
  const streak = failureStreak([
    { at: "2026-08-21T21:23:06Z", conclusion: "failure" },
    { at: "2026-08-21T15:39:02Z", conclusion: "failure" },
    { at: "2026-08-21T15:05:03Z", conclusion: "failure" },
    { at: "2026-08-20T21:26:10Z", conclusion: "success" },
  ]);
  assert.equal(streak, 3, "three consecutive failures must count as three, not as three healthy runs");
});

test("the streak counts back from the NEWEST run and stops at the first non-failure", () => {
  // A workflow that failed yesterday and succeeded today is recovered, not failing.
  assert.equal(failureStreak([{ conclusion: "success" }, { conclusion: "failure" }, { conclusion: "failure" }]), 0);
});

test("a timeout is a failure — the job did not do its work", () => {
  assert.equal(failureStreak([{ conclusion: "timed_out" }, { conclusion: "success" }]), 1);
});

test("a CANCELLED run breaks the streak instead of extending it", () => {
  // An operator cancelling a run is a person doing something deliberate, not evidence of a defect.
  // Counting it as a failure would page someone for their own click.
  assert.equal(failureStreak([{ conclusion: "cancelled" }, { conclusion: "failure" }]), 0);
  assert.equal(failureStreak([{ conclusion: "skipped" }]), 0);
});

test("no completed runs is not a failure — absence of evidence is not evidence of breakage", () => {
  assert.equal(failureStreak([]), 0);
  assert.equal(failureStreak(undefined), 0);
});
