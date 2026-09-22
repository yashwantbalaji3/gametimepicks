/**
 * Shadow bookkeeping probes (charter §27.2): pending is not a loss, push/void semantics, the ladder rule,
 * settlement never affects selection, and the adoption gate never adopts on its own.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeLegFromLinescores, gradeCardFromLinescores, advancePosition, policyMetrics, adoptionGate, settledDecimal, ADOPTION_MIN_DECIDED, SHADOW_POLICIES } from "./shadow.mjs";
import { POLICIES } from "./policies.mjs";

const rows = [{ gamePk: 1, isFinal: true, homeRuns: 5, awayRuns: 3 }, { gamePk: 2, isFinal: false, homeRuns: 2, awayRuns: 2 }, { gamePk: 3, isFinal: true, homeRuns: 4, awayRuns: 4 }];

test("grading from linescores: moneyline, run line, total; a non-final game is pending, never a loss", () => {
  assert.equal(gradeLegFromLinescores({ eventId: "1", marketKey: "mlb_moneyline", side: "home" }, rows), "won");
  assert.equal(gradeLegFromLinescores({ eventId: "1", marketKey: "mlb_moneyline", side: "away" }, rows), "lost");
  assert.equal(gradeLegFromLinescores({ eventId: "1", marketKey: "mlb_run_line", side: "away", line: 1.5 }, rows), "lost");
  assert.equal(gradeLegFromLinescores({ eventId: "1", marketKey: "mlb_run_line", side: "home", line: -1.5 }, rows), "won");
  assert.equal(gradeLegFromLinescores({ eventId: "1", marketKey: "mlb_total_runs", side: "over", line: 8 }, rows), "push");
  assert.equal(gradeLegFromLinescores({ eventId: "1", marketKey: "mlb_total_runs", side: "under", line: 8.5 }, rows), "won");
  assert.equal(gradeLegFromLinescores({ eventId: "2", marketKey: "mlb_moneyline", side: "home" }, rows), "pending");
  assert.equal(gradeLegFromLinescores({ eventId: "99", marketKey: "mlb_moneyline", side: "home" }, rows), "pending", "missing game is pending");
  assert.equal(gradeLegFromLinescores({ eventId: "1", marketKey: "nfl_moneyline", side: "home" }, rows), "pending", "an ungradeable market is never guessed");
});

test("card grading: one lost leg loses; one pending leg pends even beside a win; all-push pushes", () => {
  assert.equal(gradeCardFromLinescores({ legs: [{ eventId: "1", marketKey: "mlb_moneyline", side: "home" }, { eventId: "1", marketKey: "mlb_moneyline", side: "away" }] }, rows).status, "lost");
  assert.equal(gradeCardFromLinescores({ legs: [{ eventId: "1", marketKey: "mlb_moneyline", side: "home" }, { eventId: "2", marketKey: "mlb_moneyline", side: "home" }] }, rows).status, "pending");
  assert.equal(gradeCardFromLinescores({ legs: [{ eventId: "1", marketKey: "mlb_total_runs", side: "over", line: 8 }, { eventId: "3", marketKey: "mlb_total_runs", side: "under", line: 8 }] }, rows).status, "push");
  assert.equal(gradeCardFromLinescores({ legs: [{ eventId: "1", marketKey: "mlb_moneyline", side: "home" }, { eventId: "1", marketKey: "mlb_total_runs", side: "over", line: 8 }] }, rows).status, "won", "a push beside a win is a win on the surviving leg");
});

test("ladder rule: won carries the real payout and skips cleared rungs; lost restarts; push holds; final goal completes", () => {
  const w = advancePosition("BB-C1", { step: 1, stake: 100 }, "won", { stake: 100, decimal: 2.0 });
  assert.deepEqual(w, { step: 2, stake: 200, completed: false });
  const skip = advancePosition("BB-C1", { step: 1, stake: 100 }, "won", { stake: 100, decimal: 7.5 });
  assert.deepEqual(skip, { step: 3, stake: 750, completed: false }, "a $750 payout has cleared the $700 rung-3 start");
  assert.deepEqual(advancePosition("BB-C1", { step: 3, stake: 700 }, "lost", { stake: 700, decimal: 2 }), { step: 1, stake: POLICIES["BB-C1"].seed, completed: false });
  assert.deepEqual(advancePosition("BB-C1", { step: 3, stake: 700.75 }, "push", { stake: 700.75, decimal: 2 }), { step: 3, stake: 700.75, completed: false });
  assert.deepEqual(advancePosition("MS-C1", { step: 3, stake: 400 }, "won", { stake: 400, decimal: 2.5 }), { step: 1, stake: 25, completed: true });
});

test("settled decimal: a pushed leg pays 1.0, so a won card with a push rolls on the SURVIVING legs' price (audit I5)", () => {
  const legs = [{ american: -110 }, { american: 150 }];
  assert.equal(settledDecimal(legs, ["won", "won"]), +((1 + 100 / 110) * 2.5).toFixed(4));
  assert.equal(settledDecimal(legs, ["won", "push"]), +(1 + 100 / 110).toFixed(4), "the pushed leg's price is removed");
  assert.equal(settledDecimal(legs, ["push", "push"]), 1, "an all-push card returns the stake");
  assert.equal(settledDecimal(legs, ["won"]), null, "a grade array that does not match the legs is refused, never guessed");
  assert.equal(settledDecimal([{ american: NaN }], ["won"]), null, "an unpriced leg is refused");
  // The ladder rule then advances on the settled decimal: $100 at (-110 won, +150 push) is $190.91, not $477.27.
  const next = advancePosition("BB-C1", { step: 1, stake: 100 }, "won", { stake: 100, decimal: settledDecimal(legs, ["won", "push"]) });
  assert.deepEqual(next, { step: 1, stake: 190.91, completed: false }, "$190.91 has not cleared the $200 rung-2 start");
});

test("metrics: pending is not decided; push is neither win nor loss; survival is over decisive only", () => {
  const rowsM = [{ status: "won", step: 1, jointP: 0.4 }, { status: "lost", step: 1, jointP: 0.4 }, { status: "push", step: 2, jointP: 0.3 }, { status: "pending", step: 2, jointP: 0.3 }, { status: "NO_QUALIFYING_PLAY", reason: "PRICE_UNAVAILABLE", step: 1 }];
  const m = policyMetrics(rowsM);
  assert.equal(m.placed, 4); assert.equal(m.decided, 3); assert.equal(m.pending, 1); assert.equal(m.won, 1); assert.equal(m.lost, 1); assert.equal(m.push, 1);
  assert.equal(m.survivalPerStep, 0.5); assert.equal(m.noPlayLaneDays, 1); assert.deepEqual(m.noPlayByReason, { PRICE_UNAVAILABLE: 1 });
  assert.equal(m.expectedWinsUnderPublishedP, 1.1);
});

test("adoption gate: below the sample floor it is NOT_YET; it never says adopt, only eligible-for-receipt", () => {
  const control = { decided: 30, survivalPerStep: 0.45, placed: 30 };
  assert.equal(adoptionGate({ shadow: { decided: ADOPTION_MIN_DECIDED - 1, survivalPerStep: 0.9, placed: 30 }, control }).state, "NOT_YET");
  assert.equal(adoptionGate({ shadow: { decided: 25, survivalPerStep: 0.44, placed: 30 }, control }).state, "NOT_YET", "survival below control");
  assert.equal(adoptionGate({ shadow: { decided: 25, survivalPerStep: 0.5, placed: 10 }, control }).state, "NOT_YET", "publishes under half as often");
  assert.equal(adoptionGate({ shadow: { decided: 25, survivalPerStep: 0.5, placed: 20 }, control, guardFailures: 1 }).state, "NOT_YET");
  const ok = adoptionGate({ shadow: { decided: 25, survivalPerStep: 0.5, placed: 20 }, control });
  assert.equal(ok.state, "ELIGIBLE_FOR_ADOPTION_RECEIPT"); assert.deepEqual(ok.reasons, []); assert.match(ok.note, /nothing changes on its own/);
});

test("the shadow set is the preregistered one and every named policy exists", () => {
  for (const cfg of Object.values(SHADOW_POLICIES)) for (const n of [cfg.control, ...cfg.shadow]) assert.ok(POLICIES[n], n);
  assert.deepEqual(SHADOW_POLICIES["bank-builder"].shadow, ["BB-C1", "BB-C2b"]);
});
