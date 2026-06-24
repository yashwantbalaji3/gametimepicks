import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildPersistedDailyPortfolio, MOONSHOT_MAX_EXPOSURE } from "./daily-portfolio/accounting.ts";
import { buildDailyPortfolio } from "./mr-dub/daily-portfolio.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z"; // before every June-23 kickoff, outside the 30m cutoff
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
const decToAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));

test("plan (dry-run): four lanes, all eligible, $0 exposure (no placement)", () => {
  const plan = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ false);
  assert.equal(plan.lanes.length, 4, "Bank Builder A/B + Moonshot A/B");
  assert.equal(plan.openExposure, 0, "dry-run places no exposure");
  assert.equal(plan.availableBankroll, plan.activeBankroll, "available = active when nothing placed");
  for (const l of plan.lanes) assert.notEqual(l.status, "active", "no lane active in dry-run");
});

test("apply: exposure math — BB $200 + Moonshot $50 = $250, available = active − exposure, active bankroll + crown UNCHANGED", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ true);
  assert.equal(dp.activeBankroll, 10176.17, "active bankroll unchanged at activation");
  assert.equal(dp.crownBankroll, 10376.17, "crown untouched");
  assert.equal(dp.products.bankBuilder.exposure, 200, "Bank Builder exposure $200 (2 lanes × $100)");
  assert.equal(dp.products.moonshot.exposure, 50, "Moonshot exposure $50 (2 lanes × $25)");
  assert.equal(dp.openExposure, 250, "total open exposure $250");
  assert.equal(dp.availableBankroll, 9926.17, "available = active − exposure");
  assert.ok(dp.products.moonshot.exposure <= MOONSHOT_MAX_EXPOSURE, "moonshot exposure within cap");
  assert.equal(dp.lanes.filter((l) => l.status === "active").length, 4, "all 4 lanes active");
});

test("apply: Bank Builder lanes = 2 legs each, Moonshot lanes = 5 legs each; combined odds reconcile", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const moon = dp.lanes.filter((l) => l.product === "moonshot");
  assert.equal(bb.length, 2); assert.equal(moon.length, 2);
  for (const l of bb) assert.equal(l.legCount, 2, "Bank Builder lane = 2 legs");
  for (const l of moon) assert.equal(l.legCount, 5, "Moonshot lane = 5 legs");
  for (const l of dp.lanes) {
    const d = l.legs.reduce((p, g) => p * dec(g.odds), 1);
    assert.ok(Math.abs(decToAmerican(d) - l.combinedOdds) <= 3, `${l.id} combined odds reconcile from legs`);
    assert.ok(Math.abs(l.potentialReturn - l.stake * d) < 0.5, `${l.id} potential return = stake × combined decimal`);
  }
});

test("apply: max 1 leg per game for Bank Builder; Moonshot 2nd-leg-per-game carries a correlation note", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  for (const l of dp.lanes.filter((x) => x.product === "bank-builder")) {
    const games = l.legs.map((g) => g.matchup);
    assert.equal(new Set(games).size, games.length, "Bank Builder: max 1 leg per game");
  }
  for (const l of dp.lanes.filter((x) => x.product === "moonshot")) {
    const games = l.legs.map((g) => g.matchup);
    if (new Set(games).size < games.length) assert.ok(l.correlationNote, "Moonshot same-game leg has a correlation note");
  }
});

test("started-game guard: nothing is eligible/active once a leg's game has started", () => {
  const after = buildPersistedDailyPortfolio(root, "2026-06-25T00:00:00Z", DATE, "2026-06-25T00:00:00Z", true);
  assert.equal(after.openExposure, 0, "no exposure after kickoff (started games not activatable)");
  for (const l of after.lanes) assert.notEqual(l.status, "active", "no lane active once games started");
});

test("no leg duplicated across the four lanes", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const ids = dp.lanes.flatMap((l) => l.legs.map((g) => g.id));
  assert.equal(new Set(ids).size, ids.length, "each model leg used once across all lanes");
});

test("persisted daily-portfolio.json reflects the current day (post June-23 settlement: June 24, both lanes advanced + awaiting, $0 exposure)", () => {
  // After June 23 settled (Lane A Step 4 + Lane B Step 2 WON), the daily portfolio rolls to June 24, where
  // no qualified card exists yet → both lanes awaiting, $0 placed. The $200/$50 activation MATH is still
  // covered by the "apply: exposure math" generator test above.
  const p = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  assert.equal(p.version, "daily-portfolio-v1");
  assert.equal(p.date, "2026-06-24");
  assert.equal(p.openExposure, 0); assert.equal(p.availableBankroll, 10176.17);
  assert.equal(p.activeBankroll, 10176.17); assert.equal(p.crownBankroll, 10376.17);
  assert.equal(p.lanes.filter((l) => l.status === "active").length, 0, "no active lane — June 24 has no qualified card yet");
  assert.equal(p.settlement.status, "none"); assert.equal(p.settlement.realizedPnl, 0);
});

test("daily-portfolio read view reflects the persisted state (June 24 awaiting, $0)", () => {
  const dp = buildDailyPortfolio(root, "2026-06-24T10:00:00Z", "2026-06-24");
  assert.equal(dp.openExposure, 0);
  assert.equal(dp.availableBankroll, 10176.17);
  assert.equal(dp.exposure.core, 0);
  assert.equal(dp.exposure.moonshot, 0);
  assert.equal(dp.anyActive, false);
  assert.equal(dp.cards.filter((c) => c.status === "active").length, 0);
});

test("ACTIVATION NEVER mutates the legacy portfolio/crown/record", () => {
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(p.currentBankroll, 10176.17, "active bankroll (legacy) unchanged");
  assert.equal(p.crownBankroll, 10376.17, "crown untouched");
  assert.equal(p.openExposure, 0, "legacy dual-ladder exposure $0 (separate from daily portfolio)");
  assert.deepEqual(p.record, { wins: 12, losses: 2, voids: 0, pending: 0 }, "core record 12-2-0-0 (only settlement changes it)");
  assert.deepEqual(p.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record separate");
});

test("Bank Builder + Moonshot both render the shared ladder; Moonshot has a step rail", () => {
  const ladder = read("src/components/ladders/product-lanes-ladder.tsx");
  assert.match(ladder, /Step/i, "ladder renders steps");
  const moon = read("src/app/moonshot/page.tsx");
  const bank = read("src/app/bank-builder/page.tsx");
  assert.match(moon, /ProductLanesLadder/, "moonshot uses the shared step-rail ladder");
  // Bank Builder consolidated to a SINGLE ladder section ("Today's Dual Bank Builder" = DualLadderBoard)
  // with the current step's daily legs injected into its open step drawer.
  assert.match(bank, /DualLadderBoard/, "bank-builder uses the single Dual Bank Builder ladder");
  assert.match(moon, /buildDailyPortfolio/, "moonshot reads the daily portfolio");
});
