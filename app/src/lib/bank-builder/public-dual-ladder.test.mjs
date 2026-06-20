import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane A public ladder after settlement: Step 1 + Step 2 cleared (won), advanced toward Step 3, no lost step", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  assert.equal(v.currentStatus, "advanced"); // Step 2 WON → riding to Step 3
  assert.equal(v.steps.length, 5, "five-step ladder");
  // Ladder targets are the canonical $100→$200 ... $3,500→$10,000.
  assert.deepEqual(v.steps.map((s) => [s.startTarget, s.goalTarget]),
    [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]]);
  const s1 = v.steps[0];
  assert.equal(s1.status, "cleared");
  assert.equal(s1.result, "won");
  assert.equal(s1.actualStake, 100);
  assert.ok(s1.actualReturn >= 190 && s1.actualReturn <= 200, "actual return ~$197.88");
  assert.ok(s1.card.legs.some((l) => /Mexico/.test(l.participant)) && s1.card.legs.some((l) => /Soto/.test(l.participant)), "Mexico + Soto in the cleared drawer");
  // Step 2 now CLEARED WON with the USA + Nick Gonzales card.
  const s2 = v.steps[1];
  assert.equal(s2.status, "cleared");
  assert.equal(s2.result, "won");
  assert.ok(s2.card, "cleared Step 2 carries its card");
  assert.equal(s2.actualStake, 197.88, "Step 2 rode the rolled $197.88");
  assert.ok(s2.actualReturn >= 600 && s2.actualReturn <= 700, "actual return ~$601.56");
  assert.ok(s2.card.legs.some((l) => /USA|United States/.test(l.participant)) && s2.card.legs.some((l) => /Gonzales/.test(l.participant)), "USA + Nick Gonzales in the cleared Step 2 card");
  // Step 3 is the next rung the lane is riding toward → "awaiting" (NOT a vague "upcoming"), and it
  // carries a public candidate/reason so the page is actionable. Steps 4-5 stay upcoming.
  assert.equal(v.steps[2].status, "awaiting", "Step 3 is awaiting the next card");
  assert.ok(v.steps[2].candidate, "Step 3 carries a candidate or honest reason (not a blank upcoming row)");
  for (let i = 3; i < 5; i++) assert.equal(v.steps[i].status, "upcoming");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (Lane A never lost)");
});

test("Lane B public ladder after settlement: Step 1 LOST → stopped, shown as a clean queued restart (no lost legs surfaced)", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  assert.equal(v.currentStatus, "queued_restart"); // Step 1 lost → stopped → queued for a clean restart
  assert.equal(v.steps[0].status, "queued");
  for (let i = 1; i < 5; i++) assert.equal(v.steps[i].status, "upcoming");
  // Neither the prior stopped legs NOR the just-lost Turkey/Hoskins step are surfaced publicly.
  const allLegs = JSON.stringify(v.steps.map((s) => s.card));
  assert.ok(!/Goldschmidt/.test(allLegs) && !/Switzerland/.test(allLegs), "no stopped-lane legs in the public view model");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean restart path)");
});

test("DEMO: awaiting/queued steps surface a candidate or honest reason — never a blank actionable row", () => {
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  const aw = a.steps.find((s) => s.status === "awaiting");
  assert.ok(aw, "Lane A has an awaiting next step");
  assert.ok(aw.candidate && aw.candidate.reason.length > 20, "awaiting step carries a specific reason");
  assert.equal(aw.card, null, "awaiting step has no placed card (candidate-only — no fabricated legs)");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  const q = b.steps.find((s) => s.status === "queued");
  assert.ok(q, "Lane B queued restart step present");
  assert.ok(q.candidate && q.candidate.reason.length > 20, "queued restart carries a specific reason");
});

test("DEMO: candidate-only lanes count NO exposure (Mr. Dub stays $0 until a card is placed)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "no exposure from awaiting candidates");
  assert.equal(mr.totalOpenExposure, 0, "no total exposure from candidates");
  // Candidates carry no real money — they are 'pending' / 'awaiting_approval', never 'active'/'placed'.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  for (const lane of [bbRaw.laneA, bbRaw.laneB]) {
    if (lane.nextCandidate) assert.ok(["pending", "awaiting_approval"].includes(lane.nextCandidate.status), "candidate is pending/awaiting, not placed");
  }
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
