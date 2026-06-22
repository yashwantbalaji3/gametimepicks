import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane A public ladder after settlement: Step 1 + Step 2 cleared (won), Step 3 ACTIVE (cross-slate card placed), no lost step", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Step 3 now carries a placed (pending) cross-slate card → the lane shows an ACTIVE card.
  assert.equal(v.currentStatus, "active");
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
  // Step 3 now carries a PLACED (pending) cross-slate card → "active", riding the rolled $601.56.
  // Legs are Egypt ML (June 21) + Algeria ML (June 22) under the approved broader criteria.
  const s3 = v.steps[2];
  assert.equal(s3.status, "active", "Step 3 is an active cross-slate card");
  assert.ok(s3.card, "Step 3 carries its placed card");
  assert.equal(s3.actualStake, 601.56, "Step 3 rides the rolled $601.56");
  assert.ok(s3.actualReturn >= 1400 && s3.actualReturn <= 1500, "projected return ~$1,464.71");
  assert.ok(s3.card.legs.some((l) => /Egypt/.test(l.participant)) && s3.card.legs.some((l) => /Algeria/.test(l.participant)), "Egypt + Algeria in the active Step 3 card");
  for (let i = 3; i < 5; i++) assert.equal(v.steps[i].status, "upcoming");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (Lane A never lost)");
});

test("Lane B public ladder after restart: Step 1 ACTIVE (fresh cross-slate restart card), no lost legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // Lane B was resumed ACTIVE with a fresh $100 Step 1 restart card (approved broader criteria).
  assert.equal(v.currentStatus, "active");
  assert.equal(v.steps[0].status, "active");
  assert.equal(v.steps[0].actualStake, 100, "fresh $100 Lane B restart");
  assert.ok(v.steps[0].card, "Step 1 carries its placed restart card");
  // Restart legs: Argentina ML + France/Iraq Under 3.5 (June 22).
  assert.ok(v.steps[0].card.legs.some((l) => /Argentina/.test(l.participant)) && v.steps[0].card.legs.some((l) => /Under 3\.5/.test(l.participant)), "Argentina + France/Iraq Under 3.5 in the active Step 1 restart card");
  for (let i = 1; i < 5; i++) assert.equal(v.steps[i].status, "upcoming");
  // The prior stopped legs (Goldschmidt/Switzerland) and the prior lost Turkey/Hoskins step are NOT surfaced publicly.
  const allLegs = JSON.stringify(v.steps.map((s) => s.card));
  assert.ok(!/Goldschmidt/.test(allLegs) && !/Switzerland/.test(allLegs), "no stopped-lane legs in the public view model");
  assert.ok(!/Hoskins/.test(allLegs) && !/Turkey/.test(allLegs), "the prior lost Turkey/Hoskins step is not surfaced publicly");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean restart path)");
});

test("DEMO: active steps surface a placed card with real legs — never a blank actionable row", () => {
  // Both lanes were resumed ACTIVE with placed cross-slate cards — the actionable row is a real card.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  const aActive = a.steps.find((s) => s.status === "active");
  assert.ok(aActive, "Lane A has an active step");
  assert.ok(aActive.card && aActive.card.legs.length >= 2, "active step carries a placed card with real legs (not a blank row)");
  assert.ok(aActive.actualStake && aActive.actualReturn, "active step carries real stake + projected return");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  const bActive = b.steps.find((s) => s.status === "active");
  assert.ok(bActive, "Lane B active restart step present");
  assert.ok(bActive.card && bActive.card.legs.length >= 2, "active restart carries a placed card with real legs");
});

test("DEMO: placed (pending) lane cards count real exposure (Lane A core $100 + Lane B core $100 = $200; +$25 moonshot = $225)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 200, "Lane A + Lane B core seeds are open exposure");
  assert.equal(mr.totalOpenExposure, 225, "core $200 + moonshot $25");
  // Lane A Step 3 + Lane B Step 1 are PLACED (pending) cards — they carry real exposure.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  const laneAStep3 = bbRaw.laneA.steps.find((s) => s.step === 3);
  const laneBStep1 = bbRaw.laneB.steps.find((s) => s.step === 1);
  assert.equal(laneAStep3.status, "pending", "Lane A Step 3 is a placed (pending) card");
  assert.equal(laneBStep1.status, "pending", "Lane B Step 1 is a placed (pending) restart card");
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
