import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane B public ladder after the July-6 no-play (stopped lane): clean queued Step-1 starting path — no completed/🏆 state, no prior-cycle legs", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // The prior $10k ladder ($10,089.23, Ladder #2) was BANKED and archived. Lane B lost its July-3 and July-5
  // Step-1 cards and is a deliberate July-6 NO-PLAY → the stopped lane maps to a CLEAN queued_restart starting
  // path (a fresh $100 Step-1 next qualified card, no cleared rung). The celebrated "completed"/🏆 state is GONE
  // (it lives in the banked ladders), and the settled-LOST / prior-cycle legs never bleed in — Mr. Dub carries
  // that history.
  assert.equal(v.currentStatus, "queued_restart", "stopped no-play lane maps to a clean queued Step-1 starting path");
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
  // No settled-LOST / prior-cycle legs (June-25/26/27/29 won or lost) bleed into the live view.
  const dump = JSON.stringify(v);
  assert.ok(!/Paraguay/.test(dump) && !/Cura/.test(dump) && !/Ivory/.test(dump) && !/Egypt/.test(dump) && !/Austria/.test(dump), "no prior-cycle legs surface on the live ladder");
});

test("Lane A public ladder after the July-6 cycle-8 Step-1 WIN: one cleared rung + Step-2 awaiting, no PRIOR-cycle legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Lane A WON its July-1 Step-1 + July-2 Step-2, LOST July-3, then LOST its July-5 restart → the cycle stopped;
  // on July-6 the operator approved a cycle-8 restart whose $100 Step-1 card (Spain or Draw + Belgium or Draw)
  // WON, so the lane ADVANCED — its public path now shows exactly ONE cleared rung (the WON Step-1, with its
  // winning card as proof) and a Step-2 awaiting-next-card row. None of the PRIOR cycles' (won OR lost) steps are
  // read into the public view; only Mr. Dub carries that history.
  assert.equal(v.currentStatus, "awaiting_next_card", "advanced lane awaits its next qualified card (Step 2)");
  assert.match(v.headline, /1 step cleared/i, "headline reflects the one cleared (WON) rung");
  assert.equal(v.steps.length, 5, "five-step ladder");
  assert.equal(v.steps[0].step, 1, "leads with the cleared Step 1");
  // Exactly ONE cleared rung — the WON cycle-8 Step-1 (with its card surfaced as proof); no prior cycle bleeds in.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 1, "one cleared rung (the WON cycle-8 Step-1)");
  assert.equal(v.steps[0].status, "cleared", "Step 1 is the cleared, WON rung");
  assert.equal(v.steps[0].result, "won", "the cleared Step-1 rung is WON");
  assert.ok(v.steps[0].card, "the cleared Step-1 rung surfaces its winning card as proof");
  assert.ok(v.steps.slice(1).every((s) => s.card === null), "no settled card on any rung beyond the cleared Step-1");
  // The surfaced card is the WON cycle-8 Step-1 (Spain or Draw / Belgium or Draw) — NOT any prior-cycle legs.
  const dump = JSON.stringify(v.steps) + JSON.stringify(v.headline);
  assert.ok(/Spain or Draw/.test(dump) && /Belgium or Draw/.test(dump), "the cleared rung surfaces the WON July-6 legs");
  // NONE of the PRIOR cycles' real legs — won OR lost — surface publicly.
  assert.ok(!/Cape Verde/.test(dump) && !/Saudi/.test(dump) && !/Argentina/.test(dump) && !/Algeria/.test(dump), "no prior-cycle lost-step legs in the public view model");
  assert.ok(!/Japan/.test(dump) && !/Ecuador/.test(dump), "no prior-cycle won-step legs in the public view model");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (prior losses stay in Mr. Dub)");
});

test("DEMO: post July-6 settlement both lanes surface a defined path (never a blank actionable row): Lane A one cleared rung + Step-2 awaiting, Lane B clean queued Step-1, no prior-cycle history surfaced", () => {
  // Post July-6 settlement: Lane A (cycle 8) WON its Step-1 → ADVANCED, so its path shows one cleared rung plus a
  // Step-2 awaiting-next-card row; Lane B is a NO-PLAY (stopped) → a CLEAN queued Step-1 starting path. Both
  // surface defined paths, never a blank actionable row; no PRIOR-cycle history (the July-5 losses) bleeds in —
  // that history is tracked in Mr. Dub.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "awaiting_next_card", "Lane A advanced → awaiting the Step-2 card");
  assert.equal(a.steps[0].step, 1, "Lane A leads with Step 1 (a defined row, not a blank actionable one)");
  assert.equal(a.steps.filter((s) => s.status === "cleared").length, 1, "Lane A has exactly one cleared rung (the WON cycle-8 Step-1)");
  assert.equal(a.steps[0].result, "won", "Lane A's cleared rung is the WON Step-1");
  assert.ok(a.steps.slice(1).every((s) => s.card === null), "no settled card beyond the cleared Step-1 (prior-cycle history never surfaces)");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "queued_restart", "Lane B no-play → clean queued Step-1 starting path");
  assert.equal(b.steps[0].step, 1, "Lane B leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.equal(b.steps.filter((s) => s.status === "cleared").length, 0, "Lane B has no cleared step (clean starting path)");
  assert.ok(b.steps.every((s) => s.card === null), "no settled cards on Lane B's rungs");
});

test("DEMO: Ladder #2 banked + July-5 settlement (both lanes lost) → legacy portfolio carries no exposure (core $0; moonshot settled → 0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "legacy dual-ladder seeds $0 (canonical; settled rungs released, awaiting a fresh slate)");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  // The prior $10k ladder was banked ($10,089.23, Ladder #2) and archived; the live lanes then settled through
  // July-3 (Lane A cycle 6 Steps 1 & 2 WON then Step 3 LOST; Lane B cycle 6 Step-1 LOST), restarted cycle 7 and
  // LOST both lanes July-5. For July-6 Lane A RESTARTED (cycle 8) and WON its Step-1 → ADVANCED; Lane B is a
  // no-play (stopped, cycle 7 July-5 loss at top). The July-5 loss sits one level down in Lane A's priorLane;
  // the July-1/July-2/July-3 cycle (6) is two levels down.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  assert.equal(bbRaw.laneA.laneStatus, "advanced", "Lane A advanced — cycle-8 Step-1 WON July-6");
  assert.equal(bbRaw.laneA.cycle, 8, "Lane A is cycle 8");
  assert.equal(bbRaw.laneA.currentStep, 1, "Lane A settled its Step-1 (advanced from Step 1)");
  assert.equal(bbRaw.laneA.steps[0].status, "settled", "Lane A live Step-1 is settled (WON July-6)");
  assert.equal(bbRaw.laneA.steps[0].result, "won", "Lane A live Step-1 settled WON (Spain or Draw + Belgium or Draw)");
  assert.equal(bbRaw.laneA.priorLane.laneStatus, "stopped", "Lane A priorLane (cycle 7) stopped");
  assert.equal(bbRaw.laneA.priorLane.cycle, 7, "Lane A priorLane is cycle 7 (July-5 loss)");
  assert.equal(bbRaw.laneA.priorLane.steps[0].result, "lost", "Lane A cycle-7 Step-1 settled LOST (July-5)");
  // Two levels down: the July-1/July-2/July-3 cycle (6) — WON Step-1, WON Step-2, LOST Step-3.
  assert.equal(bbRaw.laneA.priorLane.priorLane.laneStatus, "stopped", "Lane A cycle 6 stopped");
  assert.equal(bbRaw.laneA.priorLane.priorLane.currentStep, 3, "Lane A cycle 6 stopped on Step 3 (lost its July-3 Step)");
  assert.equal(bbRaw.laneA.priorLane.priorLane.steps[0].result, "won", "Lane A cycle-6 Step-1 settled WON (July-1)");
  assert.equal(bbRaw.laneA.priorLane.priorLane.steps[1].result, "won", "Lane A cycle-6 Step-2 settled WON (July-2)");
  assert.equal(bbRaw.laneA.priorLane.priorLane.steps[2].result, "lost", "Lane A cycle-6 Step-3 settled LOST (July-3)");
  assert.equal(bbRaw.laneB.laneStatus, "stopped", "Lane B stopped — July-6 no-play (July-5 Step-1 LOST at top)");
  assert.equal(bbRaw.laneB.cycle, 7, "Lane B is cycle 7 (the July-5 restart that lost; not restarted for July-6)");
  assert.equal(bbRaw.laneB.steps[0].result, "lost", "Lane B top Step-1 settled LOST (July-5)");
  assert.equal(bbRaw.laneB.priorLane.laneStatus, "stopped", "Lane B priorLane (cycle 6) stopped");
  assert.equal(bbRaw.laneB.priorLane.steps[0].result, "lost", "Lane B cycle-6 Step-1 settled LOST (July-3)");
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
