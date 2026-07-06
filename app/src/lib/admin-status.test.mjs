/**
 * ADMIN STATUS — the machine-readable ops status (admin/status.json) must be DERIVED from canonical data,
 * never a fabricated or drifting second source of truth. These pin that: the committed status file's
 * money matches portfolio.json exactly, its money-gate invariants hold, and its generator is money-safe.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "public", "data");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
const status = read("admin/status.json");
const pf = read("mr-dub/portfolio.json");
const dp = read("mr-dub/daily-portfolio.json");

test("admin/status.json money is DERIVED verbatim from canonical portfolio.json (no drift, no fabrication)", () => {
  const rec = pf.record;
  assert.equal(status.canonical.record, `${rec.wins}-${rec.losses}`, "record matches canonical");
  assert.equal(status.canonical.bankroll, Math.round(pf.currentBankroll * 100) / 100, "bankroll matches canonical");
  assert.equal(status.canonical.crown, Math.round(pf.crownBankroll * 100) / 100, "crown matches canonical");
  assert.equal(status.canonical.drawdown, Math.round(pf.drawdown * 100) / 100, "drawdown matches canonical");
});

test("admin/status.json money-gate invariants hold on the committed state", () => {
  assert.equal(status.moneyGate.crownMinusDrawdownEqualsBankroll, true, "crown − drawdown = bankroll");
  assert.equal(status.moneyGate.dailyTracksCanonical, true, "daily activeBankroll = canonical bankroll");
  assert.equal(status.moneyGate.pass, true);
  // Cross-check the invariants ourselves so the test can't rubber-stamp a stale file.
  assert.ok(Math.abs((pf.crownBankroll - pf.drawdown) - pf.currentBankroll) < 0.01, "crown − drawdown reconciles to bankroll");
  assert.ok(Math.abs(dp.activeBankroll - pf.currentBankroll) < 0.01, "daily portfolio tracks canonical bankroll");
});

test("admin/status.json slate + products are present and self-consistent", () => {
  assert.equal(status.slate.date, dp.date, "slate date matches the daily portfolio");
  assert.ok(typeof status.slate.worldCupGames === "number" && status.slate.worldCupGames >= 0);
  assert.ok(status.products.bankBuilder && status.products.moonshot, "both flagship products reported");
  assert.ok(typeof status.nextAction === "string" && status.nextAction.length > 0, "a next action is always suggested");
});

test("the status generator is READ-ONLY / money-safe (snapshots + asserts portfolio md5)", () => {
  const gen = fs.readFileSync(path.join(process.cwd(), "scripts", "build-admin-status.mjs"), "utf8");
  assert.match(gen, /portfolioMd5Before/, "snapshots portfolio md5 before");
  assert.match(gen, /portfolioMd5Before !== portfolioMd5After/, "asserts md5 unchanged after (money-safe)");
  assert.match(gen, /never writes canonical money/i, "documents the read-only contract");
});
