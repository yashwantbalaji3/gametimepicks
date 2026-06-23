import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane A public ladder after settlement: Steps 1 + 2 + 3 cleared (won), Step 3 settled WON (Egypt + Algeria official), lane awaiting next card, no lost step", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Step 3 (Egypt + Algeria) settled WON (official) → all real steps cleared, lane awaiting the next qualified card.
  assert.equal(v.currentStatus, "awaiting_next_card");
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
  // Step 3 now settled WON (official) — cleared, riding the rolled $601.56 → ~$1,464.71.
  // Legs are Egypt ML (June 21) + Algeria ML (June 22), both graded hit (official, API-Football).
  const s3 = v.steps[2];
  assert.equal(s3.status, "cleared", "Step 3 settled WON → cleared");
  assert.equal(s3.result, "won");
  assert.ok(s3.card, "Step 3 carries its settled card");
  assert.equal(s3.actualStake, 601.56, "Step 3 rode the rolled $601.56");
  assert.ok(s3.actualReturn >= 1400 && s3.actualReturn <= 1500, "actual return ~$1,464.71");
  assert.ok(s3.card.legs.some((l) => /Egypt/.test(l.participant)) && s3.card.legs.some((l) => /Algeria/.test(l.participant)), "Egypt + Algeria in the cleared Step 3 card");
  // No active step — all 3 real steps cleared; Step 4 awaits the next qualified card, Step 5 upcoming.
  assert.ok(v.steps.every((s) => s.status !== "active"), "no active step — lane awaiting next card");
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 3, "three steps cleared");
  assert.equal(v.steps[3].status, "awaiting", "Step 4 awaits the next qualified card");
  assert.equal(v.steps[4].status, "upcoming");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (Lane A never lost)");
});

test("Lane B public ladder after restart: Step 1 SETTLED WON (cross-slate restart cleared), no lost legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // Lane B Step 1 restart (approved broader criteria) settled WON (official) → cleared, awaiting next card.
  assert.equal(v.currentStatus, "awaiting_next_card");
  assert.equal(v.steps[0].status, "cleared");
  assert.equal(v.steps[0].result, "won", "Lane B Step 1 cleared WON");
  assert.equal(v.steps[0].actualStake, 100, "fresh $100 Lane B restart");
  assert.ok(v.steps[0].actualReturn >= 270 && v.steps[0].actualReturn <= 280, "actual return ~$277.11");
  assert.ok(v.steps[0].card, "Step 1 carries its settled restart card");
  // Restart legs: Argentina ML + France/Iraq Under 3.5 (June 22), both graded hit (official).
  assert.ok(v.steps[0].card.legs.some((l) => /Argentina/.test(l.participant)) && v.steps[0].card.legs.some((l) => /Under 3\.5/.test(l.participant)), "Argentina + France/Iraq Under 3.5 in the cleared Step 1 restart card");
  assert.equal(v.steps[1].status, "awaiting", "Step 2 awaits the next qualified card");
  for (let i = 2; i < 5; i++) assert.equal(v.steps[i].status, "upcoming");
  // The prior stopped legs (Goldschmidt/Switzerland) and the prior lost Turkey/Hoskins step are NOT surfaced publicly.
  const allLegs = JSON.stringify(v.steps.map((s) => s.card));
  assert.ok(!/Goldschmidt/.test(allLegs) && !/Switzerland/.test(allLegs), "no stopped-lane legs in the public view model");
  assert.ok(!/Hoskins/.test(allLegs) && !/Turkey/.test(allLegs), "the prior lost Turkey/Hoskins step is not surfaced publicly");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean restart path)");
});

test("DEMO: cleared steps surface a settled card with real legs — never a blank actionable row; both lanes await the next card", () => {
  // Lane A Step 3 settled WON (cleared); Lane B's Step 1 restart settled WON (cleared) — both surface a
  // real card with real legs, and neither has a blank active row (both await the next qualified card).
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "awaiting_next_card", "Lane A awaiting next card (no active step)");
  assert.ok(!a.steps.some((s) => s.status === "active"), "Lane A has no active step — all real steps cleared");
  const aCleared = a.steps.find((s) => s.status === "cleared");
  assert.ok(aCleared, "Lane A has a cleared step");
  assert.ok(aCleared.card && aCleared.card.legs.length >= 2, "cleared step carries a settled card with real legs (not a blank row)");
  assert.ok(aCleared.actualStake && aCleared.actualReturn, "cleared step carries real stake + settled return");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "awaiting_next_card", "Lane B awaiting next card (no active step)");
  const bCleared = b.steps.find((s) => s.status === "cleared");
  assert.ok(bCleared, "Lane B cleared (settled WON) restart step present");
  assert.ok(bCleared.card && bCleared.card.legs.length >= 2, "cleared restart carries a settled card with real legs");
});

test("DEMO: both lanes settled WON → no open exposure (Lane A Step 3 cleared, Lane B Step 1 cleared; total $0; moonshot settled → 0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "Lane A Step 3 settled WON released its seed; Lane B settled WON released its seed");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  // Lane A Step 3 settled WON (Egypt + Algeria, official); Lane B Step 1 settled WON — no open exposure on either.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  const laneAStep3 = bbRaw.laneA.steps.find((s) => s.step === 3);
  const laneBStep1 = bbRaw.laneB.steps.find((s) => s.step === 1);
  assert.equal(laneAStep3.status, "settled", "Lane A Step 3 card settled (WON)");
  assert.equal(laneAStep3.result, "won", "Lane A Step 3 settled WON (Egypt ML + Algeria ML, official)");
  assert.equal(laneBStep1.status, "settled", "Lane B Step 1 restart card settled (WON)");
  assert.equal(laneBStep1.result, "won", "Lane B Step 1 restart settled WON (Argentina ML + France/Iraq Under 3.5, official)");
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
