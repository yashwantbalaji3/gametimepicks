/**
 * Homer Nukes (daily 5-leg HR PARLAY) + the four-product portfolio allocation.
 *
 * Verifies Homer Nukes is ONE daily 5-leg parlay at a flat $20 stake (not five bets), with combined
 * odds that reconcile from the legs; that the allocation tracks exactly four products (Diamond Specials
 * removed); and that bankroll integrity is preserved. Run: npx tsx --test this-file.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadHomerNukes, HOMER_NUKES_DAILY_ALLOCATION, HOMER_NUKES_STAKE, HOMER_NUKES_PICK_COUNT, HOMER_NUKES_LANE_STAKE, HOMER_NUKES_LEGS_PER_LANE, HOMER_NUKES_LANE_COUNT } from "./mlb/homer-nukes.ts";
import { buildPortfolioAllocation, WC_SPECIALS_DAILY_ALLOCATION } from "./mr-dub/product-allocation.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z";
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

test("Homer Nukes V2: two $10 lanes × 3 legs each ($20/day total)", () => {
  assert.equal(HOMER_NUKES_LEGS_PER_LANE, 3);
  assert.equal(HOMER_NUKES_LANE_COUNT, 2);
  assert.equal(HOMER_NUKES_LANE_STAKE, 10);
  assert.equal(HOMER_NUKES_PICK_COUNT, 6, "6 total legs (2 lanes × 3)");
  assert.equal(HOMER_NUKES_STAKE, 20, "$20/day total (2 lanes × $10)");
  assert.equal(HOMER_NUKES_DAILY_ALLOCATION, 20);
});

test("Homer Nukes is HONEST data-gated when no board for the date (no parlay, no fabrication)", () => {
  const b = loadHomerNukes(root, "2020-01-01");
  assert.equal(b.available, false);
  assert.equal(b.parlay, null, "no fabricated parlay");
  assert.ok(b.note && b.note.length > 0);
});

test("Homer Nukes LIVE for the ingested slate — up to two $10/3-leg lanes, unique legs, odds reconcile, one per game", () => {
  const b = loadHomerNukes(root, DATE);
  assert.equal(b.available, true);
  assert.ok(b.lanes.length >= 1 && b.lanes.length <= HOMER_NUKES_LANE_COUNT, "1-2 lanes");
  assert.ok(b.parlay, "Lane A surfaced as parlay (backward-compat)");
  const allLegIds = new Set();
  for (const lane of b.lanes) {
    assert.equal(lane.legs.length, HOMER_NUKES_LEGS_PER_LANE, "3 legs per lane");
    assert.equal(lane.stake, HOMER_NUKES_LANE_STAKE, "$10 per lane");
    assert.equal(new Set(lane.legs.map((l) => l.gameId)).size, lane.legs.length, "max one leg per game within a lane");
    const combinedDecimal = lane.legs.reduce((d, l) => d * dec(l.odds), 1);
    assert.ok(Math.abs(lane.combinedDecimal - combinedDecimal) < 0.01, "combined decimal reconciles");
    assert.ok(Math.abs(lane.projectedReturn - HOMER_NUKES_LANE_STAKE * combinedDecimal) < 0.5, "projected return = $10 × combined");
    for (const l of lane.legs) { assert.ok(l.provider && typeof l.odds === "number", "every leg is odds-backed"); allLegIds.add(l.id); }
  }
  const totalLegs = b.lanes.reduce((n, l) => n + l.legs.length, 0);
  assert.equal(allLegIds.size, totalLegs, "no leg duplicated across lanes");
});

test("allocation tracks exactly THREE active products (Homer Nukes + Diamond Specials retired)", () => {
  const a = buildPortfolioAllocation(root, NOW, DATE);
  // Homer Nukes retired 2026-06-30 — it is no longer surfaced in the portfolio allocation.
  assert.deepEqual(a.products.map((p) => p.key), ["bank-builder", "moonshot", "world-cup-specials"]);
  assert.ok(!a.products.some((p) => p.key === "homer-nukes"), "no retired Homer Nukes product");
  assert.ok(!a.products.some((p) => p.key === "diamond-specials"), "no Diamond Specials product");
  // Ranking spans the three uniquely.
  assert.deepEqual(a.products.map((p) => p.rank).sort(), [1, 2, 3]);
});

test("portfolio analytics: Bank Builder carries the 19-14 record + ranks #1; WC Specials $100/day", () => {
  const a = buildPortfolioAllocation(root, NOW, DATE);
  const bb = a.products.find((p) => p.key === "bank-builder");
  const wc = a.products.find((p) => p.key === "world-cup-specials");
  // Lane A won its July-6 cycle-8 Step-1 and its July-7 Step-2 → record advances to 19-14 (win rate 19/33 ≈ 0.58).
  assert.deepEqual(bb.record, { wins: 19, losses: 14, pushes: 0 });
  assert.ok(bb.winRate != null && bb.winRate === 0.58);
  assert.equal(bb.rank, 1);
  assert.equal(wc.dailyAllocation, WC_SPECIALS_DAILY_ALLOCATION);
});

test("BANKROLL INTEGRITY: the allocation never mutates portfolio.json", () => {
  const before = read(path.join(root, "mr-dub", "portfolio.json"));
  const a = buildPortfolioAllocation(root, NOW, DATE);
  assert.equal(read(path.join(root, "mr-dub", "portfolio.json")), before, "portfolio.json byte-for-byte unchanged");
  assert.equal(a.activeBankroll, 19065.40);
  assert.equal(a.crownBankroll, 20465.40);
  assert.ok(Math.abs(a.availableBankroll - (a.activeBankroll - a.totalOpenExposure)) < 0.01, "available = active − exposure");
});

test("UI wiring: Homer Nukes is RETIRED everywhere (removed from nav / Today / allocation; page is a retired notice)", () => {
  // Retired 2026-06-30: the route stays as a "retired" landing (no board), and Homer Nukes no longer
  // appears in the primary nav surfaces, Today's flashcards or the portfolio allocation.
  const homerPage = read("src/app/homer-nukes/page.tsx");
  assert.match(homerPage, /retired/i, "homer-nukes page is a retired notice");
  assert.ok(!/HomerNukesBoard/.test(homerPage), "no active board on the retired page");

  const today = read("src/app/today/page.tsx");
  assert.ok(!/href: "\/homer-nukes"/.test(today), "Today flashcards no longer include Homer Nukes");

  const rail = read("src/components/command-rail.tsx");
  const nav = read("src/components/nav.tsx");
  const route = read("src/lib/nav-active-route.ts");
  for (const [name, src] of [["command rail", rail], ["top nav", nav]]) {
    assert.ok(!/href: "\/homer-nukes"/.test(src), `${name} no longer links Homer Nukes`);
  }
  // MOBILE_NAV_ITEMS dropped the Homer Nukes tab.
  assert.ok(!/bucket: "homer"/.test(route), "MOBILE_NAV_ITEMS dropped the Homer Nukes tab");

  // Registry keeps the id for history but marks it retired (route null).
  const registry = read("src/lib/products/registry.ts");
  assert.match(registry, /id: "homer-nukes"[\s\S]*?status: "retired"/, "registry marks Homer Nukes retired");
});
