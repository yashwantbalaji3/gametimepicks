import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane A public ladder after banking Ladder #2: fresh cycle-2 Step-1 active path — five untouched rungs, no settled steps, no completed/🏆 state", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Lane A's prior $10k ladder ($10,089.23, Ladder #2) was BANKED and archived. The LIVE ladder is now a
  // FRESH cycle-2 Step-1 active path — the celebrated "completed"/🏆 state is GONE from the live view
  // (it lives in banked-ladders.json), and no real step carries a settled result yet.
  assert.equal(v.currentStatus, "active");
  assert.doesNotMatch(v.headline, /\$10K REACHED|ladder COMPLETE/i, "the completed/🏆 headline is gone from the live ladder");
  assert.equal(v.steps.length, 5, "five-step ladder");
  // Ladder targets are the canonical $100→$200 ... $3,500→$10,000.
  assert.deepEqual(v.steps.map((s) => [s.startTarget, s.goalTarget]),
    [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]]);
  // Fresh cycle: no rung is cleared, none carry a settled result or card, and none surface a lost step.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 0, "no cleared rung on a fresh restart");
  assert.ok(v.steps.every((s) => s.result === null), "no settled result on any rung");
  assert.ok(v.steps.every((s) => s.card === null), "no settled card on any rung");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean fresh path)");
  // The prior cycle's real legs never bleed into the fresh live view.
  const dump = JSON.stringify(v);
  assert.ok(!/Morocco/.test(dump) && !/Bosnia/.test(dump) && !/Mexico/.test(dump) && !/Soto/.test(dump), "no banked-ladder legs surface on the fresh live ladder");
});

test("Lane B public ladder after banking Ladder #2: fresh cycle-2 Step-1 active path, no prior stopped/lost legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // Lane B was retired with the banked cycle and restarted FRESH on cycle-2 Step-1 (no longer the old
  // "queued_restart"/stopped state). It now renders as a clean active Step-1 path — its prior (won AND lost)
  // steps are NOT read into the public view; only Mr. Dub / priorLane carry that history.
  assert.equal(v.currentStatus, "active");
  assert.equal(v.steps.length, 5, "five-step ladder");
  assert.equal(v.steps[0].result, null, "fresh Step 1 has no settled result");
  assert.equal(v.steps[0].actualReturn, null, "no return on a not-yet-placed fresh card");
  for (let i = 0; i < 5; i++) assert.equal(v.steps[i].card, null, `Step ${i + 1} carries no card on a fresh restart`);
  for (let i = 1; i < 5; i++) assert.equal(v.steps[i].status, "upcoming", `Step ${i + 1} upcoming`);
  // NONE of the prior cycle's real legs — won OR lost — surface publicly. The lost Step 3 (Brazil ML +
  // Switzerland/Canada Under 2.5) and the prior history (Goldschmidt/Turkey/Hoskins) never reach the view.
  const dump = JSON.stringify(v);
  assert.ok(!/Brazil/.test(dump) && !/Switzerland/.test(dump) && !/Canada/.test(dump), "no prior-cycle legs (incl. the lost Step 3) in the public view model");
  assert.ok(!/Goldschmidt/.test(dump) && !/Turkey/.test(dump) && !/Hoskins/.test(dump), "no prior stopped/lost history surfaced publicly");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean fresh path)");
});

test("DEMO: both fresh cycle-2 lanes surface a clean Step-1 active path (never a blank actionable row, no prior settled cards)", () => {
  // After banking Ladder #2, BOTH lanes restarted fresh on cycle-2 Step-1. Neither carries any settled card
  // from the prior cycle, and neither shows a blank actionable row — they are clean defined starting paths.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "active", "Lane A fresh cycle-2 active path");
  assert.equal(a.steps.filter((s) => s.status === "cleared").length, 0, "Lane A has no cleared steps on a fresh restart");
  assert.ok(a.steps.every((s) => s.card === null), "no settled cards on a fresh Lane A (prior cycle banked + archived)");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "active", "Lane B fresh cycle-2 active path");
  assert.equal(b.steps[0].step, 1, "Lane B leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.ok(b.steps.every((s) => s.card === null), "no settled cards on a fresh Lane B (prior history never surfaces)");
});

test("DEMO: Ladder #2 banked → fresh cycle-2 BB lanes carry no legacy exposure (core $0; moonshot settled → 0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "legacy dual-ladder seeds $0 (prior cycle banked; fresh cycle-2 cards live in the daily portfolio)");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  // The prior $10k ladder was banked ($10,089.23, Ladder #2) and archived; the live run restarted FRESH on
  // cycle-2 with both lanes back on Step 1 (active, no settled steps yet).
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  assert.equal(bbRaw.laneA.laneStatus, "active", "Lane A is a fresh cycle-2 active lane");
  assert.equal(bbRaw.laneA.currentStep, 1, "Lane A restarted at Step 1");
  assert.equal(bbRaw.laneA.steps.length, 0, "Lane A carries no settled steps on the fresh cycle");
  assert.equal(bbRaw.laneB.laneStatus, "active", "Lane B is a fresh cycle-2 active lane");
  assert.equal(bbRaw.laneB.currentStep, 1, "Lane B restarted at Step 1");
  assert.equal(bbRaw.laneB.steps.length, 0, "Lane B carries no settled steps on the fresh cycle");
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
