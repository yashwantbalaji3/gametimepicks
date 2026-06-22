import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));

test("dual-lane lifecycle after June 19 settlement + cross-slate resume: Lane A active (Step 3 placed), Lane B active (Step 1 restart placed)", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z");
  const bb = v.bankBuilderPreview;
  const a = bb.laneA, b = bb.laneB;
  // Lane A: Step 1 + Step 2 both WON; Step 3 placed as an ACTIVE cross-slate card (pending).
  assert.equal(a.laneStatus, "active", "Lane A active with a placed Step 3 card");
  assert.equal(a.publicVisible, true, "active lane shown publicly");
  const a1 = a.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won", "Lane A Step 1 cleared WON");
  const a2 = a.steps.find((s) => s.step === 2);
  assert.equal(a2.status, "settled", "Lane A Step 2 settled");
  assert.equal(a2.result, "won", "Lane A Step 2 WON (USA ML + Gonzales HRR)");
  assert.equal(a.steps.find((s) => s.step === 3).status, "pending", "Lane A Step 3 is a placed (pending) cross-slate card");
  // Lane B: resumed ACTIVE with a fresh $100 Step 1 restart (pending), shown publicly.
  assert.equal(b.laneStatus, "active", "Lane B active after the restart");
  assert.equal(b.publicVisible, true, "active restart lane shown publicly");
  assert.equal(b.steps.find((s) => s.step === 1).status, "pending", "Lane B Step 1 is a placed (pending) restart card");
});

test("Mr. Dub ledger after reconciliation + resume: bankroll $10,176.17, exposure $200, record 8-2-0-2", () => {
  const p = read("portfolio.json");
  assert.equal(p.paperOnly, true);
  assert.equal(p.crownBankroll, 10376.17, "original completed ladder imported");
  assert.equal(p.currentBankroll, 10176.17, "crown $10,376.17 less two real Lane B lost seeds ($200) — above $10k");
  assert.equal(p.openExposure, 200, "Lane A + Lane B core seeds placed (pending) → exposure $200");
  assert.deepEqual(p.record, { wins: 8, losses: 2, voids: 0, pending: 2 }, "8-2 with 2 pending (Lane A Step 3 + Lane B Step 1 open)");
  const led = read("ledger.json");
  // Lane A advance is logged as cleared step wins plus an open (pending) Step 3 card.
  assert.ok(led.events.filter((e) => e.type === "lane_step_won" && e.laneId === "lane-a").length >= 2, "Lane A step wins logged");
  assert.ok(led.events.some((e) => e.type === "lane_step_open" && e.laneId === "lane-a"), "Lane A open Step 3 card logged");
  assert.ok(led.events.some((e) => e.type === "lane_stopped" && e.laneId === "lane-b"), "Lane B stop logged");
  // Lane B restart placed.
  assert.ok(led.events.some((e) => e.type === "lane_restarted" && e.laneId === "lane-b"), "Lane B restart logged");
  assert.ok(led.events.some((e) => e.type === "lane_step_open" && e.laneId === "lane-b"), "Lane B open Step 1 restart card logged");
});

test("same-game parlay IDs include gameId (no cross-fixture collision)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T18:00:00Z");
  const ids = v.gameSpecific.flatMap((g) => g.parlays.map((p) => p.parlayId));
  assert.equal(new Set(ids).size, ids.length, "all same-game parlay IDs are unique");
});
