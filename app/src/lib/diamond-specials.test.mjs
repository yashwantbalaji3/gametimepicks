/**
 * Homer Nukes ranking engine + Diamond Specials (MLB) product + 5-product allocation.
 *
 * Verifies the Homer Score engine behaves sensibly across synthetic inputs (no fabricated boards), the
 * Diamond Specials product + ledger are honest/data-gated, and the Mr. Dub allocation now tracks five
 * products with bankroll integrity preserved. Run: npx tsx --test this-file.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { computeHomerScore } from "./mlb/homer-score.ts";
import { loadDiamondSpecials, DIAMOND_SPECIALS_DAILY_ALLOCATION, DIAMOND_CATEGORIES } from "./mlb/diamond-specials.ts";
import { buildDiamondLedger } from "./mlb/diamond-specials-ledger.ts";
import { buildPortfolioAllocation } from "./mr-dub/product-allocation.ts";

const read = (p) => fs.readFileSync(p, "utf8");
const root = path.join(process.cwd(), "public", "data");
const DATE = "2026-06-23";
const NOW = "2026-06-23T10:00:00Z";

// ── Homer Score engine ──────────────────────────────────────────────────────────────────────────
test("Homer Score: a strong spot scores higher than a weak spot, both within 0..100", () => {
  const strong = computeHomerScore({
    batter: { hrRate: 0.065, barrelRate: 0.15, hardHitRate: 0.52, xSlg: 0.60, pullPct: 0.50, recentForm: 0.9 },
    pitcher: { hr9: 2.0, flyBallPct: 0.46, barrelAllowed: 0.13, hardContactAllowed: 0.50, handednessEdge: 0.8 },
    environment: { parkHrFactor: 1.22, tempF: 90, windOutMph: 12, humidity: 0.7 },
  });
  const weak = computeHomerScore({
    batter: { hrRate: 0.012, barrelRate: 0.035, hardHitRate: 0.31, xSlg: 0.34, pullPct: 0.31, recentForm: 0.2 },
    pitcher: { hr9: 0.7, flyBallPct: 0.29, barrelAllowed: 0.045, hardContactAllowed: 0.31, handednessEdge: -0.8 },
    environment: { parkHrFactor: 0.82, tempF: 54, windOutMph: -10, humidity: 0.3 },
  });
  assert.ok(strong.score > weak.score, `strong ${strong.score} > weak ${weak.score}`);
  for (const r of [strong, weak]) {
    assert.ok(r.score >= 0 && r.score <= 100, "score in 0..100");
    assert.ok(["high", "medium", "low"].includes(r.confidence));
  }
  assert.ok(strong.score >= 70, "an elite spot grades high");
  assert.ok(weak.score <= 35, "a poor spot grades low");
});

test("Homer Score: confidence reflects how many input groups carry real data", () => {
  assert.equal(computeHomerScore({}).confidence, "low", "no inputs → low confidence");
  assert.equal(computeHomerScore({ batter: { hrRate: 0.05 }, pitcher: { hr9: 1.5 } }).confidence, "medium");
  assert.equal(computeHomerScore({ batter: { hrRate: 0.05 }, pitcher: { hr9: 1.5 }, environment: { parkHrFactor: 1.1 } }).confidence, "high");
});

// ── Diamond Specials product ──────────────────────────────────────────────────────────────────────
test("Diamond Specials: HONEST data-gated when MLB board absent (5 category slots, no fabricated cards)", () => {
  const d = loadDiamondSpecials(root, DATE);
  assert.equal(d.available, false, "no MLB board → not available");
  assert.equal(d.cards.length, 0, "no fabricated parlays");
  assert.deepEqual(d.categories, DIAMOND_CATEGORIES, "the five categories are still surfaced");
  assert.equal(d.dailyAllocation, 100, "$20 × 5 = $100/day");
  assert.match(d.note, /not been posted yet/i);
});

test("Diamond Specials ledger: empty + honest when no history (record 0-0, ROI null)", () => {
  const l = buildDiamondLedger(root, DATE);
  assert.deepEqual(l.record, { wins: 0, losses: 0, pushes: 0 });
  assert.equal(l.roi, null);
  assert.equal(l.winRate, null);
  assert.equal(l.openExposure, 0, "no cards posted → $0 open");
  assert.equal(l.dailyAllocation, 100);
  assert.ok(Array.isArray(l.days));
});

// ── 5-product allocation + bankroll integrity ───────────────────────────────────────────────────
test("allocation now tracks FIVE products incl Diamond Specials; Homer + Diamond data-gated", () => {
  const a = buildPortfolioAllocation(root, NOW, DATE);
  assert.deepEqual(a.products.map((p) => p.key), ["bank-builder", "moonshot", "world-cup-specials", "homer-nukes", "diamond-specials"]);
  const diamond = a.products.find((p) => p.key === "diamond-specials");
  assert.equal(diamond.dailyAllocation, DIAMOND_SPECIALS_DAILY_ALLOCATION);
  assert.equal(diamond.openExposure, 0, "no MLB board → $0 exposure");
  assert.equal(diamond.status, "no-board");
  // Ranking still spans all products uniquely.
  assert.deepEqual(a.products.map((p) => p.rank).sort(), [1, 2, 3, 4, 5]);
});

test("BANKROLL INTEGRITY: adding Diamond Specials never mutates portfolio.json or core exposure", () => {
  const before = read(path.join(root, "mr-dub", "portfolio.json"));
  const a = buildPortfolioAllocation(root, NOW, DATE);
  assert.equal(read(path.join(root, "mr-dub", "portfolio.json")), before, "portfolio.json byte-for-byte unchanged");
  assert.equal(a.activeBankroll, 10176.17);
  assert.equal(a.crownBankroll, 10376.17);
  // Diamond adds $0 today, so total open exposure is unchanged from the four-product total ($350).
  assert.equal(a.totalOpenExposure, 350, "Diamond Specials add $0 while data-gated");
});

// ── UI wiring ───────────────────────────────────────────────────────────────────────────────────
test("UI wiring: /diamond-specials page + Today flagship + nav + MLB flagship sections", () => {
  const page = read("src/app/diamond-specials/page.tsx");
  assert.match(page, /DiamondSpecialsBoard/, "page renders the board");
  assert.match(page, /buildDiamondLedger/, "page builds the ledger");

  const today = read("src/app/today/page.tsx");
  assert.match(today, /href: "\/diamond-specials"/, "Today flashcards include Diamond Specials");
  assert.match(today, /DiamondSpecialsBoard/, "Today renders the Diamond Specials section");

  const rail = read("src/components/command-rail.tsx");
  assert.match(rail, /href: "\/diamond-specials"/, "command rail has Diamond Specials");
  const nav = read("src/components/nav.tsx");
  assert.match(nav, /href: "\/diamond-specials"/, "top nav has Diamond Specials");

  const mlb = read("src/app/mlb/page.tsx");
  assert.match(mlb, /MlbFlagshipSections/, "MLB page surfaces the 4-section flagship IA");
});
