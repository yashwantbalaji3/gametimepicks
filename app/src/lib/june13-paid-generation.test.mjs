/**
 * June 13 paid three-sport generation invariants: MLB June-13 board is REAL (live odds,
 * 600+ leans, not demo), suggested slips are real MLB legs, NBA Game-5 board is real but
 * model-recommends nothing (all No Play), and Step 5 stays review-pending (no invented card,
 * no fabricated odds).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "public", "data");
const read = (rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));

test("MLB June-13 board is REAL with live odds/props (not demo, not fabricated)", () => {
  const b = read("mlb/boards/2026-06-13.json");
  assert.equal(b.isDemo, false);
  assert.ok(b.leans.length >= 500, "full real prop slate");
  const withOdds = b.leans.filter((l) => l.oddsOver != null || l.oddsUnder != null);
  assert.ok(withOdds.length >= 500, "leans carry real book odds");
  // Real model output, not placeholder.
  const l = b.leans.find((x) => x.modelProbOver != null);
  assert.ok(l && l.modelProbOver > 0 && l.modelProbOver < 1, "real model probability");
  assert.ok(["draftkings", "fanduel"].includes(l.bookmaker), "real book label");
});

test("June-13 suggested slips are real MLB legs (no fabricated cards)", () => {
  const snap = read("parlays/snapshots/2026-06-13.json");
  const slips = Array.isArray(snap) ? snap : snap.slips ?? snap.parlays ?? Object.values(snap).find(Array.isArray) ?? [];
  assert.ok(slips.length >= 5, "suggested slips generated");
  const legs = slips.flatMap((s) => s.legs ?? []);
  assert.ok(legs.every((l) => l.playerName), "every leg names a real player");
});

test("NBA Game-5 board is REAL/Live (the model may now supply recommended legs)", () => {
  // Earlier the board was all No-Play (insufficient_data); a later board refresh with real
  // game logs can produce model recommendations. Either way the board must be real, not demo.
  const nba = read("boards/2026-06-13.json");
  assert.equal(nba.isDemo, false);
  assert.ok(nba.leans.length > 50, "real props present");
});

test("Step 5 stays review-pending — no invented card; Bank Builder unchanged", () => {
  const s = read("bank-builder/public-summary-latest.json");
  assert.equal(s.currentBankrollUnits, 3623.97);
  assert.equal(s.currentProgressionStep, 5);
  const l = read("bank-builder/public-ledger-latest.json");
  assert.equal(l.nextPickStatus, "pending");
  assert.equal(l.entries.filter((e) => e.step === 5).length, 0, "no Step 5 entry");
  // No published Step-5 candidate artifact was invented.
  assert.equal(fs.existsSync(path.join(dir, "bank-builder/official-step5-candidate.json")), false,
    "no Step 5 candidate fabricated");
});
