/**
 * Tests for the product performance ledger. Inputs are SYNTHETIC settled results exercising the math —
 * not real product history.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { computeProductPerformance } from "./performance.ts";
import { PRODUCT_REGISTRY, getProduct, activeProducts, isKnownProduct } from "./registry.ts";

test("registry: stable ids, retired Diamond kept, active set excludes retired", () => {
  assert.ok(isKnownProduct("homer-nukes"));
  assert.equal(getProduct("diamond-specials")?.status, "retired");
  assert.ok(!activeProducts().some((p) => p.id === "diamond-specials"));
  // ids unique
  assert.equal(new Set(PRODUCT_REGISTRY.map((p) => p.id)).size, PRODUCT_REGISTRY.length);
});

test("empty results → every window reads zero (honest, no fabrication)", () => {
  const perf = computeProductPerformance("homer-nukes", []);
  assert.equal(perf.cumulative.bets, 0);
  assert.equal(perf.cumulative.roi, 0);
  assert.equal(perf.longestWinStreak, 0);
  assert.deepEqual(perf.roiSeries, []);
});

test("cumulative record / ROI / units from settled results", () => {
  const results = [
    { productId: "p", date: "2026-06-20", outcome: "won", stake: 20, payout: 60 },   // +40
    { productId: "p", date: "2026-06-21", outcome: "lost", stake: 20, payout: 0 },    // −20
    { productId: "p", date: "2026-06-22", outcome: "won", stake: 20, payout: 50 },    // +30
    { productId: "p", date: "2026-06-22", outcome: "void", stake: 20, payout: 20 },   // excluded
  ];
  const perf = computeProductPerformance("p", results, "2026-06-22");
  assert.equal(perf.cumulative.bets, 4);
  assert.equal(perf.cumulative.wins, 2);
  assert.equal(perf.cumulative.losses, 1);
  assert.equal(perf.cumulative.voids, 1);
  assert.equal(perf.cumulative.stake, 60);   // 3 non-void × 20
  assert.equal(perf.cumulative.profit, 50);  // 40 − 20 + 30
  assert.equal(perf.cumulative.roi, round2(50 / 60 * 100));
  assert.equal(perf.cumulative.winRate, round2(2 / 3 * 100));
  assert.equal(perf.daily["2026-06-22"].wins, 1);
});

test("rolling 7d window excludes older bets relative to asOf", () => {
  const results = [
    { productId: "p", date: "2026-06-01", outcome: "won", stake: 10, payout: 30 },   // 21 days before → out of 7d
    { productId: "p", date: "2026-06-20", outcome: "won", stake: 10, payout: 30 },   // in 7d
    { productId: "p", date: "2026-06-22", outcome: "lost", stake: 10, payout: 0 },    // in 7d
  ];
  const perf = computeProductPerformance("p", results, "2026-06-22");
  assert.equal(perf.rolling7d.bets, 2);
  assert.equal(perf.rolling30d.bets, 3);
});

test("longest win/loss streaks", () => {
  const seq = ["won", "won", "lost", "lost", "lost", "won"].map((o, i) => ({ productId: "p", date: `2026-06-${10 + i}`, outcome: o, stake: 10, payout: o === "won" ? 20 : 0 }));
  const perf = computeProductPerformance("p", seq);
  assert.equal(perf.longestWinStreak, 2);
  assert.equal(perf.longestLossStreak, 3);
});

function round2(n) { return Number(n.toFixed(2)); }
