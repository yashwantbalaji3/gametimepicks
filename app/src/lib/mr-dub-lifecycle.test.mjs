import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));

test("dual-lane lifecycle after June 24 settlement: Lane A COMPLETED the $10K ladder (Step 5 settled WON), Lane B stopped (Step 3 settled LOST)", () => {
  const v = loadTodaySlate("2026-06-19", "2026-06-19T16:00:00Z");
  const bb = v.bankBuilderPreview;
  const a = bb.laneA, b = bb.laneB;
  // Lane A: Steps 1-5 all WON; Step 5 settled WON → the $10K ladder is COMPLETED (operator-gated banking).
  assert.equal(a.laneStatus, "completed", "Lane A completed the ladder after Step 5 settled WON");
  assert.equal(a.publicVisible, true, "completed lane shown publicly");
  const a1 = a.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "settled");
  assert.equal(a1.result, "won", "Lane A Step 1 cleared WON");
  const a2 = a.steps.find((s) => s.step === 2);
  assert.equal(a2.status, "settled", "Lane A Step 2 settled");
  assert.equal(a2.result, "won", "Lane A Step 2 WON (USA ML + Gonzales HRR)");
  const a5 = a.steps.find((s) => s.step === 5);
  assert.equal(a5.status, "settled", "Lane A Step 5 settled");
  assert.equal(a5.result, "won", "Lane A Step 5 settled WON → ladder completed ($10089.23, official)");
  // Lane B: Steps 1 + 2 WON, then Step 3 settled LOST (Brazil ML won; Switzerland/Canada Under 2.5 lost) → lane stopped.
  assert.equal(b.laneStatus, "stopped", "Lane B stopped after Step 3 settled LOST");
  assert.equal(b.publicVisible, true, "stopped lane shown publicly");
  const b1 = b.steps.find((s) => s.step === 1);
  assert.equal(b1.status, "settled", "Lane B Step 1 card settled");
  assert.equal(b1.result, "won", "Lane B Step 1 cleared WON (Argentina ML + France/Iraq Under 3.5)");
  const b3 = b.steps.find((s) => s.step === 3);
  assert.equal(b3.status, "settled", "Lane B Step 3 settled");
  assert.equal(b3.result, "lost", "Lane B Step 3 settled LOST → lane stopped");
});

test("Mr. Dub ledger after June 24 settlement: Lane A WON+completed, Lane B lost — bankroll $10,076.17, exposure $0, record 13-3-0-0", () => {
  const p = read("portfolio.json");
  assert.equal(p.paperOnly, true);
  assert.equal(p.crownBankroll, 10376.17, "original completed ladder imported — crown immutable");
  assert.equal(p.currentBankroll, 10076.17, "crown $10,376.17 less three real lost seeds ($300, incl. Lane B Step 3) — above $10k");
  assert.equal(p.openExposure, 0, "Lane A completed the ladder (pending operator banking) + Lane B settled LOST → no open seeds, $0 open");
  assert.deepEqual(p.record, { wins: 13, losses: 3, voids: 0, pending: 0 }, "13-3-0-0 (Lane A Step 5 WON; Lane B Step 3 LOST)");
  const led = read("ledger.json");
  // Lane A advance is logged as five cleared step wins (Step 5 now settled WON) plus the ladder completion.
  assert.ok(led.events.filter((e) => e.type === "lane_step_won" && e.laneId === "lane-a").length >= 5, "Lane A five step wins logged");
  assert.ok(led.events.some((e) => e.type === "lane_step_won" && e.laneId === "lane-a" && e.step === 5), "Lane A Step 5 WON card logged");
  assert.ok(led.events.some((e) => e.type === "ladder_completed" && e.laneId === "lane-a"), "Lane A ladder completion logged");
  // Lane B's new Step 3 loss is logged as a stop (realizes -$100, retained in history).
  const bStop = led.events.find((e) => e.type === "lane_stopped" && e.laneId === "lane-b" && e.date === "2026-06-24");
  assert.ok(bStop && bStop.paperProfit === -100, "Lane B Step 3 stop realizes -$100 (June 24)");
  // Lane B prior restart + step wins still carried in the full history (no bankroll double-count).
  assert.ok(led.events.some((e) => e.type === "lane_restarted" && e.laneId === "lane-b"), "Lane B restart logged");
  assert.ok(led.events.some((e) => e.type === "lane_step_won" && e.laneId === "lane-b" && e.date === "2026-06-22"), "Lane B Step 1 restart cleared WON card logged");
});

test("same-game parlay IDs include gameId (no cross-fixture collision)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T18:00:00Z");
  const ids = v.gameSpecific.flatMap((g) => g.parlays.map((p) => p.parlayId));
  assert.equal(new Set(ids).size, ids.length, "all same-game parlay IDs are unique");
});
