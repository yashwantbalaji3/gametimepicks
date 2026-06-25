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

test("plan (dry-run): three lanes (Lane A completed the ladder), all eligible, $0 exposure (no placement)", () => {
  const plan = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ false);
  // After the official settlement, Lane A COMPLETED the $10k ladder (pending operator banking), so only
  // Bank Builder Lane B remains as a BB lane alongside Moonshot A/B → 3 lanes.
  assert.equal(plan.lanes.length, 3, "Bank Builder B + Moonshot A/B (Lane A completed the ladder)");
  assert.equal(plan.lanes.filter((l) => l.product === "bank-builder").length, 1, "only Lane B remains for Bank Builder");
  assert.equal(plan.openExposure, 0, "dry-run places no exposure");
  assert.equal(plan.availableBankroll, plan.activeBankroll, "available = active when nothing placed");
  for (const l of plan.lanes) assert.notEqual(l.status, "active", "no lane active in dry-run");
});

test("apply: exposure math — BB $100 active (Lane B only); Moonshot adaptive (awaits a thin slate); money UNCHANGED", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ true);
  assert.equal(dp.activeBankroll, 10076.17, "active bankroll unchanged at activation");
  assert.equal(dp.crownBankroll, 10376.17, "crown untouched");
  // Lane A completed the $10k ladder (operator-gated), so only Lane B carries a fresh $100 seed.
  assert.equal(dp.products.bankBuilder.exposure, 100, "Bank Builder exposure $100 (Lane B only × $100 seed)");
  // Moonshot is a longshot lane (≥3 distinct-game legs, +700 floor). The June-23 slate has too few distinct
  // longshot games after Bank Builder → both lanes AWAIT. Exposure is whatever the active moonshot lanes
  // total ($0 here, $25/lane when a slate qualifies) and always within the cap. No legs are forced.
  const activeMoon = dp.lanes.filter((l) => l.product === "moonshot" && l.status === "active");
  assert.equal(dp.products.moonshot.exposure, round2(activeMoon.length * 25), "moonshot exposure = $25 × active lanes");
  assert.ok(dp.products.moonshot.exposure <= MOONSHOT_MAX_EXPOSURE, "moonshot exposure within cap");
  assert.equal(dp.openExposure, round2(dp.products.bankBuilder.exposure + dp.products.moonshot.exposure), "open = BB + moonshot");
  assert.equal(dp.availableBankroll, round2(dp.activeBankroll - dp.openExposure), "available = active − exposure");
});

test("apply: Bank Builder lane (Lane B) = 2 legs; Moonshot lanes ≤ 5 legs, ≥1 leg/game; combined odds reconcile", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const moon = dp.lanes.filter((l) => l.product === "moonshot");
  // Lane A completed the ladder → only Lane B remains for Bank Builder.
  assert.equal(bb.length, 1); assert.equal(moon.length, 2);
  for (const l of bb) assert.equal(l.legCount, 2, "Bank Builder lane = 2 legs");
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

test("persisted daily-portfolio.json (June 24) is internally consistent + never touches canonical money", () => {
  // After June 23 settled, the daily portfolio rolls to June 24. Whether the day's lanes are active (real
  // cards placed) or awaiting depends on the live slate, so assert the INVARIANTS, not a fixed exposure.
  const p = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  assert.equal(p.version, "daily-portfolio-v1");
  assert.equal(p.date, "2026-06-24");
  assert.equal(p.activeBankroll, 10076.17); assert.equal(p.crownBankroll, 10376.17);
  const sumExp = p.lanes.filter((l) => l.status === "active").reduce((s, l) => s + (l.exposure ?? 0), 0);
  assert.equal(p.openExposure, sumExp, "open exposure = Σ active-lane seed exposures, nothing else");
  assert.equal(p.availableBankroll, Math.round((p.activeBankroll - p.openExposure) * 100) / 100, "available = active − exposure");
  assert.equal(p.settlement.realizedPnl, 0, "no realized P/L until official settlement");
  // Canonical money is untouched by the daily view. June-24 settlement advanced the core record 12-2 → 13-3
  // (Lane A WON its Step 5, Lane B LOST its Step 3 seed → bankroll 10176.17 → 10076.17).
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(port.currentBankroll, 10076.17); assert.equal(port.crownBankroll, 10376.17);
  assert.deepEqual(port.record, { wins: 13, losses: 3, voids: 0, pending: 0 });
});

test("daily-portfolio read view reflects the persisted state + is internally consistent", () => {
  const dp = buildDailyPortfolio(root, "2026-06-24T10:00:00Z", "2026-06-24");
  assert.equal(dp.activeBankroll, 10076.17);
  assert.equal(Math.round((dp.exposure.core + dp.exposure.moonshot) * 100) / 100, dp.openExposure, "core + moonshot = open exposure");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
  assert.equal(dp.anyActive, dp.cards.some((c) => c.status === "active"), "anyActive reflects the cards");
});

test("ACTIVATION NEVER mutates the legacy portfolio/crown/record", () => {
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // June-24 official settlement is the ONLY thing that moved the core record (12-2-0-0 → 13-3-0-0) and the
  // bankroll (10176.17 → 10076.17). Daily-portfolio activation must never touch this canonical money state.
  assert.equal(p.currentBankroll, 10076.17, "active bankroll (legacy) reflects June-24 settlement only");
  assert.equal(p.crownBankroll, 10376.17, "crown untouched");
  assert.equal(p.openExposure, 0, "legacy dual-ladder exposure $0 (June-24 cards settled; separate from daily portfolio)");
  assert.deepEqual(p.record, { wins: 13, losses: 3, voids: 0, pending: 0 }, "core record 13-3-0-0 (only settlement changes it)");
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
