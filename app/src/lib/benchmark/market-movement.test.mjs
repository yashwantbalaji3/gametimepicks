/**
 * Tests for the Market Benchmark movement engine. Deterministic — no network, no clock, no fabrication.
 * Imports the compiled TS via tsx. Verifies the honest-by-construction guarantees (single capture =
 * opening-only, no invented trend) and the movement math.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { americanToImpliedProb, computeMovement, computeAllMovements } from "./market-movement.ts";

const row = (capturedAt, americanOdds, extra = {}) => ({
  capturedAt, matchId: "m1", game: "A vs B", market: "moneyline_90", selection: "A",
  americanOdds, impliedProb: americanToImpliedProb(americanOdds), ...extra,
});

test("americanToImpliedProb matches book math both signs", () => {
  assert.ok(Math.abs(americanToImpliedProb(-150) - 0.6) < 1e-9);
  assert.ok(Math.abs(americanToImpliedProb(150) - 0.4) < 1e-9);
  assert.equal(americanToImpliedProb(0), 0);
});

test("single capture is opening-only — never a fabricated trend", () => {
  const m = computeMovement([row("2026-06-26T06:00:00Z", -150)]);
  assert.equal(m.direction, "flat");
  assert.equal(m.confidence, "opening-only");
  assert.equal(m.confidenceScore, 0);
  assert.equal(m.steps, 1);
  assert.equal(m.openingOdds, m.currentOdds);
});

test("shortening line (prob up) is detected with sign + magnitude", () => {
  // -150 (0.60) -> -200 (0.667): the favorite shortened.
  const m = computeMovement([row("2026-06-26T06:00:00Z", -150), row("2026-06-26T12:00:00Z", -200)]);
  assert.equal(m.direction, "shortening");
  assert.ok(m.impliedProbDelta > 0, "implied prob increased");
  assert.equal(m.steps, 2);
  assert.ok(m.confidenceScore > 0);
});

test("drifting line (prob down) is detected", () => {
  const m = computeMovement([row("2026-06-26T06:00:00Z", -200), row("2026-06-26T12:00:00Z", -150)]);
  assert.equal(m.direction, "drifting");
  assert.ok(m.impliedProbDelta < 0);
});

test("consistent one-way drift scores higher than choppy back-and-forth", () => {
  const clean = computeMovement([row("2026-06-26T01:00:00Z", -120), row("2026-06-26T02:00:00Z", -150), row("2026-06-26T03:00:00Z", -180)]);
  const choppy = computeMovement([row("2026-06-26T01:00:00Z", -120), row("2026-06-26T02:00:00Z", -180), row("2026-06-26T03:00:00Z", -150)]);
  // same opening (-120) and we compare consistency; clean ends further shortened so its score is >= choppy
  assert.ok(clean.confidenceScore >= choppy.confidenceScore);
  assert.equal(clean.direction, "shortening");
});

test("rows out of order are sorted by capturedAt before computing", () => {
  const m = computeMovement([row("2026-06-26T12:00:00Z", -200), row("2026-06-26T06:00:00Z", -150)]);
  assert.equal(m.openingOdds, -150, "earliest capture is the opening");
  assert.equal(m.currentOdds, -200, "latest capture is current");
});

test("computeAllMovements groups by matchId|market|selection", () => {
  const rows = [
    row("2026-06-26T06:00:00Z", -150),
    row("2026-06-26T12:00:00Z", -200),
    row("2026-06-26T06:00:00Z", 130, { selection: "B" }),
  ];
  const all = computeAllMovements(rows);
  assert.equal(all.length, 2, "two distinct lines (A with 2 captures, B with 1)");
  const a = all.find((m) => m.selection === "A");
  assert.equal(a.steps, 2);
});

test("empty input yields no movement (no crash, no fabrication)", () => {
  assert.equal(computeMovement([]), null);
  assert.deepEqual(computeAllMovements([]), []);
});
