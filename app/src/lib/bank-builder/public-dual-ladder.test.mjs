import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane B public ladder after the July-5 cycle-7 restart: ACTIVE fresh Step-1 path — no completed/🏆 state, no prior-cycle legs", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // The prior $10k ladder ($10,089.23, Ladder #2) was BANKED and archived. Lane B's July-3 Step-1 settled LOST,
  // then the operator approved a fresh cycle-7 restart on July-5 → the lane is ACTIVE on a fresh $100 Step-1
  // (no longer queued_restart, no cleared rung). The celebrated "completed"/🏆 state is GONE (it lives in the
  // banked ladders), and the settled-LOST / prior-cycle legs never bleed in — Mr. Dub carries that history.
  assert.equal(v.currentStatus, "active", "restarted lane is ACTIVE on a fresh Step 1 (no longer queued_restart)");
  assert.doesNotMatch(v.headline, /\$10K REACHED|ladder COMPLETE/i, "the completed/🏆 headline is gone from the live ladder");
  assert.equal(v.steps.length, 5, "five-step ladder");
  // Ladder targets are the canonical $100→$200 ... $3,500→$10,000.
  assert.deepEqual(v.steps.map((s) => [s.startTarget, s.goalTarget]),
    [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]]);
  // Fresh restart: no cleared rung; the fresh Step-1 carries no settled result and no rung shows a settled card.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 0, "no cleared rung (fresh cycle-7 Step-1)");
  assert.equal(v.steps[0].step, 1, "leads with Step 1");
  assert.ok(v.steps.every((s) => s.result === null), "no settled result on any rung (clean fresh cycle)");
  assert.ok(v.steps.every((s) => s.card === null), "no settled card on any rung");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (prior losses stay in Mr. Dub)");
  // No settled-LOST / prior-cycle legs (June-25/26/27/29 won or lost) bleed into the live view.
  const dump = JSON.stringify(v);
  assert.ok(!/Paraguay/.test(dump) && !/Cura/.test(dump) && !/Ivory/.test(dump) && !/Egypt/.test(dump) && !/Austria/.test(dump), "no prior-cycle legs surface on the live ladder");
});

test("Lane A public ladder after the July-5 cycle-7 restart: ACTIVE fresh Step-1 path, no cleared/prior legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Lane A WON its July-1 Step-1 + July-2 Step-2 but then LOST its July-3 Step-3 → the cycle stopped; on July-5
  // the operator approved a fresh cycle-7 restart, so the lane is ACTIVE on a fresh $100 Step-1. None of the
  // prior cycle's (won OR lost) steps, and none of the DEEPER cycles' steps, are read into the public view; only
  // Mr. Dub carries that history.
  assert.equal(v.currentStatus, "active", "restarted lane is ACTIVE on a fresh Step 1 (no longer queued_restart)");
  assert.equal(v.steps.length, 5, "five-step ladder");
  assert.equal(v.steps[0].step, 1, "leads with a Step 1");
  // A fresh cycle surfaces NO cleared rung — the settled prior cycle (WON Steps 1 & 2, LOST Step 3) never bleeds
  // into the public starting path.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 0, "no cleared rung (fresh cycle-7 starting path)");
  assert.ok(v.steps.every((s) => s.card === null), "no settled card on any rung (clean fresh cycle)");
  // NONE of the prior cycles' real legs — won OR lost — surface publicly.
  const dump = JSON.stringify(v.steps) + JSON.stringify(v.headline);
  assert.ok(!/Cape Verde/.test(dump) && !/Saudi/.test(dump) && !/Argentina/.test(dump) && !/Algeria/.test(dump), "no lost-step legs in the public view model");
  assert.ok(!/Japan/.test(dump) && !/Ecuador/.test(dump) && !/Germany/.test(dump), "no won-step legs in the public view model");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (prior losses stay in Mr. Dub)");
});

test("DEMO: post July-5 restart both lanes surface a defined path (never a blank actionable row): both ACTIVE fresh Step-1, no prior-cycle history surfaced", () => {
  // Post July-5 activation: both lanes RESTARTED (cycle 7) → each maps to an ACTIVE fresh $100 Step-1 path.
  // Both surface defined paths, never a blank actionable row; no cleared rungs and no prior-cycle history
  // (the July-3 losses) bleed in — that history is tracked in Mr. Dub.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "active", "Lane A restarted → ACTIVE fresh Step-1 path");
  assert.equal(a.steps[0].step, 1, "Lane A leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.equal(a.steps.filter((s) => s.status === "cleared").length, 0, "Lane A has no cleared rung (fresh cycle)");
  assert.ok(a.steps.every((s) => s.card === null), "no settled card on Lane A's rungs (prior-cycle history never surfaces)");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "active", "Lane B restarted → ACTIVE fresh Step-1 path");
  assert.equal(b.steps[0].step, 1, "Lane B leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.equal(b.steps.filter((s) => s.status === "cleared").length, 0, "Lane B has no cleared step (fresh cycle)");
  assert.ok(b.steps.every((s) => s.card === null), "no settled cards on Lane B's rungs");
});

test("DEMO: Ladder #2 banked + July-3 settlement (both lanes lost) → legacy portfolio carries no exposure (core $0; moonshot settled → 0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "legacy dual-ladder seeds $0 (canonical; settled rungs released, awaiting a fresh slate)");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  // The prior $10k ladder was banked ($10,089.23, Ladder #2) and archived; the live lanes then settled July-1 →
  // July-3 (Lane A cycle 6 Steps 1 & 2 WON then Step 3 LOST; Lane B cycle 6 Step-1 LOST) and RESTARTED on
  // July-5 as an ACTIVE cycle 7 (fresh $100 Step-1). The settled cycle 6 is archived one level down in each
  // lane's priorLane chain; the earlier lost steps sit one level deeper still.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  assert.equal(bbRaw.laneA.laneStatus, "active", "Lane A active — cycle-7 restart (fresh Step 1)");
  assert.equal(bbRaw.laneA.cycle, 7, "Lane A is cycle 7");
  assert.equal(bbRaw.laneA.currentStep, 1, "Lane A's live rung is a fresh Step 1");
  assert.equal(bbRaw.laneA.steps[0].status, "active", "Lane A live Step-1 is active (pending, unsettled)");
  assert.equal(bbRaw.laneA.priorLane.laneStatus, "stopped", "Lane A priorLane (cycle 6) stopped");
  assert.equal(bbRaw.laneA.priorLane.currentStep, 3, "Lane A cycle 6 stopped on Step 3 (lost its July-3 Step)");
  assert.equal(bbRaw.laneA.priorLane.steps[0].result, "won", "Lane A cycle-6 Step-1 settled WON (July-1)");
  assert.equal(bbRaw.laneA.priorLane.steps[1].result, "won", "Lane A cycle-6 Step-2 settled WON (July-2)");
  assert.equal(bbRaw.laneA.priorLane.steps[2].result, "lost", "Lane A cycle-6 Step-3 settled LOST (July-3)");
  assert.equal(bbRaw.laneA.priorLane.priorLane.steps[0].result, "lost", "Lane A earlier Step-1 settled LOST (archived one level deeper)");
  assert.equal(bbRaw.laneB.laneStatus, "active", "Lane B active — cycle-7 restart (fresh Step 1)");
  assert.equal(bbRaw.laneB.cycle, 7, "Lane B is cycle 7");
  assert.equal(bbRaw.laneB.currentStep, 1, "Lane B's live rung is a fresh Step 1");
  assert.equal(bbRaw.laneB.steps[0].status, "active", "Lane B live Step-1 is active (pending, unsettled)");
  assert.equal(bbRaw.laneB.priorLane.laneStatus, "stopped", "Lane B priorLane (cycle 6) stopped");
  assert.equal(bbRaw.laneB.priorLane.steps[0].result, "lost", "Lane B cycle-6 Step-1 settled LOST (July-3)");
  assert.equal(bbRaw.laneB.priorLane.priorLane.steps.find((s) => s.step === 1).result, "lost", "Lane B earlier Step-1 settled LOST July-1 (archived one level deeper)");
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
