import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));

test("dual-lane lifecycle after June 19 placement: Lane A Step 2 active, Lane B Step 1 restart active", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z");
  const bb = v.bankBuilderPreview;
  const a = bb.laneA, b = bb.laneB;
  // Lane A cleared Step 1 (Mexico DNB + Soto) and advanced; Step 2 now carries a placed card.
  assert.equal(a.laneStatus, "advanced", "Lane A advanced after Step 1 won");
  assert.equal(a.publicVisible, true, "advanced lane shown publicly");
  const a1 = a.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won", "Lane A Step 1 cleared WON");
  assert.ok(a1.legs.every((l) => l.settlementResult === "won"), "both Lane A legs graded won");
  assert.equal(a.steps.find((s) => s.step === 2).status, "pending", "Lane A Step 2 active card placed");
  // Lane B restarted at a fresh Step 1 (active card); its lost Step 2 stays hidden.
  assert.equal(b.publicVisible, true, "restarted lane shown publicly");
  assert.equal(b.steps.find((s) => s.step === 1).status, "pending", "Lane B Step 1 restart active");
  assert.ok(!/Goldschmidt|Switzerland/.test(JSON.stringify(b.steps)), "stopped Step-2 legs hidden from the live lane");
});

test("Mr. Dub ledger after June 19 placement: bankroll $10,176.17, exposure $297.88, record 8-2-0-2 pending", () => {
  const p = read("portfolio.json");
  assert.equal(p.paperOnly, true);
  assert.equal(p.crownBankroll, 10376.17, "original completed ladder imported");
  assert.equal(p.currentBankroll, 10176.17, "bankroll unchanged by placement — only settlement moves it");
  assert.equal(p.openExposure, 297.88, "Lane A Step 2 $197.88 + Lane B Step 1 $100 placed");
  assert.deepEqual(p.record, { wins: 8, losses: 2, voids: 0, pending: 2 }, "8-2 with 2 pending placements");
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
