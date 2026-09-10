import test from "node:test";
import assert from "node:assert/strict";
import { laneDisplayFromReceipts } from "./receipt-lane-display.ts";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";

const pos = (nextStep, rolledStake, extra = {}) => ({ lane: "B", state: "ready", nextStep, clearedSteps: nextStep - 1, rolledStake, targetReturn: 700, cycle: 3, why: "", basis: null, ...extra });
const won = (date, step, stake, payout) => ({ date, step, stake, result: "won", payout });

test("THE CARD ON THE TABLE WINS · today's Step-1 $100 card is drawn on rung 1, even though the receipts say Step 2", () => {
  const lane = laneDisplayFromReceipts({ letter: "B", position: pos(2, 300.85), run: [won("2026-09-09", 1, 100, 300.85)], card: { step: 1, stake: 100, combinedOdds: 208, potentialReturn: 308, date: "2026-09-10" }, waitingReason: null });
  const view = buildPublicDualLadder(lane, "lane-b");
  assert.equal(view.currentStep, 1);
  assert.equal(view.steps.find((s) => s.status === "active")?.step, 1);
  assert.equal(view.steps.filter((s) => s.status === "cleared").length, 0, "no rung is drawn as cleared beneath a restarted card");
});

test("no card yet → the lane stands on the receipts' rung, carrying the real payout", () => {
  const lane = laneDisplayFromReceipts({ letter: "B", position: pos(2, 300.85), run: [won("2026-09-09", 1, 100, 300.85)], card: null, waitingReason: "no pair reaches +133 today" });
  const view = buildPublicDualLadder(lane, "lane-b");
  assert.equal(view.currentStep, 2);
  const cleared = view.steps.filter((s) => s.status === "cleared");
  assert.deepEqual(cleared.map((s) => s.step), [1]);
  assert.equal(view.steps.find((s) => s.step === 2)?.carriedStake, 300.85, "Step 2 carries what Step 1 really paid");
  assert.equal(lane.nextCandidate?.reason, "no pair reaches +133 today");
});

test("a card dealt at the receipts' rung draws the run's wins beneath it", () => {
  const lane = laneDisplayFromReceipts({ letter: "A", position: pos(3, 720), run: [won("2026-09-11", 1, 100, 210), won("2026-09-12", 2, 210, 720)], card: { step: 3, stake: 720, combinedOdds: 100, potentialReturn: 1440, date: "2026-09-13" }, waitingReason: null });
  const view = buildPublicDualLadder(lane, "lane-a");
  assert.equal(view.currentStep, 3);
  assert.deepEqual(view.steps.filter((s) => s.status === "cleared").map((s) => s.step), [1, 2]);
});

test("a HELD lane says why it has no new card", () => {
  const lane = laneDisplayFromReceipts({ letter: "A", position: pos(2, 204, { state: "held", why: "the 2026-09-10 Step 2 card is still open" }), run: [], card: null, waitingReason: null });
  assert.match(lane.nextCandidate?.reason ?? "", /still open/);
});
