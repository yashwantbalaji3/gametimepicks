import test from "node:test";
import assert from "node:assert/strict";
import { LEG, CARD, TRANSITION, gradeCard, nextPosition, cardIdentity, settlementIsNew } from "./lifecycle.mjs";

test("a losing leg decides the card even while other legs are unfinished", () => {
  assert.equal(gradeCard([LEG.LOST, LEG.PENDING, LEG.PENDING]), CARD.LOST);
  assert.equal(gradeCard([LEG.WON, LEG.LOST]), CARD.LOST);
  // and it is the ONLY early decision: three wins and one pending is not yet a win
  assert.equal(gradeCard([LEG.WON, LEG.WON, LEG.PENDING]), CARD.PENDING);
});

test("an unavailable leg holds the card — a scratch is not a loss", () => {
  assert.equal(gradeCard([LEG.WON, LEG.UNAVAILABLE]), CARD.PENDING);
  // but it cannot rescue a card that already lost
  assert.equal(gradeCard([LEG.LOST, LEG.UNAVAILABLE]), CARD.LOST);
});

test("an empty card is pending, never a win", () => {
  // The whole product spent nineteen days with zero-leg lanes. If gradeCard treated the vacuous
  // every() as a win, the repair would have advanced a ladder on cards that were never placed.
  assert.equal(gradeCard([]), CARD.PENDING);
  assert.equal(gradeCard(undefined), CARD.PENDING);
});

test("all-push is VOID, and a push among winners does not block the win", () => {
  assert.equal(gradeCard([LEG.PUSH, LEG.PUSH]), CARD.VOID);
  assert.equal(gradeCard([LEG.WON, LEG.PUSH]), CARD.WON);
  assert.equal(gradeCard([LEG.WON, LEG.WON]), CARD.WON);
});

test("a win advances one rung and only one", () => {
  const r = nextPosition({ cycle: 3, step: 1, maxStep: 5 }, CARD.WON);
  assert.deepEqual([r.cycle, r.step, r.transition, r.closedCycle], [3, 2, TRANSITION.ADVANCE, false]);
});

test("clearing the FINAL rung completes the cycle rather than inventing a step", () => {
  const r = nextPosition({ cycle: 3, step: 5, maxStep: 5 }, CARD.WON);
  assert.deepEqual([r.cycle, r.step, r.closedCycle], [4, 1, true]);
  assert.match(r.reason, /completes/);
});

test("a loss closes the cycle and opens the next at step 1 — once", () => {
  const r = nextPosition({ cycle: 3, step: 4, maxStep: 5 }, CARD.LOST);
  assert.deepEqual([r.cycle, r.step, r.transition, r.closedCycle], [4, 1, TRANSITION.RESTART, true]);
  // applying the SAME loss to the resulting position must not close a second cycle; that is the
  // settler's job via settlementIsNew, and this asserts the position itself is stable input.
  const again = nextPosition({ cycle: 4, step: 1, maxStep: 5 }, CARD.PENDING);
  assert.deepEqual([again.cycle, again.step], [4, 1]);
});

test("VOID holds position — it is neither a win nor a loss nor permanent pending", () => {
  const r = nextPosition({ cycle: 3, step: 2, maxStep: 5 }, CARD.VOID);
  assert.deepEqual([r.cycle, r.step, r.transition, r.closedCycle], [3, 2, TRANSITION.NEUTRAL, false]);
  assert.notEqual(r.transition, TRANSITION.HOLD);   // closed, not stranded
});

test("PENDING holds position and is distinguishable from VOID", () => {
  const r = nextPosition({ cycle: 3, step: 2 }, CARD.PENDING);
  assert.deepEqual([r.cycle, r.step, r.transition], [3, 2, TRANSITION.HOLD]);
});

test("an unknown card result throws rather than silently holding", () => {
  assert.throws(() => nextPosition({ cycle: 1, step: 1 }, "settled"), /not a card result/);
  assert.throws(() => nextPosition({ cycle: 1, step: 1 }, undefined), /not a card result/);
});

test("card identity separates rungs, cycles, lanes and dates", () => {
  const base = { product: "bank-builder", lane: "A", cycle: 3, step: 1, slateDate: "2026-08-17" };
  assert.equal(cardIdentity(base), "bank-builder:a:c3:s1:2026-08-17");
  // step 1 of cycle 3 and step 1 of cycle 4 are different cards even on the same date
  assert.notEqual(cardIdentity(base), cardIdentity({ ...base, cycle: 4 }));
  assert.notEqual(cardIdentity(base), cardIdentity({ ...base, lane: "B" }));
  assert.notEqual(cardIdentity(base), cardIdentity({ ...base, slateDate: "2026-08-18" }));
  for (const missing of ["product", "lane", "cycle", "step", "slateDate"]) {
    assert.throws(() => cardIdentity({ ...base, [missing]: undefined }), new RegExp(missing));
  }
});

test("a decided card is never re-graded, and pending never overwrites", () => {
  assert.equal(settlementIsNew(null, CARD.WON), true);
  assert.equal(settlementIsNew(CARD.PENDING, CARD.LOST), true);
  assert.equal(settlementIsNew(CARD.WON, CARD.LOST), false);   // no restatement
  assert.equal(settlementIsNew(CARD.LOST, CARD.WON), false);
  assert.equal(settlementIsNew(CARD.WON, CARD.PENDING), false); // no un-settling
  assert.equal(settlementIsNew(null, CARD.PENDING), false);     // nothing to record yet
});

test("MUTATION PROBE: the suite fails if all-push silently becomes a win", () => {
  // Guards the exact defect the charter names — a refund counted as progress. If gradeCard ever
  // returns WON for all-push, nextPosition advances the ladder on money that never moved.
  const voided = gradeCard([LEG.PUSH, LEG.PUSH, LEG.PUSH]);
  assert.equal(voided, CARD.VOID);
  assert.equal(nextPosition({ cycle: 2, step: 3, maxStep: 5 }, voided).step, 3);
});
