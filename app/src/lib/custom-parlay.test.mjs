/**
 * Tests for the custom-parlay evaluator (PR #101 commit 3).
 *
 * Run:
 *   npx tsx --test app/src/lib/custom-parlay.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateCustomParlay,
  computeCombinedAmericanOdds,
  warningLabel,
  getLegPool,
  CUSTOM_PARLAY_MAX_LEGS,
} from "./custom-parlay.ts";

function mkLeg(over = {}) {
  return {
    sport: "nba",
    leanId: "x",
    gameId: "g1",
    playerId: 1,
    playerName: "Player A",
    team: "OKC",
    opponent: "SAS",
    market: "REB",
    marketLabel: null,
    side: "Over",
    line: 5,
    projection: 6,
    edgePct: 8,
    confidence: "High",
    bookmaker: "draftkings",
    oddsForSide: -110,
    recent10Count: 8,
    isAnomaly: false,
    isVolatileMlb: false,
    starTier: "superstar",
    isStar: true,
    legScore: 1.2,
    ...over,
  };
}

test("empty selection → clean empty evaluation", () => {
  const e = evaluateCustomParlay([]);
  assert.equal(e.legCount, 0);
  assert.equal(e.modelRating, 0);
  assert.equal(e.combinedOdds, null);
  assert.deepEqual(e.warnings, []);
  assert.equal(e.starHeavy, false);
  assert.equal(e.valueHeavy, false);
  assert.equal(e.riskLabel, "Lower variance");
});

test("leg count + average edge computed correctly", () => {
  const e = evaluateCustomParlay([
    mkLeg({ edgePct: 10 }),
    mkLeg({ edgePct: 6, gameId: "g2", team: "DAL" }),
  ]);
  assert.equal(e.legCount, 2);
  assert.equal(e.averageEdgePct, 8); // (10 + 6) / 2
});

test("same-game stack warning fires", () => {
  const e = evaluateCustomParlay([
    mkLeg({ playerName: "A", playerId: 1, team: "OKC" }),
    mkLeg({ playerName: "B", playerId: 2, team: "SAS" }), // same gameId
  ]);
  assert.ok(e.warnings.includes("same_game_stack"),
    `expected same_game_stack in ${e.warnings}`);
  // Correlation penalty applied: modelRating should be lower than
  // sum of leg scores by 0.08 (one extra leg sharing a game).
  assert.ok(e.modelRating < 2.4, `model rating reduced from 2.4 by penalty (got ${e.modelRating})`);
});

test("same-team stack warning fires (different games same team)", () => {
  // Defensive: same team across two games isn't real on a single
  // night, but the heuristic still catches duplicate-team selections.
  const e = evaluateCustomParlay([
    mkLeg({ playerName: "A", playerId: 1, gameId: "g1", team: "OKC" }),
    mkLeg({ playerName: "B", playerId: 2, gameId: "g2", team: "OKC" }),
  ]);
  assert.ok(e.warnings.includes("same_team_stack"));
});

test("low-confidence warning fires when any leg is below High", () => {
  const e = evaluateCustomParlay([
    mkLeg({ confidence: "High" }),
    mkLeg({ confidence: "Low", playerName: "B", playerId: 2, gameId: "g2", team: "DAL" }),
  ]);
  assert.ok(e.warnings.includes("low_confidence_leg"));
});

test("volatile-market warning fires on batter_total_bases", () => {
  const e = evaluateCustomParlay([
    mkLeg({ sport: "mlb", market: "batter_total_bases", isVolatileMlb: true,
            playerName: "A", playerId: 1, team: "LAD", gameId: "m1" }),
    mkLeg({ playerName: "B", playerId: 2, team: "BOS", gameId: "g3" }),
  ]);
  assert.ok(e.warnings.includes("volatile_market"));
});

test("star-heavy badge appears when most legs are stars", () => {
  const e = evaluateCustomParlay([
    mkLeg({ isStar: true, starTier: "superstar",
            playerName: "A", playerId: 1, gameId: "g1", team: "T1" }),
    mkLeg({ isStar: true, starTier: "core",
            playerName: "B", playerId: 2, gameId: "g2", team: "T2" }),
    mkLeg({ isStar: true, starTier: "superstar",
            playerName: "C", playerId: 3, gameId: "g3", team: "T3" }),
  ]);
  assert.equal(e.starHeavy, true);
  assert.ok(e.warnings.includes("star_heavy"));
});

test("value-heavy badge appears when most legs are non-stars or Low conf", () => {
  const e = evaluateCustomParlay([
    mkLeg({ isStar: false, starTier: "none", playerName: "A", playerId: 1, gameId: "g1", team: "T1" }),
    mkLeg({ isStar: false, starTier: "none", playerName: "B", playerId: 2, gameId: "g2", team: "T2" }),
    mkLeg({ isStar: true, starTier: "superstar", playerName: "C", playerId: 3, gameId: "g3", team: "T3" }),
  ]);
  assert.equal(e.valueHeavy, true);
  assert.ok(e.warnings.includes("value_heavy"));
  // And NOT star_heavy at the same time (mutually exclusive in the
  // warnings list — see implementation).
  assert.ok(!e.warnings.includes("star_heavy"));
});

test("too-many-legs warning fires above 5 legs", () => {
  const legs = [];
  for (let i = 1; i <= 6; i++) {
    legs.push(mkLeg({ playerName: `P${i}`, playerId: i, gameId: `g${i}`, team: `T${i}` }));
  }
  const e = evaluateCustomParlay(legs);
  assert.ok(e.warnings.includes("too_many_legs"));
  assert.equal(e.legCount, 6);
  assert.equal(legs.length, CUSTOM_PARLAY_MAX_LEGS);
});

test("risk label by leg count", () => {
  const oneLeg = evaluateCustomParlay([mkLeg()]);
  assert.equal(oneLeg.riskLabel, "Lower variance");
  const twoLegs = evaluateCustomParlay([
    mkLeg({ playerName: "A", playerId: 1, gameId: "g1", team: "T1" }),
    mkLeg({ playerName: "B", playerId: 2, gameId: "g2", team: "T2" }),
  ]);
  assert.equal(twoLegs.riskLabel, "Lower variance");
  const threeLegs = evaluateCustomParlay([
    mkLeg({ playerName: "A", playerId: 1, gameId: "g1", team: "T1" }),
    mkLeg({ playerName: "B", playerId: 2, gameId: "g2", team: "T2" }),
    mkLeg({ playerName: "C", playerId: 3, gameId: "g3", team: "T3" }),
  ]);
  assert.equal(threeLegs.riskLabel, "Balanced");
  const fiveLegs = evaluateCustomParlay([
    mkLeg({ playerName: "A", playerId: 1, gameId: "g1", team: "T1" }),
    mkLeg({ playerName: "B", playerId: 2, gameId: "g2", team: "T2" }),
    mkLeg({ playerName: "C", playerId: 3, gameId: "g3", team: "T3" }),
    mkLeg({ playerName: "D", playerId: 4, gameId: "g4", team: "T4" }),
    mkLeg({ playerName: "E", playerId: 5, gameId: "g5", team: "T5" }),
  ]);
  assert.equal(fiveLegs.riskLabel, "High variance");
});

test("combined American odds with all -110 legs", () => {
  const legs = [
    mkLeg({ oddsForSide: -110, playerName: "A", playerId: 1, gameId: "g1", team: "T1" }),
    mkLeg({ oddsForSide: -110, playerName: "B", playerId: 2, gameId: "g2", team: "T2" }),
  ];
  const odds = computeCombinedAmericanOdds(legs);
  // Two -110 legs (decimal 1.909 each) → combined decimal ≈ 3.645 →
  // American ≈ +265.
  assert.ok(odds !== null && odds >= 260 && odds <= 270,
    `expected ~+265, got ${odds}`);
});

test("combined odds null when any leg missing odds", () => {
  const legs = [
    mkLeg({ oddsForSide: null, playerName: "A", playerId: 1, gameId: "g1", team: "T1" }),
    mkLeg({ oddsForSide: -110, playerName: "B", playerId: 2, gameId: "g2", team: "T2" }),
  ];
  assert.equal(computeCombinedAmericanOdds(legs), null);
});

test("no warnings when slip is clean (different games, all star, high conf)", () => {
  const legs = [
    mkLeg({ playerName: "A", playerId: 1, gameId: "g1", team: "T1" }),
    mkLeg({ playerName: "B", playerId: 2, gameId: "g2", team: "T2" }),
  ];
  const e = evaluateCustomParlay(legs);
  // star_heavy is a positive badge but also a warning — exclude it
  // for "no warning" assertion.
  const negative = e.warnings.filter((w) => w !== "star_heavy");
  assert.deepEqual(negative, [], `expected no negative warnings, got ${negative}`);
});

test("warningLabel maps every warning code to a human string", () => {
  const codes = [
    "same_game_stack", "same_team_stack", "low_confidence_leg",
    "volatile_market", "too_many_legs", "star_heavy", "value_heavy",
  ];
  for (const c of codes) {
    const label = warningLabel(c);
    assert.ok(label.length > 0 && label !== c, `${c} should map to a human label`);
  }
});

// ---------------------------------------------------------------------------
// getLegPool — Build Your Own candidate-pool gate (PR `byo-modeled-sport-gating`)
// ---------------------------------------------------------------------------
function poolLeg(sport, leanId, side = "Over") {
  return { sport, leanId, side, market: "PTS", line: 1.5, oddsForSide: -110 };
}

test("getLegPool keeps only modeled-sport Over/Under legs (BYO gate)", () => {
  const snapshot = {
    legPool: {
      legs: [
        poolLeg("nba", "a"),
        poolLeg("mlb", "b"),
        poolLeg("nhl", "c"), // schedule-only — excluded
        poolLeg("wnba", "d"), // schedule-only — excluded
        poolLeg("epl", "e"), // coming-soon — excluded
        poolLeg("cricket", "f"), // unknown — excluded
        poolLeg("", "g"), // missing sport — excluded
        poolLeg("nba", "h", "Push"), // non-Over/Under — excluded by existing guard
      ],
    },
  };
  const pool = getLegPool(snapshot);
  assert.deepEqual(
    pool.map((l) => l.leanId).sort(),
    ["a", "b"],
    "only NBA + MLB Over/Under legs survive the BYO pool gate",
  );
});

test("getLegPool allows a mixed NBA+MLB pool (mixed BYO is permitted)", () => {
  const snapshot = {
    legPool: { legs: [poolLeg("nba", "x"), poolLeg("mlb", "y")] },
  };
  const sports = new Set(getLegPool(snapshot).map((l) => l.sport));
  assert.deepEqual([...sports].sort(), ["mlb", "nba"]);
});

test("getLegPool handles a missing/empty legPool", () => {
  assert.deepEqual(getLegPool({}), []);
  assert.deepEqual(getLegPool({ legPool: { legs: [] } }), []);
});
