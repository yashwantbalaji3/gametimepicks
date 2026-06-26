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

test("plan (dry-run): one advancing BB lane (Lane A → Step 2) + two Moonshot lanes → 3 lanes, $0 exposure (dry-run places nothing)", () => {
  const plan = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ false);
  // Post June-25 settlement: Lane A WON its Step-1 and ADVANCED (now on Step 2, stake $201.08), while Lane B
  // LOST its Step-1 and STOPPED. Only Lane A surfaces a Bank Builder lane; the day is BB A + Moonshot A/B = 3 lanes.
  assert.equal(plan.lanes.filter((l) => l.product === "bank-builder").length, 1, "one advancing Bank Builder lane (Lane A on Step 2; Lane B stopped)");
  assert.equal(plan.lanes.length, 3, "BB A + Moonshot A/B");
  assert.equal(plan.openExposure, 0, "dry-run places no exposure");
  assert.equal(plan.availableBankroll, plan.activeBankroll, "available = active when nothing placed");
  for (const l of plan.lanes) assert.notEqual(l.status, "active", "no lane active in dry-run");
});

test("apply: exposure math — Lane A advancing BB lane activates ($100 seed); Moonshot adaptive; money UNCHANGED", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ true);
  assert.equal(dp.activeBankroll, 20065.40, "active bankroll unchanged at activation (post June-25 canonical)");
  assert.equal(dp.crownBankroll, 20465.40, "crown untouched");
  // Post June-25: Lane A advanced to Step 2 (one active BB lane, $100 seed exposure); Lane B stopped.
  const activeBB = dp.lanes.filter((l) => l.product === "bank-builder" && l.status === "active");
  assert.equal(dp.products.bankBuilder.exposure, round2(activeBB.length * 100), "Bank Builder exposure = $100 × active lanes (two fresh Step-1 lanes → $200)");
  const activeMoon = dp.lanes.filter((l) => l.product === "moonshot" && l.status === "active");
  assert.equal(dp.products.moonshot.exposure, round2(activeMoon.length * 25), "moonshot exposure = $25 × active lanes");
  assert.ok(dp.products.moonshot.exposure <= MOONSHOT_MAX_EXPOSURE, "moonshot exposure within cap");
  assert.equal(dp.openExposure, round2(dp.products.bankBuilder.exposure + dp.products.moonshot.exposure), "open = BB + moonshot");
  assert.equal(dp.availableBankroll, round2(dp.activeBankroll - dp.openExposure), "available = active − exposure");
});

test("apply: one advancing BB lane (Lane A Step-2); Moonshot lanes ≤ 5 legs, ≥1 leg/game; combined odds reconcile", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const moon = dp.lanes.filter((l) => l.product === "moonshot");
  assert.equal(bb.length, 1, "one advancing Bank Builder lane (Lane A on Step 2; Lane B stopped post June-25)");
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

test("no leg duplicated across the four lanes", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const ids = dp.lanes.flatMap((l) => l.legs.map((g) => g.id));
  assert.equal(new Set(ids).size, ids.length, "each model leg used once across all lanes");
});

test("persisted daily-portfolio.json (fresh cycle-2) is internally consistent + never touches canonical money", () => {
  // After Ladder #2 was banked, the daily portfolio rolls to a fresh dual-BB cycle. Whether the day's lanes
  // are active (real cards placed) or awaiting depends on the live slate, so assert the INVARIANTS.
  const p = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  assert.equal(p.version, "daily-portfolio-v1");
  assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/, "date is the current slate (rolls daily — date-agnostic)");
  assert.equal(p.activeBankroll, 20065.40); assert.equal(p.crownBankroll, 20465.40);
  const sumExp = p.lanes.filter((l) => l.status === "active").reduce((s, l) => s + (l.exposure ?? 0), 0);
  assert.equal(p.openExposure, sumExp, "open exposure = Σ active-lane seed exposures, nothing else");
  assert.equal(p.availableBankroll, Math.round((p.activeBankroll - p.openExposure) * 100) / 100, "available = active − exposure");
  assert.equal(p.settlement.realizedPnl, 0, "no realized P/L until official settlement");
  // Canonical money is untouched by the daily view. Banking Ladder #2 ($10,089.23) lifted the crown to the
  // Σ of the two completed-ladder finals (10,376.17 + 10,089.23 = 20,465.40); the record stayed 13-3.
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(port.currentBankroll, 20065.40); assert.equal(port.crownBankroll, 20465.40);
  assert.deepEqual(port.record, { wins: 14, losses: 4, voids: 0, pending: 0 });
});

test("daily-portfolio read view reflects the persisted state + is internally consistent", () => {
  const liveDate = JSON.parse(read("public/data/mr-dub/daily-portfolio.json")).date; // current slate (date-agnostic)
  const dp = buildDailyPortfolio(root, `${liveDate}T10:00:00Z`, liveDate);
  assert.equal(dp.activeBankroll, 20065.40);
  assert.equal(Math.round((dp.exposure.core + dp.exposure.moonshot) * 100) / 100, dp.openExposure, "core + moonshot = open exposure");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
  assert.equal(dp.anyActive, dp.cards.some((c) => c.status === "active"), "anyActive reflects the cards");
});

test("ACTIVATION NEVER mutates the legacy portfolio/crown/record", () => {
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Banking Ladder #2 ($10,089.23) lifted the crown to 20,465.40 (Σ of the two completed-ladder finals).
  // The June-25 dual-lane settlement then moved the canonical money: Lane A Step-1 WON (rolls, +1 win) and
  // Lane B Step-1 LOST (drops the $100 seed, +1 loss) → bankroll 20165.40 → 20065.40 and record 13-3 → 14-4.
  // Daily-portfolio activation itself must never touch this canonical money state.
  assert.equal(p.currentBankroll, 20065.40, "active bankroll (legacy) reflects banked Ladder #2 + June-25 lost seed");
  assert.equal(p.crownBankroll, 20465.40, "crown = Σ of two completed-ladder finals");
  assert.equal(p.openExposure, 0, "legacy dual-ladder exposure $0 (fresh cycle-2 cards live in the daily portfolio, separate)");
  assert.deepEqual(p.record, { wins: 14, losses: 4, voids: 0, pending: 0 }, "core record 14-4-0-0 (June-25: Lane A won, Lane B lost)");
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
