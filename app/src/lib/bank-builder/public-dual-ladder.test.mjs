import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane A public ladder after June-24 settlement: all 5 steps cleared (won) → ladder COMPLETED at Step 5 (Morocco + Bosnia + Brazil Over 2.5 official, $10,089.23), no lost step", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Lane A's Step 5 (Morocco ML + Bosnia ML + Scotland/Brazil Over 2.5) settled WON (official) → every real
  // step is cleared and the $10k ladder is COMPLETE. A fully-cleared ladder is surfaced as the celebrated
  // terminal "completed" state (banking is operator-gated), not the generic "active" fall-through.
  assert.equal(v.currentStatus, "completed");
  assert.match(v.headline, /\$10K REACHED|ladder COMPLETE/i, "headline celebrates the completion");
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
  // Step 2 CLEARED WON with the USA + Nick Gonzales card.
  const s2 = v.steps[1];
  assert.equal(s2.status, "cleared");
  assert.equal(s2.result, "won");
  assert.ok(s2.card, "cleared Step 2 carries its card");
  assert.equal(s2.actualStake, 197.88, "Step 2 rode the rolled $197.88");
  assert.ok(s2.actualReturn >= 600 && s2.actualReturn <= 700, "actual return ~$601.56");
  assert.ok(s2.card.legs.some((l) => /USA|United States/.test(l.participant)) && s2.card.legs.some((l) => /Gonzales/.test(l.participant)), "USA + Nick Gonzales in the cleared Step 2 card");
  // Step 3 settled WON (official) — cleared, riding the rolled $601.56 → ~$1,464.71.
  // Legs are Egypt ML (June 21) + Algeria ML (June 22), both graded hit (official, API-Football).
  const s3 = v.steps[2];
  assert.equal(s3.status, "cleared", "Step 3 settled WON → cleared");
  assert.equal(s3.result, "won");
  assert.ok(s3.card, "Step 3 carries its settled card");
  assert.equal(s3.actualStake, 601.56, "Step 3 rode the rolled $601.56");
  assert.ok(s3.actualReturn >= 1400 && s3.actualReturn <= 1500, "actual return ~$1,464.71");
  assert.ok(s3.card.legs.some((l) => /Egypt/.test(l.participant)) && s3.card.legs.some((l) => /Algeria/.test(l.participant)), "Egypt + Algeria in the cleared Step 3 card");
  // Step 4 settled WON (official, June 23) — cleared, riding the rolled $1,464.71 → ~$3,502.57.
  // Legs are Croatia ML + Colombia/DR Congo Under 2.5, both graded hit (official, API-Football).
  const s4 = v.steps[3];
  assert.equal(s4.status, "cleared", "Step 4 settled WON → cleared");
  assert.equal(s4.result, "won");
  assert.ok(s4.card, "Step 4 carries its settled card");
  assert.equal(s4.actualStake, 1464.71, "Step 4 rode the rolled $1,464.71");
  assert.ok(s4.actualReturn >= 3500 && s4.actualReturn <= 3510, "actual return ~$3,502.57");
  assert.ok(s4.card.legs.some((l) => /Croatia/.test(l.participant)) && s4.card.legs.some((l) => /Under 2\.5/.test(l.participant)), "Croatia + COL/DRC Under 2.5 in the cleared Step 4 card");
  // Step 5 settled WON (official, June 24) — cleared, riding the rolled $3,502.57 → ~$10,089.23.
  // Legs are Morocco ML + Bosnia ML + Scotland/Brazil Over 2.5, all graded hit (official, API-Football).
  const s5 = v.steps[4];
  assert.equal(s5.status, "cleared", "Step 5 settled WON → cleared (ladder completed)");
  assert.equal(s5.result, "won");
  assert.ok(s5.card, "Step 5 carries its settled card");
  assert.equal(s5.actualStake, 3502.57, "Step 5 rode the rolled $3,502.57");
  assert.ok(s5.actualReturn >= 10080 && s5.actualReturn <= 10095, "actual return ~$10,089.23");
  assert.ok(
    s5.card.legs.some((l) => /Morocco/.test(l.participant)) &&
    s5.card.legs.some((l) => /Bosnia/.test(l.participant)) &&
    s5.card.legs.some((l) => /Over 2\.5/.test(l.participant)),
    "Morocco + Bosnia + Brazil Over 2.5 in the cleared Step 5 card");
  // All five real steps cleared → ladder complete; no active/awaiting rung remains.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 5, "all five steps cleared (ladder completed)");
  assert.ok(v.steps.every((s) => s.status !== "awaiting"), "no rung awaiting — every rung is cleared");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (Lane A never lost)");
});

test("Lane B public ladder after June-24 settlement: lane STOPPED (Step 3 lost) → clean queued Step-1 restart path, no lost legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // Lane B's Step 3 (Brazil ML + Switzerland/Canada Under 2.5) settled LOST (official — 3 goals, Under missed),
  // so the lane is STOPPED. A stopped lane is presented publicly as a clean queued Step-1 starting path — its
  // real (won AND lost) steps are NOT read into the public view; only Mr. Dub / priorLane carry that history.
  assert.equal(v.currentStatus, "queued_restart");
  assert.equal(v.steps.length, 5, "five-step ladder");
  assert.equal(v.steps[0].status, "queued", "Step 1 is the clean queued restart");
  assert.equal(v.steps[0].result, null, "queued restart has no settled result");
  assert.equal(v.steps[0].actualStake, 100, "fresh $100 Lane B restart");
  assert.equal(v.steps[0].actualReturn, null, "no return on a not-yet-placed restart card");
  for (let i = 0; i < 5; i++) assert.equal(v.steps[i].card, null, `Step ${i + 1} carries no card from a stopped lane`);
  for (let i = 1; i < 5; i++) assert.equal(v.steps[i].status, "upcoming", `Step ${i + 1} upcoming`);
  // NONE of the stopped lane's real legs — won OR lost — surface publicly. The lost Step 3 (Brazil ML +
  // Switzerland/Canada Under 2.5) and the prior history (Goldschmidt/Turkey/Hoskins) never reach the view.
  const dump = JSON.stringify(v);
  assert.ok(!/Brazil/.test(dump) && !/Switzerland/.test(dump) && !/Canada/.test(dump), "no stopped-lane legs (incl. the lost Step 3) in the public view model");
  assert.ok(!/Goldschmidt/.test(dump) && !/Turkey/.test(dump) && !/Hoskins/.test(dump), "no prior stopped/lost history surfaced publicly");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean restart path)");
});

test("DEMO: Lane A cleared steps surface settled cards with real legs (never blank); stopped Lane B surfaces a clean queued path (never a blank actionable row)", () => {
  // Lane A completed the ladder — every cleared step surfaces a real settled card with real legs (no blank
  // rows). Lane B is STOPPED → a clean queued Step-1 path with no cards (its lost history never surfaces),
  // so it never shows a blank actionable row either.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "completed", "Lane A ladder completed (all five rungs cleared)");
  assert.equal(a.steps.filter((s) => s.status === "cleared").length, 5, "Lane A has five cleared steps");
  for (const aCleared of a.steps.filter((s) => s.status === "cleared")) {
    assert.ok(aCleared.card && aCleared.card.legs.length >= 2, "cleared step carries a settled card with real legs (not a blank row)");
    assert.ok(aCleared.actualStake && aCleared.actualReturn, "cleared step carries real stake + settled return");
  }
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "queued_restart", "Lane B stopped → clean queued restart path");
  assert.equal(b.steps[0].status, "queued", "Lane B Step 1 is the queued restart (a defined starting row, not a blank actionable one)");
  assert.equal(b.steps[0].actualStake, 100, "queued restart carries its $100 starting stake");
  assert.ok(b.steps.every((s) => s.card === null), "no settled cards on a stopped lane (lost history never surfaces)");
});

test("DEMO: June-24 settlement closed both lanes → no open exposure (Lane A COMPLETED at Step 5, Lane B STOPPED at Step 3 lost; total $0; moonshot settled → 0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "both lanes' June-24 cards settled → seeds released (Lane A completed, Lane B stopped)");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  // Lane A completed the ladder — Step 5 (Morocco + Bosnia + Brazil Over 2.5) settled WON (official, $10,089.23).
  // Lane B's Step 3 (Brazil ML + Switzerland/Canada Under 2.5) settled LOST (official) → lane stopped.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  const laneAStep5 = bbRaw.laneA.steps.find((s) => s.step === 5);
  const laneBStep3 = bbRaw.laneB.steps.find((s) => s.step === 3);
  assert.equal(laneAStep5.status, "settled", "Lane A Step 5 card settled");
  assert.equal(laneAStep5.result, "won", "Lane A Step 5 settled WON (Morocco ML + Bosnia ML + Brazil Over 2.5, official) → ladder completed");
  assert.equal(laneBStep3.status, "settled", "Lane B Step 3 card settled");
  assert.equal(laneBStep3.result, "lost", "Lane B Step 3 settled LOST (Brazil ML + Switzerland/Canada Under 2.5 — 3 goals, official) → lane stopped");
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
