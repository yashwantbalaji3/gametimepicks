import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";
import path from "node:path";
import { pinnedLaneRoot } from "./fixtures/root.mjs";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z", pinnedLaneRoot()).bankBuilderPreview;

// P192 · PINNED LANE STATE — this regression is about a specific historical lane state, so it reads a
// pinned snapshot rather than the live ladder. Assertions unchanged; only the source is.
test("Lane B public ladder after the July-21 review restart (fresh Step-1): clean active Step-1 starting path — no completed/🏆 state, no prior-cycle legs", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // Lane B was RESTARTED to a fresh Step-1 REVIEW (paper, $0). The prior $10k ladder ($10,089.23, Ladder #2) was
  // BANKED and archived; every prior WC cycle (the July-5 loss + earlier) lives in priorLane / Mr. Dub and never
  // bleeds into the live view. The celebrated "completed"/🏆 state is GONE (it lives in the banked ladders).
  assert.equal(v.currentStatus, "active", "restarted lane maps to a clean active Step-1 starting path");
  assert.doesNotMatch(v.headline, /\$10K REACHED|ladder COMPLETE/i, "the completed/🏆 headline is gone from the live ladder");
  assert.equal(v.steps.length, 5, "five-step ladder");
  // Ladder targets are the canonical $100→$200 ... $3,500→$10,000.
  assert.deepEqual(v.steps.map((s) => [s.startTarget, s.goalTarget]),
    [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]]);
  // Clean starting path: no cleared rung; the fresh Step-1 carries no settled result and no rung shows a settled card.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 0, "no cleared rung (clean Step-1 starting path)");
  assert.equal(v.steps[0].step, 1, "leads with Step 1");
  assert.ok(v.steps.every((s) => s.result === null), "no settled result on any rung (clean starting path)");
  assert.ok(v.steps.every((s) => s.card === null), "no settled card on any rung");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (prior losses stay in Mr. Dub)");
  // No settled-LOST / prior-cycle WC legs bleed into the live view (they live in priorLane / Mr. Dub).
  const dump = JSON.stringify(v);
  assert.ok(!/Paraguay/.test(dump) && !/Cura/.test(dump) && !/Ivory/.test(dump) && !/Egypt/.test(dump) && !/Austria/.test(dump) && !/Mexico/.test(dump) && !/Norway/.test(dump), "no prior-cycle legs surface on the live ladder");
});

test("Lane A public ladder after the July-21 review restart (fresh Step-1): clean active Step-1 starting path, no PRIOR-cycle legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Lane A was RESTARTED to a fresh Step-1 REVIEW (paper, $0). The MLB pitcher-strikeout review card (Wrobleski
  // anchor + Buehler core) lives in the raw artifact's step, but a Step-1 review is not a settled/placed public
  // card — the view surfaces NO card. Its advanced cycle-8 (Spain/Belgium, Colombia/Argentina) and the deeper
  // July losses all live in priorLane / Mr. Dub — never in the live public view.
  assert.equal(v.currentStatus, "active", "restarted lane maps to a clean active Step-1 starting path");
  assert.doesNotMatch(v.headline, /\$10K REACHED|ladder COMPLETE/i, "no completed/🏆 headline on the restarted lane");
  assert.equal(v.steps.length, 5, "five-step ladder");
  assert.equal(v.steps[0].step, 1, "leads with Step 1");
  // Clean starting path: no cleared rung, no settled card on any rung.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 0, "no cleared rung (clean Step-1 starting path)");
  assert.ok(v.steps.every((s) => s.card === null), "no settled card on any rung");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (prior losses stay in Mr. Dub)");
  // NONE of the prior cycles' real legs — won OR lost — surface publicly; they live in priorLane / Mr. Dub.
  const dump = JSON.stringify(v.steps) + JSON.stringify(v.headline);
  assert.ok(!/Spain or Draw/.test(dump) && !/Belgium or Draw/.test(dump), "the advanced cycle-8 WC Step-1 legs stay in priorLane");
  assert.ok(!/Colombia or Draw/.test(dump) && !/Argentina to win/.test(dump), "the advanced cycle-8 WC Step-2 legs stay in priorLane");
  assert.ok(!/Cape Verde/.test(dump) && !/Saudi/.test(dump) && !/Algeria/.test(dump), "no deeper prior-cycle lost-step legs in the public view model");
  assert.ok(!/Japan/.test(dump) && !/Ecuador/.test(dump), "no deeper prior-cycle won-step legs in the public view model");
});

test("DEMO: post July-21 review restart both lanes surface a defined active Step-1 path (never a blank actionable row), no prior-cycle history surfaced", () => {
  // Both lanes were RESTARTED to fresh Step-1 REVIEW cycles (paper, $0). Each surfaces a defined active Step-1
  // starting path, never a blank actionable row; no PRIOR-cycle history (the advanced cycle-8 WON rungs, the July
  // losses) bleeds in — that history lives in priorLane / Mr. Dub.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "active", "Lane A restarted → clean active Step-1 path");
  assert.equal(a.steps[0].step, 1, "Lane A leads with Step 1 (a defined row, not a blank actionable one)");
  assert.equal(a.steps.filter((s) => s.status === "cleared").length, 0, "Lane A has no cleared rung (fresh Step-1 starting path)");
  assert.ok(a.steps.every((s) => s.card === null), "no settled card on Lane A (prior-cycle history never surfaces)");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "active", "Lane B restarted → clean active Step-1 path");
  assert.equal(b.steps[0].step, 1, "Lane B leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.equal(b.steps.filter((s) => s.status === "cleared").length, 0, "Lane B has no cleared step (clean starting path)");
  assert.ok(b.steps.every((s) => s.card === null), "no settled cards on Lane B's rungs");
});

test("DEMO: Ladder #2 banked + July-21 review restart → both lanes fresh Step-1 review, legacy portfolio carries no exposure (core $0; moonshot $0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "legacy dual-ladder seeds $0 (canonical; settled rungs released, review cards place nothing)");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot review card places $0");
  // The prior $10k ladder was banked ($10,089.23, Ladder #2) and archived; the live lanes settled through the July
  // cycles, then the July-21 REVIEW RESTART reset BOTH lanes to fresh Step-1 review cycles (paper, $0). The advanced
  // July-6/July-7 cycle (8: Steps 1 & 2 WON) moved one level down into Lane A's priorLane; the July-5 loss (cycle 7)
  // and the July-1/July-2/July-3 cycle (6) sit deeper.
  const bbRaw = JSON.parse(fs.readFileSync(path.join(pinnedLaneRoot(), "methodology/launch/dual-bank-builder-active.json"), "utf8")).run;
  assert.equal(bbRaw.laneA.laneStatus, "active", "Lane A restarted — fresh Step-1 review (cycle 9)");
  assert.equal(bbRaw.laneA.cycle, 9, "Lane A is cycle 9");
  assert.equal(bbRaw.laneA.currentStep, 1, "Lane A restarted to Step 1");
  assert.equal(bbRaw.laneA.steps[0].status, "active", "Lane A live Step-1 is the fresh review (not settled)");
  assert.equal(bbRaw.laneA.steps[0].result ?? null, null, "Lane A live Step-1 is unsettled (review card, no result)");
  // The advanced July-6/July-7 cycle (8) is preserved one level down: Steps 1 & 2 WON.
  assert.equal(bbRaw.laneA.priorLane.laneStatus, "advanced", "Lane A priorLane (cycle 8) advanced — Steps 1 & 2 WON");
  assert.equal(bbRaw.laneA.priorLane.cycle, 8, "Lane A priorLane is cycle 8 (July-6/July-7)");
  assert.equal(bbRaw.laneA.priorLane.steps[0].result, "won", "Lane A cycle-8 Step-1 settled WON (Spain or Draw + Belgium or Draw)");
  assert.equal(bbRaw.laneA.priorLane.steps[1].result, "won", "Lane A cycle-8 Step-2 settled WON (Colombia or Draw + Argentina to win)");
  // Two levels down: cycle 7 (July-5 LOST); three levels down: the July-1/July-2/July-3 cycle (6).
  assert.equal(bbRaw.laneA.priorLane.priorLane.laneStatus, "stopped", "Lane A cycle 7 stopped (July-5 loss)");
  assert.equal(bbRaw.laneA.priorLane.priorLane.cycle, 7, "Lane A cycle 7 two levels down");
  assert.equal(bbRaw.laneA.priorLane.priorLane.steps[0].result, "lost", "Lane A cycle-7 Step-1 settled LOST (July-5)");
  assert.equal(bbRaw.laneA.priorLane.priorLane.priorLane.currentStep, 3, "Lane A cycle 6 stopped on Step 3 (lost its July-3 Step)");
  assert.equal(bbRaw.laneA.priorLane.priorLane.priorLane.steps[2].result, "lost", "Lane A cycle-6 Step-3 settled LOST (July-3)");
  assert.equal(bbRaw.laneB.laneStatus, "active", "Lane B restarted — fresh Step-1 review (cycle 8)");
  assert.equal(bbRaw.laneB.cycle, 8, "Lane B is cycle 8");
  assert.equal(bbRaw.laneB.steps[0].status, "active", "Lane B live Step-1 is the fresh review (not settled)");
  assert.equal(bbRaw.laneB.priorLane.laneStatus, "stopped", "Lane B priorLane (cycle 7) stopped — July-5 loss");
  assert.equal(bbRaw.laneB.priorLane.steps[0].result, "lost", "Lane B cycle-7 Step-1 settled LOST (July-5)");
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
