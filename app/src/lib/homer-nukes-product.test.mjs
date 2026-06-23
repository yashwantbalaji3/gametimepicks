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

import { loadHomerNukes, HOMER_NUKES_DAILY_ALLOCATION, HOMER_NUKES_STAKE, HOMER_NUKES_PICK_COUNT } from "./mlb/homer-nukes.ts";
import { buildPortfolioAllocation, WC_SPECIALS_DAILY_ALLOCATION } from "./mr-dub/product-allocation.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z";
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

test("Homer Nukes is ONE daily 5-leg parlay at a flat $20 stake", () => {
  assert.equal(HOMER_NUKES_PICK_COUNT, 5);
  assert.equal(HOMER_NUKES_STAKE, 20);
  assert.equal(HOMER_NUKES_DAILY_ALLOCATION, 20, "flat $20/day (one parlay, not 5×$20)");
});

test("Homer Nukes is HONEST data-gated when no board for the date (no parlay, no fabrication)", () => {
  const b = loadHomerNukes(root, "2020-01-01");
  assert.equal(b.available, false);
  assert.equal(b.parlay, null, "no fabricated parlay");
  assert.ok(b.note && b.note.length > 0);
});

test("Homer Nukes LIVE for the ingested slate — a single 5-leg parlay, odds reconcile, one per game", () => {
  const b = loadHomerNukes(root, DATE);
  assert.equal(b.available, true);
  assert.ok(b.parlay, "a parlay is built");
  assert.equal(b.parlay.legs.length, 5, "exactly 5 legs");
  assert.equal(b.parlay.stake, 20, "flat $20 stake");
  assert.equal(new Set(b.parlay.legs.map((l) => l.gameId)).size, 5, "max one leg per game");
  // Combined odds reconcile from the leg decimals.
  const combinedDecimal = b.parlay.legs.reduce((d, l) => d * dec(l.odds), 1);
  assert.ok(Math.abs(b.parlay.combinedDecimal - combinedDecimal) < 0.01, "combined decimal reconciles");
  assert.ok(Math.abs(b.parlay.projectedReturn - 20 * combinedDecimal) < 0.5, "projected return = $20 × combined");
  for (const l of b.parlay.legs) assert.ok(l.provider && typeof l.odds === "number", "every leg is odds-backed");
});

test("allocation tracks exactly FOUR products (Diamond Specials removed); Homer Nukes = $20", () => {
  const a = buildPortfolioAllocation(root, NOW, DATE);
  assert.deepEqual(a.products.map((p) => p.key), ["bank-builder", "moonshot", "world-cup-specials", "homer-nukes"]);
  assert.ok(!a.products.some((p) => p.key === "diamond-specials"), "no Diamond Specials product");
  const homer = a.products.find((p) => p.key === "homer-nukes");
  assert.equal(homer.dailyAllocation, 20, "flat $20/day");
  assert.ok(homer.openExposure === 20 || homer.openExposure === 0, "one $20 parlay (or $0 when no board)");
  // Ranking spans all four uniquely.
  assert.deepEqual(a.products.map((p) => p.rank).sort(), [1, 2, 3, 4]);
});

test("portfolio analytics: Bank Builder carries the 10-2 record + ranks #1; WC Specials $100/day", () => {
  const a = buildPortfolioAllocation(root, NOW, DATE);
  const bb = a.products.find((p) => p.key === "bank-builder");
  const wc = a.products.find((p) => p.key === "world-cup-specials");
  assert.deepEqual(bb.record, { wins: 10, losses: 2, pushes: 0 });
  assert.ok(bb.winRate != null && bb.winRate > 0.8);
  assert.equal(bb.rank, 1);
  assert.equal(wc.dailyAllocation, WC_SPECIALS_DAILY_ALLOCATION);
});

test("BANKROLL INTEGRITY: the allocation never mutates portfolio.json", () => {
  const before = read(path.join(root, "mr-dub", "portfolio.json"));
  const a = buildPortfolioAllocation(root, NOW, DATE);
  assert.equal(read(path.join(root, "mr-dub", "portfolio.json")), before, "portfolio.json byte-for-byte unchanged");
  assert.equal(a.activeBankroll, 10176.17);
  assert.equal(a.crownBankroll, 10376.17);
  assert.ok(Math.abs(a.availableBankroll - (a.activeBankroll - a.totalOpenExposure)) < 0.01, "available = active − exposure");
});

test("UI wiring: Homer Nukes present everywhere; Diamond Specials removed everywhere", () => {
  const homerPage = read("src/app/homer-nukes/page.tsx");
  assert.match(homerPage, /HomerNukesBoard/, "homer-nukes page renders the board");
  assert.match(homerPage, /5-leg/, "framed as a 5-leg parlay");

  const mrdub = read("src/app/mr-dub/page.tsx");
  assert.match(mrdub, /PortfolioAllocationSection/, "Mr. Dub renders the allocation");

  const today = read("src/app/today/page.tsx");
  assert.match(today, /href: "\/homer-nukes"/, "Today flashcards include Homer Nukes");
  assert.ok(!/diamond-specials/i.test(today), "no Diamond Specials on Today");

  const rail = read("src/components/command-rail.tsx");
  const nav = read("src/components/nav.tsx");
  const route = read("src/lib/nav-active-route.ts");
  for (const [name, src] of [["command rail", rail], ["top nav", nav], ["nav routes", route]]) {
    assert.match(src, /homer-nukes/, `${name} has Homer Nukes`);
    assert.ok(!/diamond-specials|"diamond"/.test(src), `${name} has no Diamond Specials`);
  }
});
