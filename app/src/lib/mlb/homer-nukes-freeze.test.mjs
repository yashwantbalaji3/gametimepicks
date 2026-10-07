/**
 * Stage 5D groundwork: Homer Nukes Top-5 membership is append-only per revision and cannot change once any game
 * on the board has started. Synthetic fixtures; no live data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendRevision, boardOfRecord, verifyFrozen, membershipOf, REFUSAL } from "./homer-nukes-freeze.mjs";

const pick = (id, gameDate, probability = 0.2) => ({ playerId: id, player: `P${id}`, teamAbbr: "T", gamePk: 1000 + id, gameDate, probability });
const board = (picks, generatedAt = "2026-10-06T12:00:00Z") => ({ date: "2026-10-06", generatedAt, model: { id: "mlb-homer-nukes-v1", state: "PUBLIC_EXPERIMENTAL" }, picks });
const EARLY = "2026-10-06T22:00:00Z", LATE = "2026-10-07T01:30:00Z";

test("first build is revision 1; an identical rebuild appends nothing", () => {
  const b = board([pick(1, EARLY), pick(2, LATE)]);
  const a = appendRevision(null, b, "2026-10-06T12:00:00Z");
  assert.equal(a.appended, true);
  assert.equal(boardOfRecord(a.log).revision, 1);
  assert.equal(boardOfRecord(a.log).firstPitchUtc, "2026-10-06T22:00:00.000Z");
  const again = appendRevision(a.log, b, "2026-10-06T15:00:00Z");
  assert.equal(again.appended, false); assert.equal(again.reason, null);
  assert.equal(again.log.revisions.length, 1);
});

test("a pregame change is a new revision; the earlier one is kept, never rewritten", () => {
  const r1 = appendRevision(null, board([pick(1, EARLY), pick(2, LATE)]), "2026-10-06T12:00:00Z").log;
  const r2 = appendRevision(r1, board([pick(3, LATE), pick(1, EARLY)]), "2026-10-06T17:00:00Z");
  assert.equal(r2.appended, true);
  assert.equal(r2.log.revisions.length, 2);
  assert.deepEqual(r2.log.revisions[0], r1.revisions[0]);
  assert.deepEqual(r1.revisions.length, 1, "input log untouched");
  assert.deepEqual(verifyFrozen(r2.log), []);
});

test("after any member's first pitch nothing changes: no add, drop, re-rank or re-price", () => {
  const r1 = appendRevision(null, board([pick(1, EARLY), pick(2, LATE)]), "2026-10-06T12:00:00Z").log;
  // pick 1's game started at 22:00; a 23:00 rebuild that drops pick 1 for pick 3 is refused
  const late = appendRevision(r1, board([pick(2, LATE), pick(3, LATE)]), "2026-10-06T23:00:00Z");
  assert.equal(late.appended, false); assert.equal(late.reason, REFUSAL.STARTED);
  // the same holds even if the NEW board's games are all later: the started pick cannot be swapped out
  assert.equal(appendRevision(r1, board([pick(4, LATE)]), "2026-10-06T22:00:00Z").reason, REFUSAL.STARTED, "at first pitch exactly is too late");
  // a first build made after the board's first pitch is refused too
  assert.equal(appendRevision(null, board([pick(1, EARLY)]), "2026-10-06T22:30:00Z").reason, REFUSAL.STARTED);
});

test("fail closed: an unknown start, no picks, a clock going backwards, or a different date are refused", () => {
  assert.equal(appendRevision(null, board([pick(1, null)]), "2026-10-06T12:00:00Z").reason, REFUSAL.START_UNKNOWN);
  assert.equal(appendRevision(null, board([]), "2026-10-06T12:00:00Z").reason, REFUSAL.NO_PICKS);
  const r1 = appendRevision(null, board([pick(1, LATE)]), "2026-10-06T15:00:00Z").log;
  assert.equal(appendRevision(r1, board([pick(2, LATE)]), "2026-10-06T14:00:00Z").reason, REFUSAL.NOT_AFTER_LAST);
  assert.equal(appendRevision(r1, { ...board([pick(2, LATE)]), date: "2026-10-07" }, "2026-10-06T16:00:00Z").reason, REFUSAL.DATE_MISMATCH);
  assert.throws(() => appendRevision(null, board([pick(1, LATE)]), "not a time"));
});

test("verifyFrozen catches a hand-edited log that replaced a started pick", () => {
  const log = { revisions: [
    { revision: 1, publishedAt: "2026-10-06T12:00:00Z", members: membershipOf(board([pick(1, EARLY)])) },
    { revision: 2, publishedAt: "2026-10-06T23:00:00Z", members: membershipOf(board([pick(2, LATE)])) },
  ] };
  assert.ok(verifyFrozen(log).some((m) => m.includes("after first pitch")));
  assert.deepEqual(verifyFrozen({ revisions: [] }), ["no revisions: membership was never frozen"]);
});
