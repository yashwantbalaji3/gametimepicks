import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPublicDualLadder } from "./public-dual-ladder.ts";
import { loadTodaySlate } from "../parlays/ui-loader.ts";

const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;

test("Lane B public ladder after June-26 win: cycle-3 Step-1 CLEARED (won), now awaiting Step 2 — no completed/🏆 state, no prior-cycle legs", () => {
  const v = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.ok(v, "lane B view present");
  // The prior $10k ladder ($10,089.23, Ladder #2) was BANKED and archived. On the fresh cycle-3, Lane B's
  // Step-1 then WON on June-26 (Egypt-or-Draw + France ML, payout $206.25) and ADVANCED — the live ladder now
  // shows ONE cleared rung and is awaiting the next qualified card on Step 2. The celebrated "completed"/🏆
  // state is GONE (it lives in the banked ladders), and the prior June-25 lost cycle never bleeds in.
  assert.equal(v.currentStatus, "awaiting_next_card");
  assert.doesNotMatch(v.headline, /\$10K REACHED|ladder COMPLETE/i, "the completed/🏆 headline is gone from the live ladder");
  assert.equal(v.steps.length, 5, "five-step ladder");
  // Ladder targets are the canonical $100→$200 ... $3,500→$10,000.
  assert.deepEqual(v.steps.map((s) => [s.startTarget, s.goalTarget]),
    [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]]);
  // Step 1 is cleared (won June-26); the remaining rungs carry no settled result or card and no lost step.
  assert.equal(v.steps.filter((s) => s.status === "cleared").length, 1, "one cleared rung (Step-1 won June-26)");
  assert.equal(v.steps[0].result, "won", "Step 1 settled WON on June-26");
  assert.ok(v.steps.slice(1).every((s) => s.result === null), "no settled result on the upcoming rungs");
  assert.ok(v.steps.slice(1).every((s) => s.card === null), "no settled card on the upcoming rungs");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean advancing path)");
  // The prior June-25 lost cycle's legs (Paraguay/Curaçao/Ivory Coast) never bleed into the live view.
  const dump = JSON.stringify(v);
  assert.ok(!/Paraguay/.test(dump) && !/Cura/.test(dump) && !/Ivory/.test(dump), "no June-25 lost-cycle legs surface on the live ladder");
});

test("Lane A public ladder after June-26 stop: queued clean Step-1 restart path, no prior won/lost legs surfaced", () => {
  const v = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.ok(v, "lane A view present");
  // Lane A WON Step-1 (June-25) then LOST Step-2 on June-26 (Senegal Over 3 hit, but Cape Verde/Saudi BTTS Yes
  // missed 0-0) and STOPPED. The stopped lane maps to a clean QUEUED Step-1 restart path in the public view —
  // the prior (won Step-1 AND lost Step-2) steps are NOT read into the public view; only Mr. Dub carries that
  // history. The public view shows a clean queued fresh Step-1 starting path.
  assert.equal(v.currentStatus, "queued_restart");
  assert.equal(v.steps.length, 5, "five-step ladder");
  assert.equal(v.steps[0].result, null, "queued fresh Step 1 has no settled result");
  assert.equal(v.steps[0].actualReturn, null, "no return on a not-yet-settled queued card");
  for (let i = 0; i < 5; i++) assert.equal(v.steps[i].card, null, `Step ${i + 1} carries no settled card on a queued restart`);
  for (let i = 1; i < 5; i++) assert.equal(v.steps[i].status, "upcoming", `Step ${i + 1} upcoming`);
  // NONE of the prior cycle's real legs — won OR lost — surface publicly. The June-25 won Step-1 (Japan/Ecuador)
  // and the June-26 lost Step-2 (Senegal, Cape Verde/Saudi Arabia) never reach the public view.
  const dump = JSON.stringify(v);
  assert.ok(!/Senegal/.test(dump) && !/Cape Verde/.test(dump) && !/Saudi/.test(dump), "no June-26 lost Step-2 legs in the public view model");
  assert.ok(!/Japan/.test(dump) && !/Ecuador/.test(dump) && !/Germany/.test(dump), "no June-25 won Step-1 legs in the public view model");
  assert.ok(v.steps.every((s) => s.result !== "lost"), "no lost step surfaced (clean queued path)");
});

test("DEMO: post June-26 both lanes surface a defined path (Lane A stopped→queued Step-1 restart, Lane B advanced past Step-1 — never a blank actionable row)", () => {
  // Post June-26: Lane A WON Step-1 then LOST Step-2 and STOPPED → it maps to a clean QUEUED Step-1 restart
  // path (no cleared rung, no settled card). Lane B's Step-1 WON (June-26) and advanced (now awaiting the next
  // card on Step 2, one cleared rung). Both surface defined paths, never a blank actionable row, and Lane A
  // carries no settled card from the stopped cycle.
  const a = buildPublicDualLadder(bb.laneA, "lane-a");
  assert.equal(a.currentStatus, "queued_restart", "Lane A stopped → queued fresh Step-1 restart path");
  assert.equal(a.steps[0].step, 1, "Lane A leads with Step 1 (a defined starting row, not a blank actionable one)");
  assert.ok(a.steps.every((s) => s.card === null), "no settled cards on a queued Lane A (stopped-cycle history never surfaces)");
  const b = buildPublicDualLadder(bb.laneB, "lane-b");
  assert.equal(b.currentStatus, "awaiting_next_card", "Lane B advanced — awaiting next card on Step 2");
  assert.equal(b.steps.filter((s) => s.status === "cleared").length, 1, "Lane B has one cleared step (Step-1 won June-26)");
  assert.ok(b.steps.slice(1).every((s) => s.card === null), "no settled cards on Lane B's upcoming rungs");
});

test("DEMO: Ladder #2 banked + June-26 settled (Lane A STOPPED, Lane B ADVANCED) → legacy portfolio carries no exposure (core $0; moonshot settled → 0)", () => {
  const mr = JSON.parse(fs.readFileSync("public/data/mr-dub/portfolio.json", "utf8"));
  assert.equal(mr.openExposure, 0, "legacy dual-ladder seeds $0 (canonical; fresh-cycle cards live in the daily portfolio)");
  assert.equal(mr.totalOpenExposure, 0, "core $0; moonshot settled LOST → 0 open");
  // The prior $10k ladder was banked ($10,089.23, Ladder #2) and archived; the live cycle-3 then settled
  // June-26: Lane A WON Step-1 (June-25) but LOST Step-2 (June-26) → STOPPED carrying both settled steps;
  // Lane B (restarted June-26 after its June-25 loss) WON Step-1 → ADVANCED, with the June-25 loss archived
  // in laneB.priorLane.steps.
  const bbRaw = JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-active.json", "utf8")).run;
  assert.equal(bbRaw.laneA.laneStatus, "stopped", "Lane A stopped after its June-26 Step-2 loss");
  assert.equal(bbRaw.laneA.currentStep, 2, "Lane A's June-26 settled rung is Step 2");
  assert.equal(bbRaw.laneA.steps.length, 2, "Lane A carries two settled steps (Step-1 won, Step-2 lost)");
  assert.equal(bbRaw.laneA.steps[0].result, "won", "Lane A Step-1 settled WON (June-25)");
  assert.equal(bbRaw.laneA.steps[1].result, "lost", "Lane A Step-2 settled LOST (June-26)");
  assert.equal(bbRaw.laneB.laneStatus, "advanced", "Lane B advanced after its June-26 Step-1 win");
  assert.equal(bbRaw.laneB.currentStep, 1, "Lane B's June-26 settled rung is Step 1");
  assert.equal(bbRaw.laneB.steps.length, 1, "Lane B carries one settled (won) step from June-26");
  assert.equal(bbRaw.laneB.steps[0].result, "won", "Lane B Step-1 settled WON (June-26)");
  assert.equal(bbRaw.laneB.priorLane.steps.length, 1, "Lane B's June-25 loss is archived in priorLane");
  assert.equal(bbRaw.laneB.priorLane.steps[0].result, "lost", "Lane B prior Step-1 settled LOST (June-25)");
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
