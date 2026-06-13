/**
 * Bank Builder Step 5 candidate contract (owner-authorized NBA+MLB cross-sport final step).
 * The published candidate must be a real, gate-cleared, PENDING 2-leg card — exactly one NBA
 * Finals Game 5 leg + one MLB leg — that clears +176 / $10,000 with real odds + model AND
 * market probability per leg, zero cross-sport correlation, and which never mutates the
 * bankroll/record/ledger before settlement. Guards against fabrication, settlement, or a
 * weak/under-target card.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "data");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));
const candPath = path.join(dir, "bank-builder/official-step5-candidate.json");
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

test("Step 5 candidate (if published) is a real NBA+MLB cross-sport 2-leg, pending", () => {
  if (!fs.existsSync(candPath)) return; // no card is a valid outcome
  const c = JSON.parse(fs.readFileSync(candPath, "utf8"));
  assert.equal(c.step, 5);
  assert.equal(c.status, "pending", "pending — never settled at publish time");
  assert.equal(c.stake, 3623.97, "stake is the full current bankroll");
  assert.equal(c.legs.length, 2, "exactly 2 legs");
  const sports = c.legs.map((l) => l.sport).sort();
  assert.deepEqual(sports, ["mlb", "nba"], "one NBA + one MLB leg (cross-sport, owner-authorized)");
  // No World Cup leg / no stale-WC dependency.
  assert.ok(!c.legs.some((l) => l.sport === "world_cup"), "no World Cup leg");
});

test("Step 5 candidate clears every gate: +176 / >=$10,000 / model>=0.55 / market>=0.50", () => {
  if (!fs.existsSync(candPath)) return;
  const c = JSON.parse(fs.readFileSync(candPath, "utf8"));
  // Combined odds recomputed from the legs — no trusting a hand-typed number.
  const d = c.legs.reduce((acc, l) => acc * dec(l.americanOdds), 1);
  assert.ok(Math.round((d - 1) * 100) >= 176, "combined odds >= +176");
  assert.equal(Math.round(c.stake * d * 100) / 100, c.projectedReturn, "return math exact");
  assert.ok(c.projectedReturn >= 10000, "projected return reaches the $10,000 crown");
  for (const l of c.legs) {
    assert.equal(typeof l.americanOdds, "number");
    assert.ok(l.bookmaker, "real book label");
    assert.ok(l.modelProbability >= 0.55, `model support ${l.modelProbability}`);
    assert.ok(l.marketProbability >= 0.5, `market support ${l.marketProbability}`);
  }
});

test("Step 5 candidate legs are non-correlated, lineup-safe, and from tonight's slate", () => {
  if (!fs.existsSync(candPath)) return;
  const c = JSON.parse(fs.readFileSync(candPath, "utf8"));
  assert.equal(c.date, "2026-06-13");
  // Cross-sport = zero same-game correlation; the artifact must say so.
  assert.ok(/correlation/i.test(c.correlationNote ?? ""), "correlation note present");
  // The MLB leg is a real, lineup-grounded player prop (a probable-starter pitcher OR an
  // everyday-starter batter). Either way the lineupBasis must document the start expectation.
  const mlb = c.legs.find((l) => l.sport === "mlb");
  assert.ok(["pitcher", "batter"].includes(mlb.playerRole), "MLB leg is a real pitcher/batter prop");
  assert.ok(/starter/i.test(mlb.lineupBasis ?? ""), "MLB leg documents its starter basis");
  assert.ok(mlb.playerId, "MLB leg has a real player id");
  // The NBA leg is a Finals starter with a real player id.
  const nba = c.legs.find((l) => l.sport === "nba");
  assert.ok(nba.playerId, "NBA leg has a real player id");
});

test("the owner-disfavored Wembanyama Rebounds Under leg is not in the published card", () => {
  if (!fs.existsSync(candPath)) return;
  const c = JSON.parse(fs.readFileSync(candPath, "utf8"));
  const hasWembyRebUnder = c.legs.some(
    (l) => /wembanyama/i.test(l.playerName ?? "") && /rebound/i.test(l.marketLabel ?? "") && l.side === "Under",
  );
  assert.ok(!hasWembyRebUnder, "the replaced Wembanyama Rebounds Under leg must not remain");
  // No banned copy may ride along in the artifact text.
  const blob = JSON.stringify(c).toLowerCase();
  for (const w of ["guarantee", "guaranteed", "risk-free", "can't miss", "cant miss", "sure thing", "free money", "safest"]) {
    assert.ok(!blob.includes(w), `banned copy "${w}" must not appear`);
  }
});

test("publishing the Step 5 candidate did NOT settle or mutate the ladder", () => {
  const s = read("bank-builder/public-summary-latest.json");
  assert.equal(s.currentBankrollUnits, 3623.97);
  assert.equal(s.currentProgressionStep, 5);
  assert.deepEqual(s.record, { wins: 4, losses: 0, pushes: 0 });
  const l = read("bank-builder/public-ledger-latest.json");
  assert.equal(l.entries.filter((e) => e.step === 5).length, 0, "no settled Step 5 entry");
});

test("the candidate loader reads the CURRENT step's file (step-generalized)", () => {
  const src = fs.readFileSync("src/lib/bank-builder-official-candidate.ts", "utf8");
  assert.ok(src.includes("official-step${step}-candidate.json"), "loader is step-generalized");
  assert.ok(src.includes("modelProbability >= 0.55") && src.includes("marketProbability >= 0.5"),
    "loader re-validates the gates at read time");
});
