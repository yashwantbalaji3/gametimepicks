import { test } from "node:test";
import assert from "node:assert/strict";
import { initializeLane, openLaneCard, settleLaneCard } from "./independent-lane-rollover.mjs";
const initial = (lane = "A", product = "bank-builder", seed = 10000) => initializeLane({ product, lane, seedCents: seed, nextStakeCents: seed, cycle: 1, step: 1, maxStep: product === "moonshot" ? 3 : 5, effectiveAt: "2026-09-09T00:00:00Z", openingEvidence: "verified fixture opening balance" });
const open = (lane, cardId = "card-1") => openLaneCard(lane, { cardId, generatedAt: cardId === "card-2" ? "2026-09-10T10:00:00Z" : "2026-09-09T10:00:00Z", lockAt: cardId === "card-2" ? "2026-09-10T18:00:00Z" : "2026-09-09T18:00:00Z", stakeCents: lane.nextStakeCents });
const settle = (lane, result, returnedCents, cardId = "card-1") => settleLaneCard(lane, { cardId, result, returnedCents, settledAt: cardId === "card-2" ? "2026-09-11T02:00:00Z" : "2026-09-10T02:00:00Z", sourceReceipt: `official:${cardId}` });
test("independent lanes roll exact gross proceeds or restart at their own seeds", () => {
  for (const product of ["bank-builder", "moonshot"]) {
    const seed = product === "moonshot" ? 2500 : 10000;
    const a = open(initial("A", product, seed)), b = open(initial("B", product, seed + 500));
    const aWon = settle(a, "won", seed * 3 + 17), bLost = settle(b, "lost", 0);
    assert.equal(aWon.nextStakeCents, seed * 3 + 17); assert.equal(aWon.step, 2);
    assert.equal(bLost.nextStakeCents, seed + 500); assert.equal(bLost.step, 1); assert.equal(bLost.cycle, 2);
    assert.equal(a.nextStakeCents, seed); assert.equal(b.openCard.cardId, "card-1");
    const aLost = settle(open(aWon, "card-2"), "lost", 0, "card-2");
    assert.equal(aLost.nextStakeCents, seed); assert.equal(Object.keys(aLost.settlements).length, 2);
  }
});
test("duplicate generation and settlement are no-ops; conflicting receipts refuse", () => {
  const a = open(initial()); assert.equal(open(a), a);
  const won = settle(a, "won", 24567); assert.equal(settle(won, "won", 24567), won);
  assert.throws(() => settle(won, "lost", 0), /conflicting/);
  assert.throws(() => open(won), /reopen/);
  assert.throws(() => open(a, "different"), /different open card/);
  assert.throws(() => open(won, "too-early"), /precede the settlement/);
});
test("void returns current rolled stake and holds the rung; no-play does not create a card", () => {
  const won = settle(open(initial()), "won", 28000);
  const neutral = settle(open(won, "card-2"), "void", 28000, "card-2");
  assert.equal(neutral.nextStakeCents, 28000); assert.equal(neutral.step, 2); assert.equal(neutral.cycle, 1);
  assert.equal(neutral.openCard, null); assert.equal(neutral.state, "AWAITING_QUALIFIED_CARD");
});
test("final rung starts next cycle while preserving approved proceeds rollover", () => {
  const start = { ...initial(), step: 5, nextStakeCents: 350000 };
  const won = settle(open(start), "won", 1000000);
  assert.equal(won.cycle, 2); assert.equal(won.step, 1); assert.equal(won.nextStakeCents, 1000000);
});
test("official cancellation may void before kickoff, but cannot invent an early win", () => {
  const lane = open(initial());
  const receipt = { cardId: "card-1", result: "void", returnedCents: 10000, settledAt: "2026-09-09T12:00:00Z", sourceReceipt: "official:cancelled" };
  assert.equal(settleLaneCard(lane, receipt).nextStakeCents, 10000);
  assert.throws(() => settleLaneCard(lane, { ...receipt, result: "won", returnedCents: 20000 }), /before first event/);
  assert.throws(() => settleLaneCard(lane, { ...receipt, settledAt: "2026-09-09T09:00:00Z" }), /before card generation/);
});
test("bad money, retrospective opening and unsupported returns refuse", () => {
  assert.throws(() => initial("A", "bank-builder", 1.5));
  assert.throws(() => openLaneCard(initial(), { cardId: "x", stakeCents: 999, generatedAt: "2026-09-09T10:00Z", lockAt: "2026-09-09T18:00Z" }), /own available/);
  assert.throws(() => settle(open(initial()), "void", 1), /actual stake/);
  assert.throws(() => settle(open(initial()), "won", 10000), /above stake/);
  assert.throws(() => settle(open(initial()), "lost", 1), /cannot return/);
});
