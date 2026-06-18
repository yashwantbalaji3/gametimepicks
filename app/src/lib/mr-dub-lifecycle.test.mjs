import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { loadTodaySlate } from "./parlays/ui-loader.ts";

const read = (p) => JSON.parse(fs.readFileSync(`public/data/mr-dub/${p}`, "utf8"));

test("dual-lane lifecycle: stopped Lane A is hidden from public Bank Builder, Lane B stays active", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T18:40:00Z");
  const bb = v.bankBuilderPreview;
  const a = bb.laneA, b = bb.laneB;
  assert.equal(a.laneStatus, "stopped", "Lane A stopped (Czech ML lost on a draw)");
  assert.equal(a.publicVisible, false, "stopped lane hidden from public Bank Builder");
  assert.ok(a.restart && a.restart.status === "queued", "fresh $100 Lane A restart queued");
  assert.equal(b.laneStatus, "active", "Lane B still active");
  assert.equal(b.publicVisible, true, "active lane shown publicly");
  // Lane A Step 2 settled lost from official source.
  const a2 = a.steps.find((s) => s.step === 2);
  assert.equal(a2.result, "lost");
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
  assert.ok(led.events.some((e) => e.type === "lane_stopped"), "stopped lane logged");
  assert.ok(led.events.some((e) => e.type === "lane_restarted"), "restart logged");
  assert.ok(led.events.some((e) => e.publicBankBuilderVisible === false), "a hidden-from-BB event exists");
});

test("same-game parlay IDs include gameId (no cross-fixture collision)", () => {
  const v = loadTodaySlate("2026-06-18", "2026-06-18T18:00:00Z");
  const ids = v.gameSpecific.flatMap((g) => g.parlays.map((p) => p.parlayId));
  assert.equal(new Set(ids).size, ids.length, "all same-game parlay IDs are unique");
});
