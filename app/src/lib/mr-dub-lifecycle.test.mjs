import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));
const banked = () => JSON.parse(fs.readFileSync("public/data/methodology/launch/dual-bank-builder-2026-06-24-completed.json", "utf8"));

test("banked dual-lane history: Lane A COMPLETED the $10K ladder (Step 5 settled WON), Lane B stopped (Step 3 settled LOST); live lanes are a fresh cycle-2", () => {
  // The completed cycle-1 dual run was archived when Lane A's $100→$10k ladder was BANKED into the crown.
  // Its final lane states are preserved in the archived artifact.
  const run = banked().run;
  const a = run.laneA, b = run.laneB;
  // Lane A: Steps 1-5 all WON; Step 5 settled WON → the $10K ladder is COMPLETED (banked).
  assert.equal(a.laneStatus, "completed", "banked Lane A completed the ladder after Step 5 settled WON");
  const a1 = a.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won", "Lane A Step 1 cleared WON");
  const a2 = a.steps.find((s) => s.step === 2);
  assert.equal(a2.status, "settled", "Lane A Step 2 settled");
  assert.equal(a2.result, "won", "Lane A Step 2 WON (USA ML + Gonzales HRR)");
  const a5 = a.steps.find((s) => s.step === 5);
  assert.equal(a5.status, "settled", "Lane A Step 5 settled");
  assert.equal(a5.result, "won", "Lane A Step 5 settled WON → ladder completed ($10089.23, official)");
  assert.ok(Math.abs(a5.payout - 10089.23) < 0.5, "Lane A Step 5 reached $10,089.23 (banked)");
  // Lane B: Steps 1 + 2 WON, then Step 3 settled LOST → lane stopped.
  assert.equal(b.laneStatus, "stopped", "banked Lane B stopped after Step 3 settled LOST");
  const b1 = b.steps.find((s) => s.step === 1);
  assert.equal(b1.status, "settled", "Lane B Step 1 card settled");
  assert.equal(b1.result, "won", "Lane B Step 1 cleared WON");
  const b3 = b.steps.find((s) => s.step === 3);
  assert.equal(b3.status, "settled", "Lane B Step 3 settled");
  assert.equal(b3.result, "lost", "Lane B Step 3 settled LOST → lane stopped");
  // The LIVE view-model is a fresh cycle-2 — banking does not leave a completed ladder sitting in the live lanes.
  const bb = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z").bankBuilderPreview;
  assert.equal(bb.laneA.publicVisible, true, "live Lane A shown publicly");
  assert.notEqual(bb.laneA.laneStatus, "completed", "live Lane A is a fresh cycle, not a banked completed ladder");
});

test("Mr. Dub ledger after the 2nd ladder is BANKED: crown $20,465.40, bankroll $20,165.40, exposure $0, record 13-3-0-0", () => {
  const p = read("portfolio.json");
  assert.equal(p.paperOnly, true);
  // Cumulative-crown: crown = Σ two banked $100→$10k finals; bankroll = crown − $300 dual-lane losses.
  assert.equal(p.crownBankroll, 20465.4, "crown = Σ two banked completed-ladder finals — immutable, append-only");
  assert.equal(p.currentBankroll, 20165.4, "crown $20,465.40 less $300 realized dual-lane losses");
  assert.equal(p.openExposure, 0, "both prior cycles settled + fresh cycle-2 not yet placed → $0 open");
  assert.deepEqual(p.record, { wins: 13, losses: 3, voids: 0, pending: 0 }, "13-3-0-0 UNCHANGED (banking is not a bet)");
  const led = read("ledger.json");
  // The crown ladder (original $100→$10,376.17) is logged as five cleared step wins.
  assert.ok(led.events.filter((e) => e.type === "ladder_step_won" && e.laneId === "crown-ladder").length >= 5, "crown ladder five step wins logged");
  // Banking the 2nd ladder is logged as a single ladder_banked event realizing the official $10,089.23 final.
  const banked = led.events.find((e) => e.type === "ladder_banked" && e.laneId === "lane-a");
  assert.ok(banked && banked.paperProfit === 10089.23, "Lane A ladder banked +$10,089.23 (official)");
  assert.equal(banked.officialResultConfirmed, true, "banked ladder is official, not fabricated");
  // The stopped dual-lane seeds are realized once as a -$300 dual_lane_losses event (not double-counted).
  const losses = led.events.find((e) => e.type === "dual_lane_losses");
  assert.ok(losses && losses.paperProfit === -300, "dual-lane losses realize -$300 once (no double-count)");
  // Reconciliation: ledger paperProfit sums to settledProfit (banked ladder + crown rungs − dual-lane losses).
  const sum = Math.round(led.events.reduce((s, e) => s + (e.paperProfit ?? 0), 0) * 100) / 100;
  assert.equal(sum, p.settledProfit, "no double-counting — ledger reconciles to settled profit");
});

test("same-game parlay IDs include gameId (no cross-fixture collision)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T18:00:00Z");
  const ids = v.gameSpecific.flatMap((g) => g.parlays.map((p) => p.parlayId));
  assert.equal(new Set(ids).size, ids.length, "all same-game parlay IDs are unique");
});
