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
const round2 = (n) => Math.round(n * 100) / 100;

test("plan (dry-run): both BB lanes (fresh Step-1 restarts) + two Moonshot lanes → 4 lanes, $0 exposure (dry-run places nothing)", () => {
  const plan = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ false);
  // Post June-27 restarts: both lanes LOST their June-27 Step and were restarted fresh (Lane A cycle 5, Lane B
  // cycle 4), so each surfaces a fresh Step-1 Bank Builder lane. The day is BB A/B + Moonshot A/B = 4 lanes.
  assert.equal(plan.lanes.filter((l) => l.product === "bank-builder").length, 2, "two Bank Builder lanes (both fresh Step-1 restarts)");
  assert.equal(plan.lanes.length, 4, "BB A/B + Moonshot A/B");
  assert.equal(plan.openExposure, 0, "dry-run places no exposure");
  assert.equal(plan.availableBankroll, plan.activeBankroll, "available = active when nothing placed");
  for (const l of plan.lanes) assert.notEqual(l.status, "active", "no lane active in dry-run");
});

test("apply: exposure math — fresh-restart BB lanes activate ($100 seed each); Moonshot adaptive; money UNCHANGED", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ true);
  assert.equal(dp.activeBankroll, 19765.40, "active bankroll unchanged at activation (post June-27 canonical)");
  assert.equal(dp.crownBankroll, 20465.40, "crown untouched");
  // Post June-27 restarts: both lanes restarted fresh on Step-1 (each an active BB lane, $100 seed).
  const activeBB = dp.lanes.filter((l) => l.product === "bank-builder" && l.status === "active");
  assert.equal(dp.products.bankBuilder.exposure, round2(activeBB.length * 100), "Bank Builder exposure = $100 × active lanes");
  const activeMoon = dp.lanes.filter((l) => l.product === "moonshot" && l.status === "active");
  assert.equal(dp.products.moonshot.exposure, round2(activeMoon.length * 25), "moonshot exposure = $25 × active lanes");
  assert.ok(dp.products.moonshot.exposure <= MOONSHOT_MAX_EXPOSURE, "moonshot exposure within cap");
  assert.equal(dp.openExposure, round2(dp.products.bankBuilder.exposure + dp.products.moonshot.exposure), "open = BB + moonshot");
  assert.equal(dp.availableBankroll, round2(dp.activeBankroll - dp.openExposure), "available = active − exposure");
});

test("apply: two BB lanes (both fresh Step-1 restarts); Moonshot lanes ≤ 5 legs, ≥1 leg/game; combined odds reconcile", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const moon = dp.lanes.filter((l) => l.product === "moonshot");
  assert.equal(bb.length, 2, "two Bank Builder lanes (both fresh Step-1 restarts post June-27)");
  for (const l of bb) assert.ok(l.legCount <= 4, "Bank Builder lane ≤ 4 legs (rung card)");
  assert.equal(moon.length, 2, "Moonshot A/B present");
  for (const l of moon) assert.ok(l.legCount <= 5, "Moonshot lane ≤ 5 legs (up to 5, valid at 3)");
  for (const l of dp.lanes) {
    if (!l.legs.length) continue;
    const d = l.legs.reduce((p, g) => p * dec(g.odds), 1);
    assert.ok(Math.abs(decToAmerican(d) - l.combinedOdds) <= 3, `${l.id} combined odds reconcile from legs`);
    assert.ok(Math.abs(l.potentialReturn - l.stake * d) < 0.5, `${l.id} potential return = stake × combined decimal`);
  }
});

test("apply: max 1 leg per game within EVERY lane (Bank Builder AND Moonshot — independent legs, no SGP)", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  for (const l of dp.lanes) {
    const games = l.legs.map((g) => g.matchup);
    assert.equal(new Set(games).size, games.length, `${l.product} ${l.lane}: max 1 leg per game (no fabricated SGP)`);
  }
});

test("started-game guard: nothing is eligible/active once a leg's game has started", () => {
  const after = buildPersistedDailyPortfolio(root, "2026-06-25T00:00:00Z", DATE, "2026-06-25T00:00:00Z", true);
  assert.equal(after.openExposure, 0, "no exposure after kickoff (started games not activatable)");
  for (const l of after.lanes) assert.notEqual(l.status, "active", "no lane active once games started");
});

test("no leg duplicated across the active day's lanes", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const ids = dp.lanes.flatMap((l) => l.legs.map((g) => g.id));
  assert.equal(new Set(ids).size, ids.length, "each model leg used once across all lanes");
});

test("persisted daily-portfolio.json (fresh cycle 5/4) is internally consistent + never touches canonical money", () => {
  // After Ladder #2 was banked, the daily portfolio rolls to a fresh dual-BB cycle. Whether the day's lanes
  // are active (real cards placed) or awaiting depends on the live slate, so assert the INVARIANTS.
  const p = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  assert.equal(p.version, "daily-portfolio-v1");
  assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/, "date is the current slate (rolls daily — date-agnostic)");
  assert.equal(p.activeBankroll, 19765.40); assert.equal(p.crownBankroll, 20465.40);
  const sumExp = p.lanes.filter((l) => l.status === "active").reduce((s, l) => s + (l.exposure ?? 0), 0);
  assert.equal(p.openExposure, sumExp, "open exposure = Σ active-lane seed exposures, nothing else");
  assert.equal(p.availableBankroll, Math.round((p.activeBankroll - p.openExposure) * 100) / 100, "available = active − exposure");
  assert.equal(p.settlement.realizedPnl, 0, "no realized P/L until official settlement");
  // Canonical money is untouched by the daily view. Banking Ladder #2 ($10,089.23) lifted the crown to the
  // Σ of the two completed-ladder finals (10,376.17 + 10,089.23 = 20,465.40). The June-25/26/27 dual-lane
  // settlements then moved the active bankroll (7 lost seeds → 19,765.40) and the record to 15-7.
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(port.currentBankroll, 19765.40); assert.equal(port.crownBankroll, 20465.40);
  assert.deepEqual(port.record, { wins: 15, losses: 7, voids: 0, pending: 0 });
});

test("daily-portfolio read view reflects the persisted state + is internally consistent", () => {
  const liveDate = JSON.parse(read("public/data/mr-dub/daily-portfolio.json")).date; // current slate (date-agnostic)
  const dp = buildDailyPortfolio(root, `${liveDate}T10:00:00Z`, liveDate);
  assert.equal(dp.activeBankroll, 19765.40);
  assert.equal(Math.round((dp.exposure.core + dp.exposure.moonshot) * 100) / 100, dp.openExposure, "core + moonshot = open exposure");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
  assert.equal(dp.anyActive, dp.cards.some((c) => c.status === "active"), "anyActive reflects the cards");
});

test("ACTIVATION NEVER mutates the legacy portfolio/crown/record", () => {
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Banking Ladder #2 ($10,089.23) lifted the crown to 20,465.40 (Σ of the two completed-ladder finals).
  // The June-25/26/27 dual-lane settlements then moved the canonical money: seven lost seeds total (3 prior +
  // June-25 Lane B + June-26 Lane A Step-2 + two June-27 Step losses) drop the active bankroll to 19,765.40 and
  // the record to 15-7. Daily-portfolio activation itself must never touch this canonical money state.
  assert.equal(p.currentBankroll, 19765.40, "active bankroll (legacy) reflects banked Ladder #2 + 7 dual-lane lost seeds");
  assert.equal(p.crownBankroll, 20465.40, "crown = Σ of two completed-ladder finals");
  assert.equal(p.openExposure, 0, "legacy dual-ladder exposure $0 (fresh cycle 5/4 cards live in the daily portfolio, separate)");
  assert.deepEqual(p.record, { wins: 15, losses: 7, voids: 0, pending: 0 }, "core record 15-7-0-0 (both lanes lost their June-27 Step → restarted)");
  assert.deepEqual(p.moonshot.record, { wins: 0, losses: 1, voids: 0, pending: 0 }, "moonshot record separate");
});

test("Bank Builder + Moonshot both render the shared ladder; Moonshot has a step rail", () => {
  const ladder = read("src/components/ladders/product-lanes-ladder.tsx");
  assert.match(ladder, /Step/i, "ladder renders steps");
  const moon = read("src/app/moonshot/page.tsx");
  const bank = read("src/app/bank-builder/page.tsx");
  assert.match(moon, /ProductLanesLadder/, "moonshot uses the shared step-rail ladder");
  // Bank Builder consolidated to a SINGLE ladder visualization (ClimbHero) — it renders the per-lane
  // 5-rung climb with the current step's daily legs in each lane card.
  assert.match(bank, /<ClimbHero/, "bank-builder uses the single ClimbHero ladder");
  assert.match(moon, /buildDailyPortfolio/, "moonshot reads the daily portfolio");
});
