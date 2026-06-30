import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane B public ladder after the June-29 settled-LOST Step: queued-restart Step-1 path — no completed/🏆 state, no prior-cycle legs", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // The prior $10k ladder ($10,089.23, Ladder #2) was BANKED and archived. Lane B's June-29 Step-1 then settled
  // LOST and the lane is stopped — the public view maps it to a clean queued-restart Step-1 path (no cleared
  // rung). The celebrated "completed"/🏆 state is GONE (it lives in the banked ladders), and the settled-LOST /
  // prior-cycle legs never bleed in.
  assert.equal(v.currentStatus, "queued_restart");
  assert.doesNotMatch(v.headline, /\$10K REACHED|ladder COMPLETE/i, "the completed/🏆 headline is gone from the live ladder");
  assert.equal(v.steps.length, 5, "five-step ladder");
  // Ladder targets are the canonical $100→$200 ... $3,500→$10,000.
  assert.deepEqual(v.steps.map((s) => [s.startTarget, s.goalTarget]),
    [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]]);
  // Queued restart: no cleared rung; the queued Step-1 carries no settled result and no rung shows a card.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 0, "no cleared rung (queued-restart Step-1)");
  assert.equal(v.steps[0].step, 1, "leads with Step 1");
  assert.ok(v.steps.every((s) => s.result === null), "no settled result on any rung (clean queued restart)");
  assert.ok(v.steps.every((s) => s.card === null), "no settled card on any rung");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean restart path)");
  // No settled-LOST / prior-cycle legs (June-25/26/27/29 won or lost) bleed into the live view.
  const dump = JSON.stringify(v);
  assert.ok(!/Paraguay/.test(dump) && !/Cura/.test(dump) && !/Ivory/.test(dump) && !/Egypt/.test(dump) && !/Austria/.test(dump), "no prior-cycle legs surface on the live ladder");
});

test("Lane A public ladder after the June-29 settled-LOST Step: clean queued-restart Step-1 path, no prior won/lost legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Lane A's June-29 Step-1 settled LOST and the lane is stopped (cycle 5). The stopped lane maps to a clean
  // queued-restart Step-1 path in the public view — none of the prior cycles' (won OR lost) steps, nor the
  // June-29 settled-LOST leg, are read into the public view; only Mr. Dub carries that history.
  assert.equal(v.currentStatus, "queued_restart");
  assert.equal(v.steps.length, 5, "five-step ladder");
  assert.equal(v.steps[0].step, 1, "leads with a Step 1");
  assert.equal(v.steps[0].result, null, "Step 1 has no settled result");
  assert.equal(v.steps[0].actualReturn, null, "no return on a not-yet-settled queued card");
  for (let i = 0; i < 5; i++) assert.equal(v.steps[i].card, null, `Step ${i + 1} carries no settled card on a queued restart`);
  // NONE of the prior cycles' real legs — won OR lost — surface publicly.
  const dump = JSON.stringify(v);
  assert.ok(!/Senegal/.test(dump) && !/Cape Verde/.test(dump) && !/Saudi/.test(dump) && !/Argentina/.test(dump) && !/Algeria/.test(dump), "no prior lost-step legs in the public view model");
  assert.ok(!/Japan/.test(dump) && !/Ecuador/.test(dump) && !/Germany/.test(dump), "no prior won-step legs in the public view model");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean fresh path)");
});

test("DEMO: post June-29 both lanes surface a defined queued-restart Step-1 path (never a blank actionable row), no stopped-cycle history surfaced", () => {
  // Post June-29: both lanes settled-LOST their Step (Lane A cycle 5, Lane B cycle 4) and are stopped. Each maps
  // to a clean queued-restart Step-1 path (no cleared rung, no settled card). Both surface defined paths, never a
  // blank actionable row, and neither carries a settled card from the stopped cycles.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "queued_restart", "Lane A settled-LOST → queued-restart Step-1 path");
  assert.equal(a.steps[0].step, 1, "Lane A leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.ok(a.steps.every((s) => s.card === null), "no settled cards on a stopped Lane A (stopped-cycle history never surfaces)");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "queued_restart", "Lane B settled-LOST → queued-restart Step-1 path");
  assert.equal(b.steps.filter((s) => s.status === "cleared").length, 0, "Lane B has no cleared step (queued-restart Step-1)");
  assert.ok(b.steps.every((s) => s.card === null), "no settled cards on Lane B's rungs");
});

test("DEMO: Ladder #2 banked + June-29 settled-LOST (Lane A + Lane B both Step-1 LOST) → legacy portfolio carries no exposure (core $0; moonshot settled → 0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "legacy dual-ladder seeds $0 (canonical; both lanes settled-LOST, awaiting a fresh slate)");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  // The prior $10k ladder was banked ($10,089.23, Ladder #2) and archived; both live lanes then settled-LOST
  // their June-29 Step (Lane A cycle 5 Step-1, Lane B cycle 4 Step-1). The June-27 lost steps are archived one
  // level deeper in each lane's priorLane chain.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  assert.equal(bbRaw.laneA.laneStatus, "stopped", "Lane A stopped — cycle-5 Step-1 settled-LOST June-29");
  assert.equal(bbRaw.laneA.cycle, 5, "Lane A is cycle 5");
  assert.equal(bbRaw.laneA.currentStep, 1, "Lane A's live rung is Step 1");
  assert.equal(bbRaw.laneA.steps[0].result, "lost", "Lane A current Step-1 settled LOST (June-29)");
  assert.equal(bbRaw.laneA.priorLane.steps[0].result, "lost", "Lane A prior Step-1 settled LOST (June-27, archived)");
  assert.equal(bbRaw.laneB.laneStatus, "stopped", "Lane B stopped — cycle-4 Step-1 settled-LOST June-29");
  assert.equal(bbRaw.laneB.cycle, 4, "Lane B is cycle 4");
  assert.equal(bbRaw.laneB.currentStep, 1, "Lane B's live rung is Step 1");
  assert.equal(bbRaw.laneB.steps[0].result, "lost", "Lane B current Step-1 settled LOST (June-29)");
  assert.equal(bbRaw.laneB.priorLane.steps.find((s) => s.step === 2).result, "lost", "Lane B prior Step-2 settled LOST (June-27, archived)");
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
