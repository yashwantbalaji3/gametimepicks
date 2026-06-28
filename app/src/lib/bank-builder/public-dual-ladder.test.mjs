import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane B public ladder after the June-27 restart: fresh cycle-4 Step-1 active — no completed/🏆 state, no prior-cycle legs", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // The prior $10k ladder ($10,089.23, Ladder #2) was BANKED and archived. Lane B's June-27 Step-2 then LOST and
  // the lane RESTARTED fresh — the live cycle-4 ladder leads with a clean active Step-1 (no cleared rung yet) on
  // the June-28 slate. The celebrated "completed"/🏆 state is GONE (it lives in the banked ladders), and the
  // prior won/lost cycle legs never bleed in.
  assert.equal(v.currentStatus, "active");
  assert.doesNotMatch(v.headline, /\$10K REACHED|ladder COMPLETE/i, "the completed/🏆 headline is gone from the live ladder");
  assert.equal(v.steps.length, 5, "five-step ladder");
  // Ladder targets are the canonical $100→$200 ... $3,500→$10,000.
  assert.deepEqual(v.steps.map((s) => [s.startTarget, s.goalTarget]),
    [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]]);
  // Fresh restart: no cleared rung yet; the live Step-1 card carries no settled result and no rung shows a card.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 0, "no cleared rung yet (fresh Step-1 restart)");
  assert.equal(v.steps[0].step, 1, "leads with Step 1");
  assert.ok(v.steps.every((s) => s.result === null), "no settled result on any rung (fresh restart)");
  assert.ok(v.steps.every((s) => s.card === null), "no settled card on any rung");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean restart path)");
  // No prior-cycle legs (June-25/26/27 won or lost) bleed into the live view.
  const dump = JSON.stringify(v);
  assert.ok(!/Paraguay/.test(dump) && !/Cura/.test(dump) && !/Ivory/.test(dump) && !/Egypt/.test(dump) && !/Austria/.test(dump), "no prior-cycle legs surface on the live ladder");
});

test("Lane A public ladder after the June-27 stop+restart: clean fresh Step-1 path, no prior won/lost legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Lane A's June-27 Step-1 LOST and the lane RESTARTED fresh (cycle 5) on the June-28 slate. The restarted lane
  // maps to a clean fresh Step-1 path in the public view — none of the prior cycles' (won OR lost) steps are read
  // into the public view; only Mr. Dub carries that history.
  assert.equal(v.currentStatus, "active");
  assert.equal(v.steps.length, 5, "five-step ladder");
  assert.equal(v.steps[0].step, 1, "leads with a fresh Step 1");
  assert.equal(v.steps[0].result, null, "fresh Step 1 has no settled result");
  assert.equal(v.steps[0].actualReturn, null, "no return on a not-yet-settled fresh card");
  for (let i = 0; i < 5; i++) assert.equal(v.steps[i].card, null, `Step ${i + 1} carries no settled card on a fresh restart`);
  // NONE of the prior cycles' real legs — won OR lost — surface publicly.
  const dump = JSON.stringify(v);
  assert.ok(!/Senegal/.test(dump) && !/Cape Verde/.test(dump) && !/Saudi/.test(dump) && !/Argentina/.test(dump) && !/Algeria/.test(dump), "no prior lost-step legs in the public view model");
  assert.ok(!/Japan/.test(dump) && !/Ecuador/.test(dump) && !/Germany/.test(dump), "no prior won-step legs in the public view model");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean fresh path)");
});

test("DEMO: post June-27 both lanes surface a defined fresh Step-1 path (never a blank actionable row), no stopped-cycle history surfaced", () => {
  // Post June-27: both lanes LOST their Step and RESTARTED fresh (Lane A cycle 5, Lane B cycle 4). Each maps to a
  // clean active Step-1 path (no cleared rung, no settled card). Both surface defined paths, never a blank
  // actionable row, and neither carries a settled card from the stopped cycles.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "active", "Lane A restarted → fresh active Step-1 path");
  assert.equal(a.steps[0].step, 1, "Lane A leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.ok(a.steps.every((s) => s.card === null), "no settled cards on a restarted Lane A (stopped-cycle history never surfaces)");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "active", "Lane B restarted → fresh active Step-1 path");
  assert.equal(b.steps.filter((s) => s.status === "cleared").length, 0, "Lane B has no cleared step yet (fresh Step-1 restart)");
  assert.ok(b.steps.every((s) => s.card === null), "no settled cards on Lane B's rungs");
});

test("DEMO: Ladder #2 banked + June-27 restarts (Lane A + Lane B both fresh Step-1) → legacy portfolio carries no exposure (core $0; moonshot settled → 0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "legacy dual-ladder seeds $0 (canonical; fresh-cycle cards live in the daily portfolio)");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  // The prior $10k ladder was banked ($10,089.23, Ladder #2) and archived; both live lanes then LOST their
  // June-27 Step and RESTARTED fresh (Lane A cycle 5 Step-1, Lane B cycle 4 Step-1). The June-27 lost steps are
  // archived in each lane's priorLane chain.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  assert.equal(bbRaw.laneA.laneStatus, "active", "Lane A active — fresh cycle-5 Step-1 restart");
  assert.equal(bbRaw.laneA.cycle, 5, "Lane A is cycle 5");
  assert.equal(bbRaw.laneA.currentStep, 1, "Lane A's live rung is Step 1");
  assert.equal(bbRaw.laneA.priorLane.steps[0].result, "lost", "Lane A prior Step-1 settled LOST (June-27, archived)");
  assert.equal(bbRaw.laneB.laneStatus, "active", "Lane B active — fresh cycle-4 Step-1 restart");
  assert.equal(bbRaw.laneB.cycle, 4, "Lane B is cycle 4");
  assert.equal(bbRaw.laneB.currentStep, 1, "Lane B's live rung is Step 1");
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
