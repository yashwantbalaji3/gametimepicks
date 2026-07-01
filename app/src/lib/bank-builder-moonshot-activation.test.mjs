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

test("plan (dry-run): no BB lanes (both settled-LOST June-29) + two Moonshot lanes → 2 lanes, $0 exposure (dry-run places nothing)", () => {
  const plan = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ false);
  // Post June-29 settlement: both lanes settled-LOST their June-29 Step and are stopped with no open forward
  // rung, so no Bank Builder lane is served (awaiting a fresh slate). The day is Moonshot A/B = 2 lanes.
  assert.equal(plan.lanes.filter((l) => l.product === "bank-builder").length, 0, "no Bank Builder lanes (both settled-LOST June-29)");
  assert.equal(plan.lanes.length, 2, "Moonshot A/B only");
  assert.equal(plan.openExposure, 0, "dry-run places no exposure");
  assert.equal(plan.availableBankroll, plan.activeBankroll, "available = active when nothing placed");
  for (const l of plan.lanes) assert.notEqual(l.status, "active", "no lane active in dry-run");
});

test("apply: exposure math — BB lanes settled-LOST (no active seed); Moonshot adaptive; money UNCHANGED", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, /*activate*/ true);
  assert.equal(dp.activeBankroll, 19565.40, "active bankroll unchanged at activation (post June-29 canonical)");
  assert.equal(dp.crownBankroll, 20465.40, "crown untouched");
  // Post June-29 settlement: both lanes settled-LOST → no active BB lane ($100 seed only on a served lane).
  const activeBB = dp.lanes.filter((l) => l.product === "bank-builder" && l.status === "active");
  assert.equal(dp.products.bankBuilder.exposure, round2(activeBB.length * 100), "Bank Builder exposure = $100 × active lanes");
  const activeMoon = dp.lanes.filter((l) => l.product === "moonshot" && l.status === "active");
  assert.equal(dp.products.moonshot.exposure, round2(activeMoon.length * 25), "moonshot exposure = $25 × active lanes");
  assert.ok(dp.products.moonshot.exposure <= MOONSHOT_MAX_EXPOSURE, "moonshot exposure within cap");
  assert.equal(dp.openExposure, round2(dp.products.bankBuilder.exposure + dp.products.moonshot.exposure), "open = BB + moonshot");
  assert.equal(dp.availableBankroll, round2(dp.activeBankroll - dp.openExposure), "available = active − exposure");
});

test("apply: no BB lanes (both settled-LOST June-29); Moonshot lanes are STRUCTURED team-market longshots; combined odds reconcile", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const moon = dp.lanes.filter((l) => l.product === "moonshot");
  assert.equal(bb.length, 0, "no Bank Builder lanes (both settled-LOST June-29)");
  for (const l of bb) assert.ok(l.legCount <= 4, "Bank Builder lane ≤ 4 legs (rung card)");
  assert.equal(moon.length, 2, "Moonshot A/B present");
  for (const l of moon) {
    // NEW spec: structured team-market lanes (result + total per game) — team markets only (no player props),
    // combined price clears the +700 longshot floor.
    assert.ok(l.legs.every((g) => g.id.startsWith("team:") && g.player === null), `Moonshot ${l.lane}: team markets only (no player props)`);
    assert.ok(l.combinedOdds >= 700, `Moonshot ${l.lane}: clears the +700 longshot floor`);
  }
  for (const l of dp.lanes) {
    if (!l.legs.length) continue;
    const d = l.legs.reduce((p, g) => p * dec(g.odds), 1);
    assert.ok(Math.abs(decToAmerican(d) - l.combinedOdds) <= 3, `${l.id} combined odds reconcile from legs`);
    assert.ok(Math.abs(l.potentialReturn - l.stake * d) < 0.5, `${l.id} potential return = stake × combined decimal`);
  }
});

test("apply: Bank Builder lanes are max 1 leg/game (no SGP); Moonshot lanes are STRUCTURED (result + total per game → 2 legs/game)", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  for (const l of dp.lanes.filter((x) => x.product === "bank-builder")) {
    const games = l.legs.map((g) => g.matchup);
    assert.equal(new Set(games).size, games.length, `Bank Builder ${l.lane}: max 1 leg per game (no fabricated SGP)`);
  }
  // Moonshot is INTENTIONALLY structured: each game contributes a RESULT leg + a TOTAL/BTTS leg (2 legs/game),
  // so a game appears more than once within a lane by design.
  for (const l of dp.lanes.filter((x) => x.product === "moonshot")) {
    const perGame = new Map();
    for (const g of l.legs) perGame.set(g.matchup, [...(perGame.get(g.matchup) ?? []), g.market]);
    for (const [matchup, markets] of perGame) {
      assert.ok(markets.length >= 1, `Moonshot ${l.lane}: game ${matchup} contributes at least a result/total leg`);
      // Where a game contributes 2+ legs they are DIFFERENT markets (result + total/BTTS), not a duplicated pick.
      assert.equal(new Set(markets).size, markets.length, `Moonshot ${l.lane}: game ${matchup} pairs DISTINCT markets (result + total/BTTS), no duplicate market`);
    }
    // At least one game contributes a structured pair (2 legs) — this is the redesign's whole point.
    assert.ok([...perGame.values()].some((m) => m.length >= 2), `Moonshot ${l.lane}: at least one game contributes a result + total structured pair`);
  }
});

test("started-game guard: nothing is eligible/active once a leg's game has started", () => {
  const after = buildPersistedDailyPortfolio(root, "2026-06-25T00:00:00Z", DATE, "2026-06-25T00:00:00Z", true);
  assert.equal(after.openExposure, 0, "no exposure after kickoff (started games not activatable)");
  for (const l of after.lanes) assert.notEqual(l.status, "active", "no lane active once games started");
});

test("lane independence: Bank Builder lanes never share a leg; Moonshot A/B are TIERS that overlap by design", () => {
  const dp = buildPersistedDailyPortfolio(root, NOW, DATE, NOW, true);
  // Bank Builder lanes must be mutually independent (no shared leg). Post June-29 there are no BB lanes today,
  // so this is trivially satisfied — but assert it explicitly for the day a BB lane returns.
  const bb = dp.lanes.filter((l) => l.product === "bank-builder");
  const bbIds = bb.flatMap((l) => l.legs.map((g) => g.id));
  assert.equal(new Set(bbIds).size, bbIds.length, "Bank Builder lanes share no leg (independent)");
  // Moonshot A and B are now TIERS (structured ⊆ aggressive): they SHARE legs by design, so cross-lane
  // uniqueness no longer applies. Assert the tier relationship instead: Lane B is a superset of Lane A.
  const moon = dp.lanes.filter((l) => l.product === "moonshot");
  if (moon.length === 2) {
    const [a, b] = moon[0].lane === "A" ? moon : [moon[1], moon[0]];
    const aIds = new Set(a.legs.map((g) => g.id));
    const bIds = new Set(b.legs.map((g) => g.id));
    assert.ok([...aIds].every((id) => bIds.has(id)), "Moonshot Lane B is a superset of Lane A (tier overlap by design)");
    assert.ok(b.legs.length >= a.legs.length, "Lane B (aggressive) carries at least as many legs as Lane A (structured)");
    // Within EACH Moonshot lane, no leg id is duplicated (each structured pick appears once per lane).
    for (const l of moon) {
      const ids = l.legs.map((g) => g.id);
      assert.equal(new Set(ids).size, ids.length, `Moonshot ${l.lane}: no leg duplicated within the lane`);
    }
  }
});

test("persisted daily-portfolio.json (post June-29 settlement) is internally consistent + never touches canonical money", () => {
  // After Ladder #2 was banked, the daily portfolio rolls forward. Whether the day's lanes are active (real
  // cards placed) or awaiting depends on the live slate, so assert the INVARIANTS.
  const p = JSON.parse(read("public/data/mr-dub/daily-portfolio.json"));
  assert.equal(p.version, "daily-portfolio-v1");
  assert.match(p.date, /^\d{4}-\d{2}-\d{2}$/, "date is the current slate (rolls daily — date-agnostic)");
  assert.equal(p.activeBankroll, 19565.40); assert.equal(p.crownBankroll, 20465.40);
  const sumExp = p.lanes.filter((l) => l.status === "active").reduce((s, l) => s + (l.exposure ?? 0), 0);
  assert.equal(p.openExposure, sumExp, "open exposure = Σ active-lane seed exposures, nothing else");
  assert.equal(p.availableBankroll, Math.round((p.activeBankroll - p.openExposure) * 100) / 100, "available = active − exposure");
  assert.equal(p.settlement.realizedPnl, 0, "no realized P/L until official settlement");
  // Canonical money is untouched by the daily view. Banking Ladder #2 ($10,089.23) lifted the crown to the
  // Σ of the two completed-ladder finals (10,376.17 + 10,089.23 = 20,465.40). The June-25/26/27/29 dual-lane
  // settlements then moved the active bankroll (9 lost seeds → 19,565.40) and the record to 15-9.
  const port = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  assert.equal(port.currentBankroll, 19565.40); assert.equal(port.crownBankroll, 20465.40);
  assert.deepEqual(port.record, { wins: 15, losses: 9, voids: 0, pending: 0 });
});

test("daily-portfolio read view reflects the persisted state + is internally consistent", () => {
  const liveDate = JSON.parse(read("public/data/mr-dub/daily-portfolio.json")).date; // current slate (date-agnostic)
  const dp = buildDailyPortfolio(root, `${liveDate}T10:00:00Z`, liveDate);
  assert.equal(dp.activeBankroll, 19565.40);
  assert.equal(Math.round((dp.exposure.core + dp.exposure.moonshot) * 100) / 100, dp.openExposure, "core + moonshot = open exposure");
  assert.equal(dp.availableBankroll, Math.round((dp.activeBankroll - dp.openExposure) * 100) / 100, "available = active − exposure");
  assert.equal(dp.anyActive, dp.cards.some((c) => c.status === "active"), "anyActive reflects the cards");
});

test("ACTIVATION NEVER mutates the legacy portfolio/crown/record", () => {
  const p = JSON.parse(read("public/data/mr-dub/portfolio.json"));
  // Banking Ladder #2 ($10,089.23) lifted the crown to 20,465.40 (Σ of the two completed-ladder finals).
  // The June-25/26/27/29 dual-lane settlements then moved the canonical money: nine lost seeds total (3 prior +
  // June-25 Lane B + June-26 Lane A Step-2 + two June-27 + two June-29 Step losses) drop the active bankroll to
  // 19,565.40 and the record to 15-9. Daily-portfolio activation itself must never touch this canonical money state.
  assert.equal(p.currentBankroll, 19565.40, "active bankroll (legacy) reflects banked Ladder #2 + 9 dual-lane lost seeds");
  assert.equal(p.crownBankroll, 20465.40, "crown = Σ of two completed-ladder finals");
  assert.equal(p.openExposure, 0, "legacy dual-ladder exposure $0 (both lanes settled-LOST June-29; awaiting a fresh slate)");
  assert.deepEqual(p.record, { wins: 15, losses: 9, voids: 0, pending: 0 }, "core record 15-9-0-0 (both lanes settled-LOST their June-29 Step)");
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
