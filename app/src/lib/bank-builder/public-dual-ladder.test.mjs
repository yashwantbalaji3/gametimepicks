import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane B public ladder after the July-1 settled-LOST Step: queued-restart Step-1 path — no completed/🏆 state, no prior-cycle legs", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // The prior $10k ladder ($10,089.23, Ladder #2) was BANKED and archived. Lane B's July-1 Step-1 settled LOST and
  // the lane was then RESTARTED (money-safe) into a fresh cycle-6 Step-1 — the public view maps the active
  // restart to a clean Step-1 path (no cleared rung). The celebrated "completed"/🏆 state is GONE (it lives in
  // the banked ladders), and the settled-LOST / prior-cycle legs never bleed in.
  assert.equal(v.currentStatus, "active");
  assert.doesNotMatch(v.headline, /\$10K REACHED|ladder COMPLETE/i, "the completed/🏆 headline is gone from the live ladder");
  assert.equal(v.steps.length, 5, "five-step ladder");
  // Ladder targets are the canonical $100→$200 ... $3,500→$10,000.
  assert.deepEqual(v.steps.map((s) => [s.startTarget, s.goalTarget]),
    [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]]);
  // Fresh restart: no cleared rung; the fresh Step-1 carries no settled result and no rung shows a card.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 0, "no cleared rung (fresh restart Step-1)");
  assert.equal(v.steps[0].step, 1, "leads with Step 1");
  assert.ok(v.steps.every((s) => s.result === null), "no settled result on any rung (clean restart)");
  assert.ok(v.steps.every((s) => s.card === null), "no settled card on any rung");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean restart path)");
  // No settled-LOST / prior-cycle legs (June-25/26/27/29 won or lost) bleed into the live view.
  const dump = JSON.stringify(v);
  assert.ok(!/Paraguay/.test(dump) && !/Cura/.test(dump) && !/Ivory/.test(dump) && !/Egypt/.test(dump) && !/Austria/.test(dump), "no prior-cycle legs surface on the live ladder");
});

test("Lane A public ladder after the July-2 settled-WON Step: two cleared rungs + awaiting-next Step-3 path, no prior lost legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Lane A's July-1 Step-1 AND July-2 Step-2 settled WON and the lane advanced (cycle 6). The public view surfaces
  // the current cycle's two cleared WON step cards and an awaiting-next Step-3 path — none of the PRIOR cycles'
  // (won OR lost) steps are read into the public view; only Mr. Dub carries that history.
  assert.equal(v.currentStatus, "awaiting_next_card");
  assert.equal(v.steps.length, 5, "five-step ladder");
  assert.equal(v.steps[0].step, 1, "leads with a Step 1");
  assert.equal(v.steps[0].status, "cleared", "Step 1 cleared (settled WON this cycle)");
  assert.equal(v.steps[0].result, "won", "Step 1 settled WON (July-1, this cycle)");
  assert.equal(v.steps[1].status, "cleared", "Step 2 cleared (settled WON this cycle)");
  assert.equal(v.steps[1].result, "won", "Step 2 settled WON (July-2, this cycle)");
  // Only the current cycle's cleared Steps 1 & 2 carry settled cards; Steps 3-5 carry no settled card yet.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 2, "exactly two cleared rungs (the current cycle's WON Steps 1 & 2)");
  for (let i = 2; i < 5; i++) assert.equal(v.steps[i].card, null, `Step ${i + 1} carries no settled card on an awaiting path`);
  // NONE of the PRIOR cycles' real legs — won OR lost — surface publicly (exclude the current cleared WON cards).
  const nonCleared = v.steps.filter((s) => s.status !== "cleared");
  const dump = JSON.stringify(nonCleared) + JSON.stringify(v.headline);
  assert.ok(!/Cape Verde/.test(dump) && !/Saudi/.test(dump) && !/Argentina/.test(dump) && !/Algeria/.test(dump), "no prior lost-step legs in the public view model");
  assert.ok(!/Japan/.test(dump) && !/Ecuador/.test(dump) && !/Germany/.test(dump), "no prior won-step legs in the public view model");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (only the current cycle's WON rung + awaiting path)");
});

test("DEMO: post July-2 both lanes surface a defined path (never a blank actionable row): Lane A advanced (awaiting-next), Lane B queued-restart, no prior-cycle history surfaced", () => {
  // Post July-3: Lane A WON its Steps (cycle 6, advanced → two cleared WON steps + awaiting-next Step-3 path) and
  // Lane B was RESTARTED (money-safe) into a live cycle-6 Step-1 (active → clean fresh Step-1 path). Both surface
  // defined paths, never a blank actionable row; only Lane A's CURRENT cleared WON cards surface — no prior-cycle
  // history bleeds in.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "awaiting_next_card", "Lane A settled-WON → advanced, awaiting-next Step-3 path");
  assert.equal(a.steps[0].step, 1, "Lane A leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.equal(a.steps.filter((s) => s.status === "cleared").length, 2, "Lane A has exactly two cleared rungs (the current cycle's WON Steps 1 & 2)");
  assert.ok(a.steps.filter((s) => s.status !== "cleared").every((s) => s.card === null), "no settled card on Lane A's non-cleared rungs (prior-cycle history never surfaces)");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "active", "Lane B restarted → active fresh Step-1 path");
  assert.equal(b.steps[0].step, 1, "Lane B leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.equal(b.steps.filter((s) => s.status === "cleared").length, 0, "Lane B has no cleared step (fresh restart Step-1)");
  assert.ok(b.steps.every((s) => s.card === null), "no settled cards on Lane B's rungs");
});

test("DEMO: Ladder #2 banked + July-2 settlement (Lane A Steps 1 & 2 WON, Lane B stopped) → legacy portfolio carries no exposure (core $0; moonshot settled → 0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "legacy dual-ladder seeds $0 (canonical; settled rungs released, awaiting a fresh slate)");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  // The prior $10k ladder was banked ($10,089.23, Ladder #2) and archived; the live lanes then settled their
  // July-1 + July-2 Steps (Lane A cycle 6 Step-1 & Step-2 WON, Lane B cycle 5 lost) and Lane B was RESTARTED
  // (money-safe) into a fresh cycle-6 Step-1. The prior lost steps are archived one level deeper in each lane's
  // priorLane chain.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  assert.equal(bbRaw.laneA.laneStatus, "advanced", "Lane A advanced — cycle-6 Steps 1 & 2 settled-WON");
  assert.equal(bbRaw.laneA.cycle, 6, "Lane A is cycle 6");
  assert.equal(bbRaw.laneA.currentStep, 2, "Lane A's live rung is Step 2 (won its July-2 Step)");
  assert.equal(bbRaw.laneA.steps[0].result, "won", "Lane A current Step-1 settled WON (July-1)");
  assert.equal(bbRaw.laneA.steps[1].result, "won", "Lane A current Step-2 settled WON (July-2)");
  assert.equal(bbRaw.laneA.priorLane.steps[0].result, "lost", "Lane A prior Step-1 settled LOST (archived)");
  assert.equal(bbRaw.laneB.laneStatus, "active", "Lane B active — cycle-6 Step-1 restarted (money-safe)");
  assert.equal(bbRaw.laneB.cycle, 6, "Lane B is cycle 6 (restarted)");
  assert.equal(bbRaw.laneB.currentStep, 1, "Lane B's live rung is Step 1");
  assert.equal(bbRaw.laneB.steps[0].status, "active", "Lane B current Step-1 is active (restarted, un-settled)");
  assert.equal(bbRaw.laneB.priorLane.steps.find((s) => s.step === 1).result, "lost", "Lane B prior Step-1 settled LOST July-1 (archived)");
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
