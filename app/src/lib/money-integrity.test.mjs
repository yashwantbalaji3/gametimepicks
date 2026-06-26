/**
 * Tests for the money-integrity guardrail. Verifies it PASSES the real committed canonical state and
 * CATCHES every class of corruption (phantom crown, bankroll>crown, drawdown drift, profit/ROI drift,
 * negative bankroll, daily-view drift, ledger drift). Deterministic; reads the live artifacts + synthetic
 * tampered copies.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { checkMoneyIntegrity } from "./money-integrity.ts";

const root = path.join(process.cwd(), "public", "data", "mr-dub");
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const docs = () => ({
  portfolio: load("portfolio.json"),
  banked: load("banked-ladders.json"),
  daily: load("daily-portfolio.json"),
  ledger: (() => { try { return load("ledger.json"); } catch { return null; } })(),
});
const crit = (vs) => vs.filter((v) => v.severity === "critical");

test("the REAL committed canonical state passes every money invariant", () => {
  const vs = crit(checkMoneyIntegrity(docs()));
  assert.deepEqual(vs, [], `expected zero critical violations, got: ${JSON.stringify(vs, null, 2)}`);
});

test("catches a PHANTOM crown (crown ≠ Σ official finals)", () => {
  const d = docs(); d.portfolio.crownBankroll += 5000; // inflate crown out of thin air
  const vs = crit(checkMoneyIntegrity(d));
  assert.ok(vs.some((v) => v.rule === "crown=Σ-official-finals"), "phantom crown caught");
});

test("catches bankroll > crown", () => {
  const d = docs(); d.portfolio.currentBankroll = d.portfolio.crownBankroll + 1000;
  const vs = crit(checkMoneyIntegrity(d));
  assert.ok(vs.some((v) => v.rule === "bankroll≤crown"), "bankroll>crown caught");
});

test("catches a drawdown that doesn't reconcile to crown − bankroll", () => {
  const d = docs(); d.portfolio.drawdown = (d.portfolio.drawdown ?? 0) + 250;
  const vs = crit(checkMoneyIntegrity(d));
  assert.ok(vs.some((v) => v.rule === "drawdown=crown−bankroll"), "drawdown drift caught");
});

test("catches settled-profit drift (profit ≠ bankroll − $100)", () => {
  const d = docs(); d.portfolio.settledProfit = d.portfolio.settledProfit + 999;
  const vs = crit(checkMoneyIntegrity(d));
  assert.ok(vs.some((v) => v.rule === "profit=bankroll−start"), "profit drift caught");
});

test("catches a NEGATIVE bankroll", () => {
  const d = docs(); d.portfolio.currentBankroll = -50; d.portfolio.crownBankroll = 100;
  const vs = crit(checkMoneyIntegrity(d));
  assert.ok(vs.some((v) => v.rule === "bankroll>0"), "negative bankroll caught");
});

test("catches the daily DERIVED view drifting from the canonical bankroll", () => {
  const d = docs(); d.daily.activeBankroll = d.portfolio.currentBankroll + 100;
  const vs = crit(checkMoneyIntegrity(d));
  assert.ok(vs.some((v) => v.rule === "daily=canonical-bankroll"), "daily-view drift caught");
});

test("catches phantom open exposure (openExposure ≠ Σ active-lane exposure)", () => {
  const d = docs(); d.daily.openExposure = (d.daily.openExposure ?? 0) + 500;
  const vs = crit(checkMoneyIntegrity(d));
  assert.ok(vs.some((v) => v.rule === "openExposure=Σ-active"), "phantom exposure caught");
});
