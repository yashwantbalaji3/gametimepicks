import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane A public ladder after June-25 win: cycle-2 Step-1 CLEARED (won), now awaiting Step 2 — no completed/🏆 state, no banked-ladder legs", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Lane A's prior $10k ladder ($10,089.23, Ladder #2) was BANKED and archived. On the fresh cycle, Lane A's
  // Step-1 then WON on June-25 (payout $201.08) and ADVANCED — the live ladder now shows ONE cleared rung and
  // is awaiting the next qualified card on Step 2. The celebrated "completed"/🏆 state is GONE (it lives in
  // banked-ladders.json), and no banked-ladder legs bleed into the live view.
  assert.equal(v.currentStatus, "awaiting_next_card");
  assert.doesNotMatch(v.headline, /\$10K REACHED|ladder COMPLETE/i, "the completed/🏆 headline is gone from the live ladder");
  assert.equal(v.steps.length, 5, "five-step ladder");
  // Ladder targets are the canonical $100→$200 ... $3,500→$10,000.
  assert.deepEqual(v.steps.map((s) => [s.startTarget, s.goalTarget]),
    [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]]);
  // Step 1 is cleared (won June-25); the remaining rungs carry no settled result or card and no lost step.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 1, "one cleared rung (Step-1 won June-25)");
  assert.equal(v.steps[0].result, "won", "Step 1 settled WON on June-25");
  assert.ok(v.steps.slice(1).every((s) => s.result === null), "no settled result on the upcoming rungs");
  assert.ok(v.steps.slice(1).every((s) => s.card === null), "no settled card on the upcoming rungs");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean advancing path)");
  // The prior banked cycle's real legs never bleed into the live view.
  const dump = JSON.stringify(v);
  assert.ok(!/Morocco/.test(dump) && !/Bosnia/.test(dump) && !/Mexico/.test(dump) && !/Soto/.test(dump), "no banked-ladder legs surface on the live ladder");
});

test("Lane B public ladder after June-25 loss: stopped → clean queued-restart Step-1 path, no lost legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // Lane B's fresh-cycle Step-1 LOST on June-25 (Paraguay-or-Draw + Curaçao/Ivory Coast Over 3) and the lane
  // STOPPED. The public view maps a stopped lane to a clean queued-restart Step-1 starting path — the prior
  // (won AND lost) steps are NOT read into the public view; only Mr. Dub / priorLane carry that history.
  assert.equal(v.currentStatus, "queued_restart");
  assert.equal(v.steps.length, 5, "five-step ladder");
  assert.equal(v.steps[0].result, null, "queued Step 1 has no settled result");
  assert.equal(v.steps[0].actualReturn, null, "no return on a not-yet-placed queued card");
  for (let i = 0; i < 5; i++) assert.equal(v.steps[i].card, null, `Step ${i + 1} carries no card on a queued restart`);
  for (let i = 1; i < 5; i++) assert.equal(v.steps[i].status, "upcoming", `Step ${i + 1} upcoming`);
  // NONE of the prior cycle's real legs — won OR lost — surface publicly. The June-25 lost Step (Paraguay/
  // Curaçao) and the prior history (Brazil/Switzerland/Canada, Goldschmidt/Turkey/Hoskins) never reach the view.
  const dump = JSON.stringify(v);
  assert.ok(!/Paraguay/.test(dump) && !/Cura/.test(dump) && !/Ivory/.test(dump), "no June-25 lost legs in the public view model");
  assert.ok(!/Brazil/.test(dump) && !/Switzerland/.test(dump) && !/Canada/.test(dump), "no prior-cycle legs in the public view model");
  assert.ok(!/Goldschmidt/.test(dump) && !/Turkey/.test(dump) && !/Hoskins/.test(dump), "no prior stopped/lost history surfaced publicly");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean queued path)");
});

test("DEMO: post June-25 both lanes surface a defined path (Lane A advanced past Step-1, Lane B queued restart — never a blank actionable row)", () => {
  // Post June-25: Lane A's Step-1 WON and advanced (now awaiting the next card on Step 2, one cleared rung),
  // and Lane B's Step-1 LOST and stopped (maps to a clean queued-restart Step-1 path). Both surface defined
  // paths, never a blank actionable row, and Lane B carries no settled card from the prior cycle.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "awaiting_next_card", "Lane A advanced — awaiting next card on Step 2");
  assert.equal(a.steps.filter((s) => s.status === "cleared").length, 1, "Lane A has one cleared step (Step-1 won June-25)");
  assert.ok(a.steps.slice(1).every((s) => s.card === null), "no settled cards on Lane A's upcoming rungs");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "queued_restart", "Lane B stopped → clean queued-restart path");
  assert.equal(b.steps[0].step, 1, "Lane B leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.ok(b.steps.every((s) => s.card === null), "no settled cards on a queued Lane B (prior history never surfaces)");
});

test("DEMO: Ladder #2 banked + June-25 settled → BB lanes carry no legacy exposure (core $0; moonshot settled → 0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "legacy dual-ladder seeds $0 (June-25 settled; fresh-cycle cards live in the daily portfolio)");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  // The prior $10k ladder was banked ($10,089.23, Ladder #2) and archived; the live cycle then settled June-25:
  // Lane A's Step-1 WON and ADVANCED, Lane B's Step-1 LOST and STOPPED — each lane now carries one settled step.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  assert.equal(bbRaw.laneA.laneStatus, "advanced", "Lane A advanced after its June-25 Step-1 win");
  assert.equal(bbRaw.laneA.currentStep, 1, "Lane A's June-25 settled rung is Step 1");
  assert.equal(bbRaw.laneA.steps.length, 1, "Lane A carries one settled (won) step from June-25");
  assert.equal(bbRaw.laneA.steps[0].result, "won", "Lane A Step-1 settled WON");
  assert.equal(bbRaw.laneB.laneStatus, "stopped", "Lane B stopped after its June-25 Step-1 loss");
  assert.equal(bbRaw.laneB.currentStep, 1, "Lane B's June-25 settled rung is Step 1");
  assert.equal(bbRaw.laneB.steps.length, 1, "Lane B carries one settled (lost) step from June-25");
  assert.equal(bbRaw.laneB.steps[0].result, "lost", "Lane B Step-1 settled LOST");
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
