/**
 * Tests for the PUBLISHED official Step-4 candidate artifact + loader gates.
 * The candidate is a pending, presentation-only artifact: publishing it must NOT
 * touch the bankroll/ledger/nextPick, its math must be exact, and every leg must
 * clear the ladder gates (real odds, model ≥55%, market ≥50%).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "data", "bank-builder");
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

test("step-4 candidate: exact parlay math on the full current bankroll", () => {
  const c = read("official-step4-candidate.json");
  assert.equal(c.step, 4);
  // Settled WON from official results (was pending; the gated pending-card view is off now).
  assert.equal(c.status, "won");
  assert.equal(c.result, "win");
  assert.equal(c.officialResultConfirmed, true);
  assert.equal(c.settledReturn, 3623.97);
  assert.equal(c.settledProfit, 2200.33);
  assert.equal(c.stake, 1423.64); // full current bankroll, never partial
  const dec = c.legs.reduce(
    (acc, l) => acc * (l.americanOdds < 0 ? 1 + 100 / Math.abs(l.americanOdds) : 1 + l.americanOdds / 100),
    1,
  );
  assert.equal(Math.round(c.stake * dec * 100) / 100, c.projectedReturn);
  assert.equal(Math.round((c.projectedReturn - c.stake) * 100) / 100, c.projectedProfit);
  assert.equal(Math.round((dec - 1) * 100), c.combinedAmericanOdds);
  // Clears the Step-4 ladder floor — no silent target lowering.
  assert.ok(c.projectedReturn >= c.targetMin && c.targetMin === 3500);
  // Combined model probability is the honest product of the legs.
  const comb = c.legs.reduce((acc, l) => acc * l.modelProbability, 1);
  assert.ok(Math.abs(comb - c.combinedModelProbability) < 0.002);
});

test("step-4 candidate: every leg clears the ladder gates", () => {
  const c = read("official-step4-candidate.json");
  assert.equal(c.legs.length, 2);
  const games = new Set();
  for (const l of c.legs) {
    assert.equal(typeof l.americanOdds, "number");
    assert.ok(l.bookmaker, "real bookmaker required");
    assert.ok(l.modelProbability >= 0.55, `model support ${l.modelProbability}`);
    assert.ok(l.marketProbability >= 0.5, `market support ${l.marketProbability}`);
    games.add(l.gameLabel);
  }
  assert.equal(games.size, c.legs.length, "cross-game legs only (no correlation)");
  // The MLB leg must be a verifiable, probables-based pitcher prop (no midday lineup risk)
  const mlb = c.legs.find((l) => l.sport === "mlb");
  assert.ok(mlb && mlb.playerRole === "pitcher" && mlb.playerId, "MLB leg = probable-starter pitcher with real id");
  // The WC leg settles on 90' regulation.
  const wcl = c.legs.find((l) => l.sport === "world_cup");
  assert.ok(wcl && wcl.regulationOnly === true);
});

test("settling Step 4 advanced the ladder to Step 5 (4-0), idempotently", () => {
  const s = read("public-summary-latest.json");
  const l = read("public-ledger-latest.json");
  assert.equal(s.currentBankrollUnits, 3623.97);
  assert.equal(s.currentProgressionStep, 5);
  assert.deepEqual(s.record, { wins: 4, losses: 0, pushes: 0 });
  assert.equal(l.entries.length, 4); // the four settled hits — Step 4 added exactly once
  assert.equal(l.entries.filter((e) => e.step === 4).length, 1, "Step 4 settled once (idempotent)");
  // Step 5 is the pending final rung; no Step 5 card published yet.
  assert.equal(l.nextPickStatus, "pending");
  assert.equal(l.nextStakeUnits, 3623.97);
  assert.equal(l.nextTargetUnits, 10000);
});
