/**
 * Tests for the custom-parlay grading helper.
 *
 * Run: npx tsx --test app/src/lib/custom-parlay-grade.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { gradeCustomParlay } from "./custom-parlay-grade.ts";

// ---------------------------------------------------------------------------
// Test fixtures — minimal OptimizerLeg-shaped objects.
// ---------------------------------------------------------------------------

function _leg(over) {
  return {
    leanId: "x",
    gameId: "g1",
    playerId: 1,
    playerName: "Player",
    team: "T1",
    opponent: "T2",
    market: "batter_hits",
    marketLabel: "Hits",
    side: "Over",
    line: 0.5,
    projection: 1.0,
    edgePct: 10,
    confidence: "High",
    bookmaker: "draftkings",
    oddsForSide: -150,
    recent10Count: 0,
    recentSeries: [1, 1, 2, 1, 0],
    isAnomaly: false,
    isVolatileMlb: false,
    isStar: true,
    legScore: 1.10,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Empty / pool-not-populated path
// ---------------------------------------------------------------------------

test("empty leg pool returns neutral C with explicit 'no legs picked yet'", () => {
  const g = gradeCustomParlay([]);
  assert.equal(g.grade, "C");
  assert.equal(g.score, 50);
  assert.deepEqual(g.warnings, ["No legs picked yet."]);
  assert.deepEqual(g.positives, []);
});

// ---------------------------------------------------------------------------
// Quality monotonicity — 2-leg High confidence > 5-leg longshot
// ---------------------------------------------------------------------------

test("2-leg High confidence grades higher than 5-leg longshot", () => {
  const strong = gradeCustomParlay([
    _leg({ playerName: "A", team: "T1", gameId: "g1" }),
    _leg({ playerName: "B", team: "T2", gameId: "g2" }),
  ]);
  const longshot = gradeCustomParlay([
    _leg({ playerName: "C", team: "T1", gameId: "g1", confidence: "Low", legScore: 0.4, oddsForSide: 200, recentSeries: [], market: "pitcher_strikeouts" }),
    _leg({ playerName: "D", team: "T2", gameId: "g2", confidence: "Low", legScore: 0.4, oddsForSide: 240, recentSeries: [], market: "pitcher_strikeouts" }),
    _leg({ playerName: "E", team: "T3", gameId: "g3", confidence: "Low", legScore: 0.4, oddsForSide: 180, recentSeries: [], market: "batter_total_bases" }),
    _leg({ playerName: "F", team: "T4", gameId: "g4", confidence: "Low", legScore: 0.4, oddsForSide: 160, recentSeries: [], market: "batter_total_bases" }),
    _leg({ playerName: "G", team: "T5", gameId: "g5", confidence: "Low", legScore: 0.4, oddsForSide: 220, recentSeries: [], market: "pitcher_strikeouts" }),
  ]);
  assert.ok(strong.score > longshot.score,
    `strong=${strong.score} (${strong.grade}) should beat longshot=${longshot.score} (${longshot.grade})`);
  assert.ok(["A", "B"].includes(strong.grade),
    `strong slip should land in A or B, got ${strong.grade}`);
  assert.ok(["D", "F"].includes(longshot.grade),
    `longshot slip should land in D or F, got ${longshot.grade}`);
});

// ---------------------------------------------------------------------------
// DNP risk lowers score
// ---------------------------------------------------------------------------

test("DNP risk (no recent activity) lowers score vs identical slip with recent data", () => {
  const baseline = gradeCustomParlay([
    _leg({ playerName: "A", team: "T1", gameId: "g1", recentSeries: [1, 2, 1, 1, 2] }),
    _leg({ playerName: "B", team: "T2", gameId: "g2", recentSeries: [1, 1, 2, 1, 0] }),
    _leg({ playerName: "C", team: "T3", gameId: "g3", recentSeries: [2, 1, 1, 1, 0] }),
  ]);
  const dnpRisky = gradeCustomParlay([
    _leg({ playerName: "A", team: "T1", gameId: "g1", recentSeries: [] }),
    _leg({ playerName: "B", team: "T2", gameId: "g2", recentSeries: [] }),
    _leg({ playerName: "C", team: "T3", gameId: "g3", recentSeries: [1, 2, 1, 1, 0] }),
  ]);
  assert.ok(baseline.score > dnpRisky.score,
    `baseline=${baseline.score} should beat dnpRisky=${dnpRisky.score}`);
});

// ---------------------------------------------------------------------------
// Missing recent-form data lowers score
// ---------------------------------------------------------------------------

test("Missing recent-form data lowers score vs identical slip with form", () => {
  const withForm = gradeCustomParlay([
    _leg({ playerName: "A", team: "T1", gameId: "g1", recentSeries: [1, 1, 2, 1, 2], recent10Count: 0 }),
    _leg({ playerName: "B", team: "T2", gameId: "g2", recentSeries: [1, 2, 1, 1, 0], recent10Count: 0 }),
  ]);
  const noForm = gradeCustomParlay([
    _leg({ playerName: "A", team: "T1", gameId: "g1", recentSeries: [], recent10Count: 0 }),
    _leg({ playerName: "B", team: "T2", gameId: "g2", recentSeries: [], recent10Count: 0 }),
  ]);
  assert.ok(withForm.score > noForm.score);
});

// ---------------------------------------------------------------------------
// Too many same-game unrelated legs lowers score
// ---------------------------------------------------------------------------

test("Too many same-game legs lowers score vs identical slip across different games", () => {
  const independent = gradeCustomParlay([
    _leg({ playerName: "A", team: "T1", gameId: "g1" }),
    _leg({ playerName: "B", team: "T2", gameId: "g2" }),
    _leg({ playerName: "C", team: "T3", gameId: "g3" }),
  ]);
  const sameGame = gradeCustomParlay([
    _leg({ playerName: "A", team: "T1", gameId: "g1" }),
    _leg({ playerName: "B", team: "T2", gameId: "g1" }),
    _leg({ playerName: "C", team: "T1", gameId: "g1" }),
  ]);
  assert.ok(independent.score > sameGame.score,
    `independent=${independent.score} should beat sameGame=${sameGame.score}`);
});

// ---------------------------------------------------------------------------
// Score bounded [0, 100]
// ---------------------------------------------------------------------------

test("Score always bounded to [0, 100] across many leg counts", () => {
  for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const legs = Array.from({ length: n }).map((_, i) =>
      _leg({ playerName: `P${i}`, team: `T${i}`, gameId: `g${i}` })
    );
    const g = gradeCustomParlay(legs);
    assert.ok(g.score >= 0 && g.score <= 100,
      `n=${n}: score ${g.score} must be in [0, 100]`);
  }
});

// ---------------------------------------------------------------------------
// Leg-count ceiling — 6+ legs can't grade A
// ---------------------------------------------------------------------------

test("6-leg slip with all High confidence still capped below A", () => {
  const legs = Array.from({ length: 6 }).map((_, i) =>
    _leg({ playerName: `P${i}`, team: `T${i}`, gameId: `g${i}` })
  );
  const g = gradeCustomParlay(legs);
  assert.notEqual(g.grade, "A", `6-leg slip got ${g.grade} with score ${g.score} — should be capped below A`);
});

// ---------------------------------------------------------------------------
// Banned-copy contract on all labels + warnings + positives
// ---------------------------------------------------------------------------

test("no banned copy in any grade output across many fixtures", () => {
  const banned = [
    /\block\b/i,
    /\bguaranteed\b/i,
    /\bfree money\b/i,
    /\brisk[\s-]?free\b/i,
    /\bcan(?:'|’)?t miss\b/i,
    /\beasy (win|money)\b/i,
    /\bno[\s-]?brainer\b/i,
    /\bsure thing\b/i,
    /\bsharp money\b/i,
  ];
  const fixtures = [
    [],
    [_leg({ playerName: "A" })],
    [_leg({ playerName: "A" }), _leg({ playerName: "B", team: "T2", gameId: "g2" })],
    Array.from({ length: 5 }).map((_, i) => _leg({ playerName: `P${i}`, team: `T${i}`, gameId: `g${i}`, confidence: "Low" })),
    Array.from({ length: 6 }).map((_, i) => _leg({ playerName: `P${i}`, team: `T${i}`, gameId: `g${i}` })),
  ];
  for (const fx of fixtures) {
    const g = gradeCustomParlay(fx);
    const allText = [g.label, ...g.warnings, ...g.positives].join(" || ");
    for (const pattern of banned) {
      assert.ok(!pattern.test(allText),
        `grade output "${allText}" must not match ${pattern}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Factor breakdown — keys present and bounded
// ---------------------------------------------------------------------------

test("factor breakdown returns all 7 documented factors, each 0-1", () => {
  const g = gradeCustomParlay([
    _leg({ playerName: "A", team: "T1", gameId: "g1" }),
    _leg({ playerName: "B", team: "T2", gameId: "g2" }),
  ]);
  const expected = [
    "legQuality", "correlation", "diversity", "marketStability",
    "recentFormCoverage", "oddsRisk", "dnpRisk",
  ];
  for (const k of expected) {
    const v = g.factors[k];
    assert.equal(typeof v, "number", `factor ${k} must be a number`);
    assert.ok(v >= 0 && v <= 1, `factor ${k}=${v} must be in [0, 1]`);
  }
});

// ---------------------------------------------------------------------------
// Letter buckets are deterministic
// ---------------------------------------------------------------------------

test("letter buckets are deterministic for the same input", () => {
  const legs = [
    _leg({ playerName: "A", team: "T1", gameId: "g1" }),
    _leg({ playerName: "B", team: "T2", gameId: "g2" }),
  ];
  const g1 = gradeCustomParlay(legs);
  const g2 = gradeCustomParlay(legs);
  assert.equal(g1.score, g2.score);
  assert.equal(g1.grade, g2.grade);
});
