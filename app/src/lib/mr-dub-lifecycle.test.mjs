import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));

test("dual-lane lifecycle after June 19 settlement: Lane A advanced (Step 2 won), Lane B stopped (Step 1 lost)", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z");
  const bb = v.bankBuilderPreview;
  const a = bb.laneA, b = bb.laneB;
  // Lane A: Step 1 + Step 2 both WON → advanced, riding to Step 3 (awaiting a clean June 20 card).
  assert.equal(a.laneStatus, "advanced", "Lane A advanced after Step 2 won");
  assert.equal(a.publicVisible, true, "advanced lane shown publicly");
  const a1 = a.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won", "Lane A Step 1 cleared WON");
  const a2 = a.steps.find((s) => s.step === 2);
  assert.equal(a2.status, "settled", "Lane A Step 2 settled");
  assert.equal(a2.result, "won", "Lane A Step 2 WON (USA ML + Gonzales HRR)");
  assert.equal(a.steps.find((s) => s.step === 3).status, "awaiting", "Lane A awaiting a clean June 20 Step 3 card");
  // Lane B: Step 1 LOST → stopped + hidden from the public ladder.
  assert.equal(b.laneStatus, "stopped", "Lane B stopped after Step 1 lost");
  assert.equal(b.publicVisible, false, "stopped lane hidden from the public Bank Builder");
  assert.equal(b.steps.find((s) => s.step === 1).status, "settled", "Lane B Step 1 settled lost");
  assert.equal(b.steps.find((s) => s.step === 1).result, "lost");
});

test("Mr. Dub ledger after reconciliation: bankroll $10,176.17, exposure $0, record 8-2-0-0", () => {
  const p = read("portfolio.json");
  assert.equal(p.paperOnly, true);
  assert.equal(p.crownBankroll, 10376.17, "original completed ladder imported");
  assert.equal(p.currentBankroll, 10176.17, "crown $10,376.17 less two real Lane B lost seeds ($200) — above $10k");
  assert.equal(p.openExposure, 0, "no open cards (future-slate Step 3 candidate removed) → exposure $0");
  assert.deepEqual(p.record, { wins: 8, losses: 2, voids: 0, pending: 0 }, "8-2, no pending (phantom Lane B stops removed)");
  const led = read("ledger.json");
  assert.ok(led.events.some((e) => e.type === "lane_advanced" && e.laneId === "lane-a"), "Lane A advance logged");
  assert.ok(led.events.some((e) => e.type === "lane_stopped" && e.laneId === "lane-b"), "Lane B stop logged");
});

test("same-game parlay IDs include gameId (no cross-fixture collision)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T18:00:00Z");
  const ids = v.gameSpecific.flatMap((g) => g.parlays.map((p) => p.parlayId));
  assert.equal(new Set(ids).size, ids.length, "all same-game parlay IDs are unique");
});
