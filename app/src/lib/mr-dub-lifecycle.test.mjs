import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));

test("dual-lane lifecycle after settlement: Lane A advanced (Step 1 WON), Lane B stopped (Step 2 lost)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-19T03:48:00Z");
  const bb = v.bankBuilderPreview;
  const a = bb.laneA, b = bb.laneB;
  // Lane A cleared Step 1 (Mexico DNB + Soto) and advanced; it stays public.
  assert.equal(a.laneStatus, "advanced", "Lane A advanced after Step 1 won");
  assert.equal(a.publicVisible, true, "advanced lane shown publicly");
  const a1 = a.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won", "Lane A Step 1 cleared WON");
  assert.ok(a1.legs.every((l) => l.settlementResult === "won"), "both Lane A legs graded won");
  // Lane B lost Step 2 (Goldschmidt HRR 1) → stopped + hidden from the public Bank Builder.
  assert.equal(b.laneStatus, "stopped", "Lane B stopped after Step 2 lost");
  assert.equal(b.publicVisible, false, "stopped lane hidden from public Bank Builder");
  assert.ok(b.restart && b.restart.status === "queued", "fresh $100 Lane B restart queued");
});

test("Mr. Dub ledger after settlement: bankroll $10,176.17, exposure $0, record 8-2-0-0", () => {
  const p = read("portfolio.json");
  assert.equal(p.paperOnly, true);
  assert.equal(p.crownBankroll, 10376.17, "original completed ladder imported");
  assert.equal(p.currentBankroll, 10176.17, "Lane B Step 2 loss realized -$100; Lane A win rolled $0");
  assert.equal(p.openExposure, 0, "no card placed — both lanes between cards");
  assert.deepEqual(p.record, { wins: 8, losses: 2, voids: 0, pending: 0 }, "8-2-0-0 after settlement");
  const led = read("ledger.json");
  assert.ok(led.events.some((e) => e.type === "lane_advanced" && e.laneId === "lane-a"), "Lane A advance logged");
  assert.ok(led.events.filter((e) => e.type === "lane_stopped").length === 2, "old Lane A + Lane B stops logged");
  assert.ok(led.events.some((e) => e.type === "lane_restarted" && e.laneId === "lane-b"), "Lane B restart queued logged");
  assert.ok(led.events.some((e) => e.type === "lane_relaunch_blocked"), "prior blocked same-step relaunch retained");
});

test("same-game parlay IDs include gameId (no cross-fixture collision)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T18:00:00Z");
  const ids = v.gameSpecific.flatMap((g) => g.parlays.map((p) => p.parlayId));
  assert.equal(new Set(ids).size, ids.length, "all same-game parlay IDs are unique");
});
