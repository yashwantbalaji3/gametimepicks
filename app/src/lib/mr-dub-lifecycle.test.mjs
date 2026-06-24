import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));

test("dual-lane lifecycle after June 19 settlement + cross-slate resume: Lane A advanced (Step 3 settled WON), Lane B advanced (Step 1 restart WON)", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z");
  const bb = v.bankBuilderPreview;
  const a = bb.laneA, b = bb.laneB;
  // Lane A: Steps 1 + 2 + 3 all WON; Step 3 settled WON (Egypt + Algeria, official) → lane advanced.
  assert.equal(a.laneStatus, "advanced", "Lane A advanced after Step 3 settled WON");
  assert.equal(a.publicVisible, true, "advanced lane shown publicly");
  const a1 = a.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won", "Lane A Step 1 cleared WON");
  const a2 = a.steps.find((s) => s.step === 2);
  assert.equal(a2.status, "settled", "Lane A Step 2 settled");
  assert.equal(a2.result, "won", "Lane A Step 2 WON (USA ML + Gonzales HRR)");
  const a3 = a.steps.find((s) => s.step === 3);
  assert.equal(a3.status, "settled", "Lane A Step 3 settled");
  assert.equal(a3.result, "won", "Lane A Step 3 settled WON (Egypt ML + Algeria ML, official)");
  // Lane B: the $100 Step 1 restart settled WON (official) → the lane advanced, shown publicly.
  assert.equal(b.laneStatus, "advanced", "Lane B advanced after the restart cleared WON");
  assert.equal(b.publicVisible, true, "advanced restart lane shown publicly");
  const b1 = b.steps.find((s) => s.step === 1);
  assert.equal(b1.status, "settled", "Lane B Step 1 restart card settled");
  assert.equal(b1.result, "won", "Lane B Step 1 restart cleared WON (Argentina ML + France/Iraq Under 3.5)");
});

test("Mr. Dub ledger after reconciliation + both lanes settled WON: bankroll $10,176.17, exposure $0, record 12-2-0-0", () => {
  const p = read("portfolio.json");
  assert.equal(p.paperOnly, true);
  assert.equal(p.crownBankroll, 10376.17, "original completed ladder imported");
  assert.equal(p.currentBankroll, 10176.17, "crown $10,376.17 less two real Lane B lost seeds ($200) — above $10k");
  assert.equal(p.openExposure, 0, "Lane A Step 3 settled WON + Lane B settled WON → both seeds released, $0 open");
  assert.deepEqual(p.record, { wins: 12, losses: 2, voids: 0, pending: 0 }, "12-2-0-0 (Lane A Step 4 WON; Lane B Step 2 WON)");
  const led = read("ledger.json");
  // Lane A advance is logged as three cleared step wins (Step 3 now settled WON, no open card).
  assert.ok(led.events.filter((e) => e.type === "lane_step_won" && e.laneId === "lane-a").length >= 3, "Lane A three step wins logged");
  assert.ok(led.events.some((e) => e.type === "lane_step_won" && e.laneId === "lane-a" && e.step === 3), "Lane A Step 3 WON card logged");
  assert.ok(led.events.some((e) => e.type === "lane_stopped" && e.laneId === "lane-b"), "Lane B stop logged");
  // Lane B restart placed and then cleared WON.
  assert.ok(led.events.some((e) => e.type === "lane_restarted" && e.laneId === "lane-b"), "Lane B restart logged");
  assert.ok(led.events.some((e) => e.type === "lane_step_won" && e.laneId === "lane-b" && e.date === "2026-06-22"), "Lane B Step 1 restart cleared WON card logged");
});

test("same-game parlay IDs include gameId (no cross-fixture collision)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T18:00:00Z");
  const ids = v.gameSpecific.flatMap((g) => g.parlays.map((p) => p.parlayId));
  assert.equal(new Set(ids).size, ids.length, "all same-game parlay IDs are unique");
});
