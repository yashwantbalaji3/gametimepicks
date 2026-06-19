import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane A public ladder: Step 1 cleared (won card), Step 2 ACTIVE (USA + Nick Gonzales), 3-5 upcoming, no lost step", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  assert.equal(v.currentStatus, "active"); // Step 2 card now placed → active
  assert.equal(v.steps.length, 5, "five-step ladder");
  // Ladder targets are the canonical $100→$200 ... $3,500→$10,000.
  assert.deepEqual(v.steps.map((s) => [s.startTarget, s.goalTarget]),
    [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]]);
  const s1 = v.steps[0];
  assert.equal(s1.status, "cleared");
  assert.equal(s1.result, "won");
  assert.ok(s1.card, "cleared step carries its card");
  assert.equal(s1.actualStake, 100);
  assert.ok(s1.actualReturn >= 190 && s1.actualReturn <= 200, "actual return ~$197.88");
  assert.ok(s1.card.legs.some((l) => /Mexico/.test(l.participant)) && s1.card.legs.some((l) => /Soto/.test(l.participant)), "Mexico + Soto in the cleared drawer");
  assert.ok(s1.card.legs.every((l) => l.settlementResult === "won"), "both legs won");
  // Step 2 now ACTIVE with the placed USA + Griffin Jax card.
  const s2 = v.steps[1];
  assert.equal(s2.status, "active");
  assert.ok(s2.card, "active Step 2 carries its placed card");
  assert.equal(s2.actualStake, 197.88, "Step 2 rides the rolled $197.88");
  assert.ok(s2.actualReturn >= 600 && s2.actualReturn <= 750, "projected ~$617.63 in target band");
  assert.ok(s2.card.legs.some((l) => /USA|United States/.test(l.participant)) && s2.card.legs.some((l) => /Gonzales/.test(l.participant)), "USA + Nick Gonzales in the active Step 2 card (Jax replaced)");
  for (let i = 2; i < 5; i++) assert.equal(v.steps[i].status, "upcoming");
  // No step exposes a lost result.
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced");
});

test("Lane B public ladder: Step 1 ACTIVE (Turkey + Gelof restart), no Goldschmidt/Switzerland stopped card", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  assert.equal(v.currentStatus, "active"); // restart Step 1 card placed → active
  assert.equal(v.steps[0].status, "active");
  assert.equal(v.steps[0].actualStake, 100, "fresh restart from $100");
  assert.ok(v.steps[0].card, "active Step 1 carries the restart card");
  assert.ok(v.steps[0].actualReturn >= 190 && v.steps[0].actualReturn <= 220, "projected ~$203.01");
  for (let i = 1; i < 5; i++) assert.equal(v.steps[i].status, "upcoming");
  // The stopped Step 2 (Switzerland + Goldschmidt) is NEVER surfaced publicly — clean restart.
  const allLegs = JSON.stringify(v.steps.map((s) => s.card));
  assert.ok(!/Goldschmidt/.test(allLegs) && !/Switzerland/.test(allLegs), "no stopped-lane legs in the public view model");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced");
});

test("queued restart maps a stopped lane to a clean starting path (publicVisible false ignored steps)", () => {
  // A synthetic stopped lane carrying a lost step must still produce a clean queued ladder.
  const stopped = {
    label: "Lane B", legs: [], survivalScore: 0, combinedOdds: null, result: null, advanced: false,
    currentStep: 2, target: 10000, laneStatus: "stopped", publicVisible: false,
    restart: { status: "queued", stake: 100, step: 1, note: "x" },
    steps: [
      { step: 1, status: "settled", result: "won", legs: [{ participant: "Ghana" }], stake: 100, payout: 217 },
      { step: 2, status: "settled", result: "lost", legs: [{ participant: "Goldschmidt" }], stake: 217, payout: null },
    ],
  };
  const v = buildPublicDualLadder(stopped, "lane-b");
  assert.equal(v.currentStatus, "queued_restart");
  assert.ok(v.steps.every((s) => s.card === null), "no card from a stopped lane");
  assert.ok(!JSON.stringify(v).includes("Goldschmidt"), "lost leg never reaches the view model");
});
