/**
 * UFC STALE-CARD GATE (Sprint 018 · Phase 3 — product honesty; re-anchored at the 2026-07-30 cleanup).
 *
 * The original bug: /ufc decided "is this the next card?" by comparing the newest SETTLED event's name
 * to the current card's name, so UFC 329 (2026-07-11) was still presented as "Next · upcoming" two
 * weeks after it happened. The guarantee is that a settled or past card is NEVER presented as upcoming.
 *
 * The hub is now retired — /ufc is the settled archive — so the guarantee is enforced structurally:
 * the page renders nothing as upcoming at all. A newer card that was never officially settled may only
 * appear as an explicit no-record note (name-mismatch driven), and the shared isEventPast() date rule
 * that fixed the original bug stays pinned for the loaders that still classify events by date.
 *
 * Run: npx tsx --test src/lib/ufc-stale-card-gate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { isEventPast } from "./home/load-spotlight.ts";

const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "ufc", "page.tsx"), "utf8");

test("nothing on /ufc is presented as upcoming — the only event content is the OFFICIAL settled record", () => {
  // Known-positive: the settled record renders behind the official-final gate.
  assert.match(page, /settlement\.status === "final" \? settlement : null/, "official-final gate present");
  // Known-negative: none of the upcoming-presentation chrome survives.
  for (const banned of ["Next ·", "notUpcoming", "heroStats", "fightReports", "engineRows", "ShellTab"]) {
    assert.ok(!page.includes(banned), `no upcoming-card chrome: "${banned}" must not appear`);
  }
});

test("a newer never-settled card renders ONLY as a no-record note, keyed off a settled-name mismatch", () => {
  assert.match(page, /sched\.eventName !== settled\.event/, "the note requires a name mismatch with the settled event");
  assert.match(page, /before the event; no model picks were published/, "the card is framed strictly in the past");
  assert.match(page, /no official settlement was ingested/, "the missing settlement is stated, never papered over");
});

test("settled-specific copy keys off the OFFICIAL settlement — a past card is never claimed to be settled", () => {
  // "Officially settled" copy renders only inside the settled branch; the unsettled branch claims no record.
  assert.match(page, /Officially settled \{settledOn\}/, "settled date renders in the settled branch only");
  assert.match(page, /No officially settled UFC record is available/, "the unsettled state claims nothing");
});

test("isEventPast is the shared rule and behaves correctly at the boundary", () => {
  assert.equal(isEventPast("2026-07-25", "2026-07-11T00:00:00Z"), true, "two weeks ago is past");
  assert.equal(isEventPast("2026-07-25", "2026-07-25T23:00:00Z"), false, "same day is NOT past — card is tonight");
  assert.equal(isEventPast("2026-07-25", "2026-08-01T00:00:00Z"), false, "future is not past");
  assert.equal(isEventPast("2026-07-25", undefined), false, "unknown date fails OPEN (never hides a real card)");
});

test("real artifact: the shipped UFC card is correctly classified today", () => {
  const dir = path.join(process.cwd(), "public", "data", "ufc");
  const sched = JSON.parse(fs.readFileSync(path.join(dir, "schedule-latest.json"), "utf8"));
  assert.ok(sched.eventDate, "the schedule artifact carries an eventDate to gate on");
  // Whatever today is, the classification must be a pure function of the two dates — asserted, not assumed.
  const asOf = "2026-07-25";
  const past = isEventPast(asOf, sched.eventDate);
  assert.equal(past, sched.eventDate.slice(0, 10) < asOf, "classification matches a plain date comparison");
});
