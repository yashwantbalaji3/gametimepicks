import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));

test("dual-lane lifecycle: Lane A Steps 1+2 won → Step 3 PLACED (active), Lane B stopped (Step 1 lost)", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z");
  const bb = v.bankBuilderPreview;
  const a = bb.laneA, b = bb.laneB;
  // Lane A: Step 1 + Step 2 WON; Step 3 now PLACED (Japan ML + Egypt ML) → lane active, riding $601.56.
  assert.equal(a.laneStatus, "active", "Lane A active — Step 3 card placed");
  assert.equal(a.publicVisible, true, "active lane shown publicly");
  const a1 = a.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won", "Lane A Step 1 cleared WON");
  const a2 = a.steps.find((s) => s.step === 2);
  assert.equal(a2.status, "settled", "Lane A Step 2 settled");
  assert.equal(a2.result, "won", "Lane A Step 2 WON (USA ML + Gonzales HRR)");
  assert.equal(a.steps.find((s) => s.step === 3).status, "pending", "Lane A Step 3 placed (pending official settlement)");
  // Lane B: Step 1 LOST → stopped + hidden from the public ladder.
  assert.equal(b.laneStatus, "stopped", "Lane B stopped after Step 1 lost");
  assert.equal(b.publicVisible, false, "stopped lane hidden from the public Bank Builder");
  assert.equal(b.steps.find((s) => s.step === 1).status, "settled", "Lane B Step 1 settled lost");
  assert.equal(b.steps.find((s) => s.step === 1).result, "lost");
});

test("Mr. Dub ledger: bankroll $9,876.17, exposure $100 (Lane A Step 3 placed), record 8-5-0-1", () => {
  const p = read("portfolio.json");
  assert.equal(p.paperOnly, true);
  assert.equal(p.crownBankroll, 10376.17, "original completed ladder imported");
  assert.equal(p.currentBankroll, 9876.17, "settlement moved the bankroll (Lane B + Moonshot losses realized)");
  assert.equal(p.openExposure, 100, "Lane A Step 3 placed → the lane's $100 paper seed is at risk");
  assert.deepEqual(p.record, { wins: 8, losses: 5, voids: 0, pending: 1 }, "8-5, 1 pending (Lane A Step 3 open)");
  const led = read("ledger.json");
  assert.ok(led.events.some((e) => e.type === "lane_step_open" && e.laneId === "lane-a"), "Lane A Step 3 open card logged");
  assert.ok(led.events.some((e) => e.type === "lane_stopped" && e.laneId === "lane-b"), "Lane B stop logged");
});

test("same-game parlay IDs include gameId (no cross-fixture collision)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T18:00:00Z");
  const ids = v.gameSpecific.flatMap((g) => g.parlays.map((p) => p.parlayId));
  assert.equal(new Set(ids).size, ids.length, "all same-game parlay IDs are unique");
});
