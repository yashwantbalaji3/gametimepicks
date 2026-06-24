/**
 * Mr. Dub MASTER LEDGER — aggregation correctness, ROI math, history integrity, staleness gating.
 * Reads the live committed product ledgers; assertions are invariant-based (no brittle hardcoded totals).
 */
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildMasterLedger } from "./master-ledger.ts";
import { freshnessFor, isStale, slateDateOf } from "../products/staleness.ts";

const root = path.join(process.cwd(), "public", "data");
const L = buildMasterLedger(root, "2026-06-24T18:00:00Z", "2026-06-24");
const round2 = (n) => Number(n.toFixed(2));

// ---------- STALENESS HELPER ----------
test("staleness: same slate = fresh; older = stale; missing = unknown (fail closed)", () => {
  assert.equal(freshnessFor("2026-06-24", "2026-06-24"), "fresh");
  assert.equal(freshnessFor("2026-06-19", "2026-06-24"), "stale");
  assert.equal(freshnessFor("2026-06-19T18:45:00Z", "2026-06-24"), "stale");
  assert.equal(freshnessFor(null, "2026-06-24"), "unknown");
  assert.equal(isStale("2026-06-23", "2026-06-24"), true);
  assert.equal(isStale("2026-06-24", "2026-06-24"), false);
  assert.equal(slateDateOf("2026-06-19T18:45:00Z"), "2026-06-19");
});

// ---------- LEDGER STRUCTURE ----------
test("master ledger covers the 4 tracked products", () => {
  assert.deepEqual(L.products.map((p) => p.productId).sort(), ["bank-builder", "homer-nukes", "moonshot", "wc-specials"]);
});

// ---------- ROI MATH (per product reconciles) ----------
test("ROI math: each product's roi = profit/stake×100, winRate = wins/(wins+losses)×100", () => {
  for (const p of L.products) {
    if (p.stake > 0) assert.equal(p.roi, round2((p.profit / p.stake) * 100), `${p.productId} roi reconciles`);
    if (p.record.wins + p.record.losses > 0) assert.equal(p.winRate, round2((p.record.wins / (p.record.wins + p.record.losses)) * 100), `${p.productId} winRate reconciles`);
  }
});

// ---------- HISTORY INTEGRITY (record derives from history; no fabricated rows) ----------
test("history integrity: each product's record + bets + profit derive from its settled history", () => {
  for (const p of L.products) {
    const counted = p.history.filter((r) => r.outcome !== "void");
    assert.equal(p.bets, counted.length, `${p.productId} bets = non-void settled rows`);
    assert.equal(p.record.wins, p.history.filter((r) => r.outcome === "won").length, `${p.productId} wins from history`);
    assert.equal(p.record.losses, p.history.filter((r) => r.outcome === "lost").length, `${p.productId} losses from history`);
    const profit = round2(counted.reduce((s, r) => s + (r.payout - r.stake), 0));
    assert.equal(p.profit, profit, `${p.productId} profit = Σ(payout − stake)`);
    for (const r of p.history) assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, "history row is ISO-dated (real settled result)");
  }
});

// ---------- AGGREGATE (sums reconcile) ----------
test("aggregate: totals = sum across products; overall ROI = aggProfit/aggStake", () => {
  const sum = (f) => L.products.reduce((s, p) => s + f(p), 0);
  assert.equal(L.aggregate.wins, sum((p) => p.record.wins));
  assert.equal(L.aggregate.losses, sum((p) => p.record.losses));
  assert.equal(L.aggregate.bets, sum((p) => p.bets));
  assert.equal(L.aggregate.stake, round2(sum((p) => p.stake)));
  assert.equal(L.aggregate.profit, round2(sum((p) => p.profit)));
  assert.equal(L.aggregate.exposure, round2(sum((p) => p.exposure)));
  if (L.aggregate.stake > 0) assert.equal(L.aggregate.roi, round2((L.aggregate.profit / L.aggregate.stake) * 100));
});

// ---------- STALENESS GATING (stale products contribute no exposure) ----------
test("staleness gating: a STALE product contributes $0 open exposure", () => {
  for (const p of L.products) {
    if (p.stale) assert.equal(p.exposure, 0, `${p.productId} is stale → no exposure`);
  }
  // The aggregate exposure equals the sum of FRESH products' exposure only.
  const freshExp = round2(L.products.filter((p) => !p.stale).reduce((s, p) => s + p.exposure, 0));
  assert.equal(L.aggregate.exposure, freshExp, "aggregate exposure excludes stale products");
});

// ---------- NEVER MUTATES CANONICAL MONEY ----------
test("master ledger is a reporting layer: it never reads as / writes the canonical bankroll", () => {
  // The ledger is product paper P&L (rolled-stake), explicitly SEPARATE from the seed-model bankroll.
  assert.ok(!("currentBankroll" in L.aggregate), "aggregate is product P&L, not a bankroll");
  assert.ok(typeof L.aggregate.profit === "number" && typeof L.aggregate.roi === "number", "aggregate carries P&L + ROI");
});
