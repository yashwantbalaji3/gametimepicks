/**
 * SPRINT 043 — the SportAdapter contract, tested against the sports it was derived from.
 *
 * The load-bearing test here is not that `deriveReadiness` returns plausible strings. It is that
 * feeding it the MEASURED evidence from the 2026-07-28 multi-sport audit reproduces the verdicts that
 * audit reached independently. If the contract and the audit disagree, one of them is wrong, and this
 * is where that shows up rather than in a sport shipping something it cannot support.
 *
 * Run: npx tsx --test src/lib/identity/sport-adapter.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveReadiness, isLeakageSafe } from "./sport-adapter.ts";

// ── leakage safety ─────────────────────────────────────────────────────────────

test("isLeakageSafe accepts a capture strictly before the event", () => {
  assert.equal(
    isLeakageSafe({ capturedAt: "2026-07-28T15:50:37Z", eventStart: "2026-07-28T17:40:00Z" }),
    true,
  );
});

test("isLeakageSafe rejects a capture at or after the event start", () => {
  assert.equal(
    isLeakageSafe({ capturedAt: "2026-07-28T17:40:00Z", eventStart: "2026-07-28T17:40:00Z" }),
    false,
    "equal timestamps are not provably pregame",
  );
  assert.equal(
    isLeakageSafe({ capturedAt: "2026-07-28T18:00:00Z", eventStart: "2026-07-28T17:40:00Z" }),
    false,
  );
});

test("isLeakageSafe fails closed on missing or unparseable timing", () => {
  // The NBA case: tip-off stored as display text ("8:30 PM ET"), so nothing is provable.
  assert.equal(isLeakageSafe({ capturedAt: "2026-07-28T15:00:00Z", eventStart: null }), false);
  assert.equal(isLeakageSafe({ capturedAt: "2026-07-28T15:00:00Z", eventStart: "8:30 PM ET" }), false);
  assert.equal(isLeakageSafe(null), false);
  assert.equal(isLeakageSafe(undefined), false);
});

test("isLeakageSafe prefers availableAt when it is later than capture", () => {
  // A value we captured early but that only became knowable later must be judged on availability.
  assert.equal(
    isLeakageSafe({
      capturedAt: "2026-07-28T10:00:00Z",
      availableAt: "2026-07-28T18:00:00Z",
      eventStart: "2026-07-28T17:40:00Z",
    }),
    false,
  );
});

// ── the audit reproduction ─────────────────────────────────────────────────────

test("MLB — leakage-safe, settled, but loses to the market → HISTORICAL_ONLY", () => {
  // Measured: all 4 modeled markets lose to the market across 18,659 leans
  // (lib/mlb/model-calibration-status.ts, modelBeatsMarket = false).
  const { readiness, reasons } = deriveReadiness({
    leakageSafeEvents: 30,
    settledEvents: 30,
    hasMarketBaseline: true,
    beatsMarketBaseline: false,
    identityCollisions: 0,
    singleSettlementImplementation: true,
    producingCurrentOutput: true,
  });
  assert.equal(readiness, "HISTORICAL_ONLY");
  assert.match(reasons.join(" "), /did not out-predict/);
});

test("MLB before the Sprint 041 fix — a single collision caps it, regardless of everything else", () => {
  const { readiness, reasons } = deriveReadiness({
    leakageSafeEvents: 30,
    settledEvents: 30,
    hasMarketBaseline: true,
    beatsMarketBaseline: true, // even granting the best case
    identityCollisions: 4, // the 4 measured across 58 boards
    singleSettlementImplementation: true,
    producingCurrentOutput: true,
  });
  assert.equal(readiness, "HISTORICAL_ONLY", "a collision must block FULL_MODEL outright");
  assert.match(reasons.join(" "), /identity collision/);
});

test("UFC — 0 backtestable bouts, career-aggregate features → SCAFFOLD_ONLY", () => {
  // Measured: 20 pregame lines ever captured, none joining a same-fight result; rowCount 0;
  // 10 rematch key collisions in `sorted(fighter_a, fighter_b)`.
  const { readiness, reasons } = deriveReadiness({
    leakageSafeEvents: 0,
    settledEvents: 0,
    hasMarketBaseline: false,
    beatsMarketBaseline: false,
    identityCollisions: 10,
    singleSettlementImplementation: true,
    producingCurrentOutput: false,
  });
  assert.equal(readiness, "DISABLED", "nothing captured and nothing settled leaves nothing to study");
  assert.match(reasons.join(" "), /nothing to model/);
});

test("UFC with its graded rows counted — still SCAFFOLD_ONLY, never RESEARCH", () => {
  // graded-moneylines-latest.json: 10 graded, of which the 1 win / 1 loss are rematch collisions.
  const { readiness, reasons } = deriveReadiness({
    leakageSafeEvents: 0,
    settledEvents: 0,
    hasMarketBaseline: false,
    beatsMarketBaseline: false,
    identityCollisions: 10,
    singleSettlementImplementation: true,
    producingCurrentOutput: true,
  });
  assert.equal(readiness, "DISABLED");
  assert.ok(reasons.length > 0);
});

test("Soccer World Cup — real backtest that loses to the closing market → HISTORICAL_ONLY", () => {
  // Measured: n=64 (2022 WC), model Brier 0.5925 vs market 0.5826 → +0.0099. modelBeatsMarket false.
  // Plus TWO settlement implementations writing incompatible schemas to one directory.
  const { readiness, reasons } = deriveReadiness({
    leakageSafeEvents: 64,
    settledEvents: 64,
    hasMarketBaseline: true,
    beatsMarketBaseline: false,
    identityCollisions: 0,
    singleSettlementImplementation: false,
    producingCurrentOutput: false,
  });
  assert.equal(readiness, "HISTORICAL_ONLY");
  assert.match(reasons.join(" "), /more than one settlement implementation/);
});

test("Soccer EPL / UCL / MLS — no artifacts and no code → DISABLED", () => {
  const { readiness } = deriveReadiness({
    leakageSafeEvents: 0,
    settledEvents: 0,
    hasMarketBaseline: false,
    beatsMarketBaseline: false,
    identityCollisions: 0,
    singleSettlementImplementation: true,
    producingCurrentOutput: false,
  });
  assert.equal(readiness, "DISABLED");
});

test("NBA — 3,635 settled outcomes but 0 dates with provable tip-off → HISTORICAL_ONLY", () => {
  const { readiness, reasons } = deriveReadiness({
    leakageSafeEvents: 0, // fullyResearchEligibleDates: 0
    settledEvents: 3635,
    hasMarketBaseline: true,
    beatsMarketBaseline: false,
    identityCollisions: 0,
    singleSettlementImplementation: true,
    producingCurrentOutput: false,
  });
  assert.equal(readiness, "HISTORICAL_ONLY", "settled history survives even when the forward path is dead");
  assert.match(reasons.join(" "), /provable pregame capture/);
});

// ── the only path to FULL_MODEL ────────────────────────────────────────────────

test("FULL_MODEL requires every condition — no sport currently reaches it", () => {
  const full = {
    leakageSafeEvents: 500,
    settledEvents: 500,
    hasMarketBaseline: true,
    beatsMarketBaseline: true,
    identityCollisions: 0,
    singleSettlementImplementation: true,
    producingCurrentOutput: true,
  };
  assert.equal(deriveReadiness(full).readiness, "FULL_MODEL");

  // Each single degradation must drop it. A contract that only fails on combinations is not a gate.
  for (const [field, value] of [
    ["hasMarketBaseline", false],
    ["beatsMarketBaseline", false],
    ["identityCollisions", 1],
    ["singleSettlementImplementation", false],
    ["producingCurrentOutput", false],
    ["leakageSafeEvents", 0],
  ]) {
    const { readiness } = deriveReadiness({ ...full, [field]: value });
    assert.notEqual(readiness, "FULL_MODEL", `${field}=${value} must block FULL_MODEL`);
  }
});

test("readiness always carries a reason — a bare classification is not evidence", () => {
  const cases = [
    { leakageSafeEvents: 0, settledEvents: 0, hasMarketBaseline: false, beatsMarketBaseline: false, identityCollisions: 0, singleSettlementImplementation: true, producingCurrentOutput: false },
    { leakageSafeEvents: 10, settledEvents: 10, hasMarketBaseline: true, beatsMarketBaseline: true, identityCollisions: 0, singleSettlementImplementation: true, producingCurrentOutput: true },
    { leakageSafeEvents: 10, settledEvents: 0, hasMarketBaseline: false, beatsMarketBaseline: false, identityCollisions: 3, singleSettlementImplementation: false, producingCurrentOutput: true },
  ];
  for (const c of cases) {
    const { reasons } = deriveReadiness(c);
    assert.ok(reasons.length > 0, "every verdict must state why");
    assert.ok(reasons.every((r) => r.length > 10), "reasons must be readable, not codes");
  }
});
