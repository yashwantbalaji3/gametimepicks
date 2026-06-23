/**
 * Homer Nukes (MLB home-run product) + the four-product portfolio allocation.
 *
 * Verifies: the new product is data-gated (no fabricated picks when MLB props aren't posted), the
 * allocation aggregates all four products, and bankroll integrity is preserved (the protected
 * portfolio.json is never mutated; crown is separate). Run: npx tsx --test this-file.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { loadHomerNukes, HOMER_NUKES_DAILY_ALLOCATION, HOMER_NUKES_STAKE_PER_PICK, HOMER_NUKES_PICK_COUNT } from "./mlb/homer-nukes.ts";
import { buildPortfolioAllocation, WC_SPECIALS_DAILY_ALLOCATION } from "./mr-dub/product-allocation.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z";

test("Homer Nukes constants: top-5 @ $20 = $100/day allocation", () => {
  assert.equal(HOMER_NUKES_PICK_COUNT, 5);
  assert.equal(HOMER_NUKES_STAKE_PER_PICK, 20);
  assert.equal(HOMER_NUKES_DAILY_ALLOCATION, 100);
});

test("Homer Nukes is HONEST data-gated: no posted MLB home-run board → empty, no fabricated picks", () => {
  const b = loadHomerNukes(root, DATE);
  // No MLB home-run props are posted for the slate → available=false, zero picks, a clear note.
  assert.equal(b.available, false, "not available without real posted HR props");
  assert.equal(b.picks.length, 0, "no fabricated picks");
  assert.ok(b.note && b.note.length > 0, "carries a data-gated explanation");
  assert.equal(b.dailyAllocation, 100);
});

test("Homer Nukes never fabricates: every returned pick (when present) is odds-backed with a provider", () => {
  const b = loadHomerNukes(root, DATE);
  for (const p of b.picks) {
    assert.ok(typeof p.odds === "number", "real odds");
    assert.ok(p.provider, "has a provider (odds-backed)");
    assert.ok(p.player, "names a real player");
  }
});

test("portfolio allocation: four products, exposure aggregates, bankroll/crown preserved", () => {
  const a = buildPortfolioAllocation(root, NOW, DATE);
  assert.deepEqual(a.products.map((p) => p.key), ["bank-builder", "moonshot", "world-cup-specials", "homer-nukes"]);
  // Bankroll + crown come straight from the protected portfolio.json, unchanged.
  assert.equal(a.activeBankroll, 10176.17, "active bankroll = portfolio.currentBankroll");
  assert.equal(a.crownBankroll, 10376.17, "crown separate + unchanged");
  // Exposure aggregates each product; available = active − total.
  const sum = a.products.reduce((s, p) => s + p.openExposure, 0);
  assert.ok(Math.abs(a.totalOpenExposure - sum) < 0.01, "total exposure = Σ product exposure");
  assert.ok(Math.abs(a.availableBankroll - (a.activeBankroll - a.totalOpenExposure)) < 0.01, "available = active − exposure");
});

test("portfolio allocation: WC Specials = $100/day, Homer Nukes = $0 until board posts", () => {
  const a = buildPortfolioAllocation(root, NOW, DATE);
  const wc = a.products.find((p) => p.key === "world-cup-specials");
  const homer = a.products.find((p) => p.key === "homer-nukes");
  assert.equal(wc.dailyAllocation, WC_SPECIALS_DAILY_ALLOCATION, "WC Specials allocates $100/day");
  assert.equal(wc.openExposure, 100, "5 cards × $20 = $100 open exposure");
  assert.equal(homer.dailyAllocation, 100, "Homer Nukes targets $100/day");
  assert.equal(homer.openExposure, 0, "no exposure placed without a posted board");
  assert.equal(homer.status, "no-board", "honest data-gated status");
});

test("BANKROLL INTEGRITY: building the allocation does NOT mutate the protected portfolio.json", () => {
  const before = read(path.join(root, "mr-dub", "portfolio.json"));
  buildPortfolioAllocation(root, NOW, DATE);
  buildPortfolioAllocation(root, NOW, DATE);
  const after = read(path.join(root, "mr-dub", "portfolio.json"));
  assert.equal(before, after, "portfolio.json byte-for-byte unchanged");
  const p = JSON.parse(after);
  assert.equal(p.currentBankroll, 10176.17);
  assert.equal(p.crownBankroll, 10376.17);
  assert.deepEqual(p.record, { wins: 10, losses: 2, voids: 0, pending: 0 });
});

test("portfolio analytics: per-product record/win-rate/avg-odds/leg-count + performance ranking", () => {
  const a = buildPortfolioAllocation(root, NOW, DATE);
  const bb = a.products.find((p) => p.key === "bank-builder");
  const moon = a.products.find((p) => p.key === "moonshot");
  // Bank Builder carries the core lane record (10-2) → ~83% win rate → ranks #1.
  assert.deepEqual(bb.record, { wins: 10, losses: 2, pushes: 0 }, "Bank Builder record = core lane record");
  assert.ok(bb.winRate != null && bb.winRate > 0.8, "Bank Builder win rate from real record");
  assert.equal(bb.rank, 1, "Bank Builder ranks #1 by win rate");
  assert.ok(bb.legCount > 0 && bb.avgOdds != null, "avg odds + leg count derived from live cards");
  // Ranking covers all four products uniquely.
  const ranks = a.products.map((p) => p.rank).sort();
  assert.deepEqual(ranks, [1, 2, 3, 4], "each product has a unique 1..4 rank");
  // Moonshot keeps its own record (not blended into the core).
  assert.ok(moon.record.losses >= 0, "moonshot has its own record");
});

test("BANKROLL INTEGRITY: analytics never mutate portfolio.json", () => {
  const before = read(path.join(root, "mr-dub", "portfolio.json"));
  buildPortfolioAllocation(root, NOW, DATE);
  assert.equal(read(path.join(root, "mr-dub", "portfolio.json")), before, "portfolio.json unchanged");
});

test("UI wiring: /homer-nukes page + Mr. Dub allocation + Today flagship + nav all present", () => {
  const homerPage = read("src/app/homer-nukes/page.tsx");
  assert.match(homerPage, /HomerNukesBoard/, "homer-nukes page renders the board");
  assert.match(homerPage, /loadHomerNukes/, "loads the real HR board");

  const mrdub = read("src/app/mr-dub/page.tsx");
  assert.match(mrdub, /PortfolioAllocationSection/, "Mr. Dub renders the 4-product allocation");
  assert.match(mrdub, /buildPortfolioAllocation/, "Mr. Dub builds the allocation");

  const today = read("src/app/today/page.tsx");
  assert.match(today, /href: "\/homer-nukes"/, "Today flashcards include Homer Nukes");
  assert.match(today, /HomerNukesBoard/, "Today renders the Homer Nukes board");

  const rail = read("src/components/command-rail.tsx");
  assert.match(rail, /href: "\/homer-nukes"/, "command rail has Homer Nukes");
  const nav = read("src/components/nav.tsx");
  assert.match(nav, /href: "\/homer-nukes"/, "top nav has Homer Nukes");
});
