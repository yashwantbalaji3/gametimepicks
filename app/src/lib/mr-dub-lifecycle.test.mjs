import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));

test("dual-lane lifecycle: Lane A relaunched as a fresh active Step 1, Lane B stays active on Step 2", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T20:40:00Z");
  const bb = v.bankBuilderPreview;
  const a = bb.laneA, b = bb.laneB;
  // Lane A is now a FRESH $100 lane (the prior stopped lane was relaunched, not retroactively edited).
  assert.equal(a.laneStatus, "active", "Lane A relaunched active");
  assert.equal(a.publicVisible, true, "fresh active lane shown publicly");
  const a1 = a.steps.find((s) => s.step === 1);
  assert.equal(a1.status, "pending", "Lane A fresh Step 1 is live/pending");
  assert.equal(a1.stake, 100, "fresh lane starts from $100");
  assert.ok(a1.payout >= 190 && a1.payout <= 225, "fresh Step 1 targets ~$200");
  assert.equal(a1.legs.length, 2, "two fresh legs");
  assert.ok(a1.legs.some((l) => l.sport === "WORLD_CUP") && a1.legs.some((l) => l.sport === "MLB"), "one World Cup + one MLB leg");
  // No reuse of the failed Czech leg or the old Josh Bell leg.
  assert.ok(a1.legs.every((l) => !/Czech/i.test(l.participant ?? "") && !/Josh Bell/i.test(l.participant ?? "")), "no Czech, no Josh Bell");
  assert.equal(b.laneStatus, "active", "Lane B still active");
  assert.equal(b.publicVisible, true, "active lane shown publicly");
});

test("Mr. Dub ledger: seeded from the $100 → $10,376.17 crown + dual-lane events, math holds", () => {
  const p = read("portfolio.json");
  assert.equal(p.paperOnly, true);
  assert.equal(p.crownBankroll, 10376.17, "original completed ladder imported");
  assert.ok(p.record.wins >= 5, "at least the 5 crown wins counted");
  assert.ok(p.record.losses >= 1, "Lane A Step 2 loss counted");
  assert.ok(p.openExposure > 0, "Lane B open exposure tracked");
  // current bankroll = crown minus the stopped lane's staked paper.
  assert.ok(p.currentBankroll < p.crownBankroll, "stopped lane reduced the paper bankroll");
  const led = read("ledger.json");
  assert.ok(led.events.some((e) => e.type === "lane_stopped"), "prior stopped lane logged");
  assert.ok(led.events.some((e) => e.type === "lane_relaunch_blocked"), "blocked same-step relaunch logged");
  assert.ok(led.events.some((e) => e.type === "lane_step_open" && e.relaunch === true && e.laneId === "lane-a"), "fresh Lane A relaunch open card logged");
  assert.ok(led.events.some((e) => e.publicBankBuilderVisible === false), "a hidden-from-BB event exists");
});

test("same-game parlay IDs include gameId (no cross-fixture collision)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T18:00:00Z");
  const ids = v.gameSpecific.flatMap((g) => g.parlays.map((p) => p.parlayId));
  assert.equal(new Set(ids).size, ids.length, "all same-game parlay IDs are unique");
});
