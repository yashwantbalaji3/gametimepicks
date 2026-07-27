/**
 * Tests for the Custom Parlay Generator (PR #115).
 *
 * Run: npx tsx --test app/src/lib/custom-parlay-generator.test.mjs
 *
 * Honesty contract locked here:
 *   - never invents a leg (every output leg comes from the pool)
 *   - DNP guard runs in `safe` mode; opt-in `allowRiskLegs` flags
 *     each slip with `containsRiskLeg`
 *   - Mixed sport mode requires ≥ 2 sports on every returned slip
 *   - sport-only modes never bleed legs from the other sport
 *   - generator returns fewer slips honestly when the pool is small
 */
import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * FIXTURE eligibility gate — treats NBA and MLB as eligible.
 *
 * These tests exercise generator MECHANICS that are sport-SHAPED: the DNP guard reads
 * `recent10Count` for NBA legs and `recentSeries` for MLB legs, mixed mode needs two sports,
 * and the view filter needs something to filter. None of that is a claim that NBA is currently
 * modeled — it is HISTORICAL_ONLY and production refuses it (asserted in
 * capability-product-gating.test.mjs). Injecting the gate keeps this real coverage alive
 * instead of deleting the NBA-shaped cases to make the migration pass.
 */
const sportShapeFixture = (sport) => sport === "nba" || sport === "mlb";

import {
  generateCustomParlaysFromPool,
  describeGeneratorReason,
} from "./custom-parlay-generator.ts";

// Build a leg with sensible defaults so each test is small.
function leg(opts = {}) {
  return {
    sport: "nba",
    leanId: opts.id ?? `leg-${Math.random()}`,
    gameId: opts.gameId ?? "g1",
    playerId: opts.playerId ?? 1001,
    playerName: opts.playerName ?? "Player A",
    team: opts.team ?? "OKC",
    opponent: opts.opponent ?? "SAS",
    market: opts.market ?? "PTS",
    marketLabel: opts.marketLabel ?? null,
    side: opts.side ?? "Over",
    line: opts.line ?? 18.5,
    projection: opts.projection ?? 20,
    edgePct: opts.edgePct ?? 7,
    confidence: opts.confidence ?? "High",
    bookmaker: opts.bookmaker ?? "draftkings",
    oddsForSide: opts.oddsForSide ?? -110,
    recent10Count: opts.recent10Count ?? 10,
    recentSeries: opts.recentSeries ?? [18, 22, 20, 19, 21, 23, 18, 19, 20, 22],
    isAnomaly: opts.isAnomaly ?? false,
    isVolatileMlb: opts.isVolatileMlb ?? false,
    starTier: opts.starTier ?? "core",
    isStar: opts.isStar ?? true,
    legScore: opts.legScore ?? 1.0,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// Empty / degenerate input
// ---------------------------------------------------------------------------

test("empty pool returns empty slips with 'empty-pool' reason", () => {
  const result = generateCustomParlaysFromPool([], sportShapeFixture);
  assert.deepEqual(result.slips, []);
  assert.equal(result.reason, "empty-pool");
  assert.equal(result.poolSize, 0);
});

test("filters that eliminate everything return 'no-legs-after-filters'", () => {
  const pool = [leg({ team: "OKC", playerName: "A" })];
  const out = generateCustomParlaysFromPool(pool, { team: "NYK" }, sportShapeFixture);
  assert.deepEqual(out.slips, []);
  assert.equal(out.reason, "no-legs-after-filters");
});

// ---------------------------------------------------------------------------
// Sport filter
// ---------------------------------------------------------------------------

test("NBA mode returns NBA-only legs", () => {
  const pool = [
    leg({ sport: "nba", playerName: "A", gameId: "g1", team: "OKC", legScore: 1.5 }),
    leg({ sport: "nba", playerName: "B", gameId: "g1", team: "OKC", legScore: 1.4 }),
    leg({ sport: "mlb", playerName: "C", gameId: "m1", team: "LAD", legScore: 2.0, recentSeries: [1, 1, 1, 1, 1] }),
  ];
  const out = generateCustomParlaysFromPool(pool, { sport: "nba", risk: "balanced", count: 1 }, sportShapeFixture);
  assert.equal(out.slips.length, 1);
  assert.equal(out.slips[0].sport, "nba");
  for (const l of out.slips[0].legs) {
    assert.equal(l.sport, "nba",
      "NBA mode must never include a non-NBA leg");
  }
});

test("MLB mode returns MLB-only legs", () => {
  const pool = [
    leg({ sport: "nba", playerName: "A", legScore: 2.0 }),
    leg({ sport: "mlb", playerName: "B", gameId: "m1", team: "LAD",
          recentSeries: [1, 1, 1, 1, 1], legScore: 1.5 }),
    leg({ sport: "mlb", playerName: "C", gameId: "m2", team: "NYY",
          recentSeries: [1, 0, 1, 1, 0], legScore: 1.4 }),
  ];
  const out = generateCustomParlaysFromPool(pool, { sport: "mlb", risk: "balanced", count: 1 }, sportShapeFixture);
  assert.equal(out.slips.length, 1);
  for (const l of out.slips[0].legs) {
    assert.equal(l.sport, "mlb",
      "MLB mode must never include a non-MLB leg");
  }
});

test("Mixed mode requires ≥ 2 sports per slip", () => {
  const pool = [
    leg({ sport: "nba", playerName: "A", gameId: "g1", team: "OKC", legScore: 1.5 }),
    leg({ sport: "mlb", playerName: "B", gameId: "m1", team: "LAD",
          recentSeries: [1, 1, 1, 1, 1], legScore: 1.4 }),
  ];
  const out = generateCustomParlaysFromPool(pool, { sport: "multi", risk: "balanced", count: 1 }, sportShapeFixture);
  assert.equal(out.slips.length, 1);
  const sports = new Set(out.slips[0].legs.map((l) => l.sport));
  assert.ok(sports.size >= 2,
    "Mixed sport mode must produce slips with ≥ 2 sports");
});

test("Mixed mode returns no slips when only one sport in pool", () => {
  const pool = [
    leg({ sport: "nba", playerName: "A", legScore: 1.5 }),
    leg({ sport: "nba", playerName: "B", legScore: 1.4 }),
  ];
  const out = generateCustomParlaysFromPool(pool, { sport: "multi" }, sportShapeFixture);
  assert.equal(out.slips.length, 0,
    "Mixed mode must NOT fall through to single-sport slips");
});

// ---------------------------------------------------------------------------
// Player + team + game + market filters
// ---------------------------------------------------------------------------

test("player filter keeps only legs from named players", () => {
  const pool = [
    leg({ playerName: "Anthony Edwards", gameId: "g1", legScore: 1.5 }),
    leg({ playerName: "Mike Bridges", gameId: "g1", team: "NY", legScore: 1.4 }),
    leg({ playerName: "Other Guy", gameId: "g2", team: "LAL", legScore: 1.3 }),
  ];
  const out = generateCustomParlaysFromPool(pool, {
    risk: "balanced",
    playerNames: ["anthony edwards", "mike bridges"],
    count: 1,
  }, sportShapeFixture);
  assert.equal(out.slips.length, 1);
  for (const l of out.slips[0].legs) {
    const k = l.playerName.toLowerCase();
    assert.ok(
      k === "anthony edwards" || k === "mike bridges",
      `player filter leaked a non-named player: ${k}`,
    );
  }
});

test("team filter restricts to one team", () => {
  const pool = [
    leg({ team: "OKC", playerName: "A", legScore: 1.5 }),
    leg({ team: "OKC", playerName: "B", legScore: 1.4 }),
    leg({ team: "DAL", playerName: "C", legScore: 1.6 }),
  ];
  const out = generateCustomParlaysFromPool(pool, { team: "OKC", risk: "balanced", count: 1 }, sportShapeFixture);
  assert.equal(out.slips.length, 1);
  for (const l of out.slips[0].legs) {
    assert.equal(l.team, "OKC");
  }
});

test("gameId filter restricts to one game", () => {
  const pool = [
    leg({ gameId: "g1", playerName: "A", legScore: 1.5 }),
    leg({ gameId: "g1", playerName: "B", legScore: 1.4 }),
    leg({ gameId: "g2", playerName: "C", legScore: 1.6 }),
  ];
  const out = generateCustomParlaysFromPool(pool, { gameId: "g1", risk: "balanced", count: 1 }, sportShapeFixture);
  assert.equal(out.slips.length, 1);
  for (const l of out.slips[0].legs) {
    assert.equal(l.gameId, "g1");
  }
});

test("market filter restricts to chosen markets", () => {
  const pool = [
    leg({ market: "PTS", playerName: "A", legScore: 1.5 }),
    leg({ market: "REB", playerName: "B", legScore: 1.4 }),
    leg({ market: "AST", playerName: "C", legScore: 1.3 }),
  ];
  const out = generateCustomParlaysFromPool(pool, {
    risk: "balanced",
    markets: ["PTS", "AST"],
    count: 1,
  }, sportShapeFixture);
  assert.equal(out.slips.length, 1);
  for (const l of out.slips[0].legs) {
    assert.ok(["PTS", "AST"].includes(l.market));
  }
});

// ---------------------------------------------------------------------------
// DNP guard
// ---------------------------------------------------------------------------

test("DNP guard: Conservative excludes NBA legs with recent10Count < 7", () => {
  const pool = [
    leg({ playerName: "Strong", recent10Count: 10, legScore: 1.5 }),
    leg({ playerName: "Thin", recent10Count: 4, gameId: "g2", team: "DAL", legScore: 1.6 }),
  ];
  const out = generateCustomParlaysFromPool(pool, { risk: "conservative", count: 5 }, sportShapeFixture);
  // Conservative requires 2 legs and recent10Count >= 7. Only one
  // leg passes → no slip can be built (minLegs=2).
  assert.equal(out.slips.length, 0,
    "Conservative needs ≥ 2 DNP-safe legs; with only 1, return 0 slips");
  assert.equal(out.excludedDnp, 1);
});

test("DNP guard: allowRiskLegs surfaces thin legs and flags the slip", () => {
  const pool = [
    leg({ playerName: "A", recent10Count: 10, legScore: 1.5 }),
    leg({ playerName: "B", recent10Count: 4, gameId: "g2", team: "DAL", legScore: 1.4 }),
  ];
  const out = generateCustomParlaysFromPool(pool, {
    risk: "conservative",
    count: 1,
    allowRiskLegs: true,
  }, sportShapeFixture);
  assert.equal(out.slips.length, 1);
  assert.equal(out.slips[0].containsRiskLeg, true,
    "Slip must be flagged when it contains a DNP-risk leg");
});

test("DNP guard: MLB Conservative needs len(recentSeries) >= 5", () => {
  const pool = [
    leg({ sport: "mlb", playerName: "A", recentSeries: [1, 0, 1, 1, 1], gameId: "m1", team: "LAD" }),
    leg({ sport: "mlb", playerName: "B", recentSeries: [1, 0, 1], gameId: "m2", team: "NYY" }),
  ];
  const out = generateCustomParlaysFromPool(pool, { risk: "conservative", sport: "mlb", count: 5 }, sportShapeFixture);
  // Only A passes the MLB DNP gate. minLegs=2 for conservative → 0
  // slips built.
  assert.equal(out.slips.length, 0);
  assert.equal(out.excludedDnp, 1);
});

// ---------------------------------------------------------------------------
// Slip composition: leg count, player diversity, per-game cap
// ---------------------------------------------------------------------------

test("Conservative slip has exactly 2 legs", () => {
  const pool = [
    leg({ playerName: "A", gameId: "g1", team: "OKC", legScore: 1.5 }),
    leg({ playerName: "B", gameId: "g2", team: "DAL", legScore: 1.4 }),
    leg({ playerName: "C", gameId: "g3", team: "BOS", legScore: 1.3 }),
  ];
  const out = generateCustomParlaysFromPool(pool, { risk: "conservative", count: 1 }, sportShapeFixture);
  assert.equal(out.slips[0].legCount, 2);
});

test("no slip ever exceeds the risk's max legs (4 for Longshot)", () => {
  const pool = Array.from({ length: 8 }).map((_, i) =>
    leg({
      playerName: `P${i}`,
      gameId: `g${i}`,
      team: `T${i}`,
      legScore: 2 - i * 0.1,
      // Aggressive lane tolerates low confidence + thin recent10.
      confidence: "Low",
      edgePct: 2,
      recent10Count: 5,
    }),
  );
  const out = generateCustomParlaysFromPool(pool, { risk: "aggressive", count: 1 }, sportShapeFixture);
  assert.ok(out.slips[0].legCount <= 4,
    "Longshot cap is 4 legs even when the pool has 8 candidates");
});

test("no slip contains two legs from the same player", () => {
  const pool = [
    leg({ playerName: "A", market: "PTS", gameId: "g1", legScore: 1.5 }),
    leg({ playerName: "A", market: "REB", gameId: "g1", legScore: 1.4 }),
    leg({ playerName: "B", market: "PTS", gameId: "g2", team: "DAL", legScore: 1.3 }),
  ];
  const out = generateCustomParlaysFromPool(pool, { risk: "balanced", count: 1 }, sportShapeFixture);
  const seen = new Set();
  for (const l of out.slips[0].legs) {
    assert.ok(!seen.has(l.playerName),
      `same player appeared twice: ${l.playerName}`);
    seen.add(l.playerName);
  }
});

test("two generated slips have different anchor players when alternatives exist", () => {
  const pool = [
    leg({ playerName: "Anchor1", gameId: "g1", team: "OKC", legScore: 2.0 }),
    leg({ playerName: "Anchor2", gameId: "g2", team: "DAL", legScore: 1.9 }),
    leg({ playerName: "Filler1", gameId: "g3", team: "BOS", legScore: 1.0 }),
    leg({ playerName: "Filler2", gameId: "g4", team: "MIA", legScore: 0.9 }),
  ];
  const out = generateCustomParlaysFromPool(pool, { risk: "balanced", count: 2 }, sportShapeFixture);
  assert.equal(out.slips.length, 2);
  assert.notEqual(
    out.slips[0].legs[0].playerName,
    out.slips[1].legs[0].playerName,
    "Each generated slip must use a different anchor player when one is available",
  );
});

// ---------------------------------------------------------------------------
// Below-target reason
// ---------------------------------------------------------------------------

test("returns 'below-target' when pool can build < count slips", () => {
  const pool = [
    leg({ playerName: "A", gameId: "g1", team: "OKC", legScore: 1.5 }),
    leg({ playerName: "B", gameId: "g2", team: "DAL", legScore: 1.4 }),
  ];
  // Two distinct anchors → up to 2 slips. count=5 requested →
  // generator returns 2 with reason "below-target".
  const out = generateCustomParlaysFromPool(pool, { risk: "balanced", count: 5 }, sportShapeFixture);
  assert.ok(out.slips.length < 5,
    "Generator must NOT pad junk to hit the requested count");
  assert.equal(out.reason, "below-target");
});

// ---------------------------------------------------------------------------
// Output shape sanity
// ---------------------------------------------------------------------------

test("every generated slip carries combined odds + evaluation", () => {
  const pool = [
    leg({ playerName: "A", legScore: 1.5 }),
    leg({ playerName: "B", gameId: "g2", team: "DAL", legScore: 1.4 }),
  ];
  const out = generateCustomParlaysFromPool(pool, { risk: "balanced", count: 1 }, sportShapeFixture);
  const s = out.slips[0];
  assert.ok(s.slipId, "slipId is present");
  assert.equal(typeof s.combinedOdds, "number");
  assert.ok(s.evaluation, "evaluation present");
  assert.ok(typeof s.evaluation.combinedOdds === "number" || s.evaluation.combinedOdds === null);
});

// ---------------------------------------------------------------------------
// Reason copy
// ---------------------------------------------------------------------------

test("describeGeneratorReason returns honest copy for each reason", () => {
  assert.match(describeGeneratorReason("empty-pool", 0, 5), /pool/i);
  assert.match(describeGeneratorReason("no-legs-after-filters", 0, 5), /widening|filters/i);
  assert.match(describeGeneratorReason("below-target", 3, 5), /3.*5|fewer/i);
  assert.match(describeGeneratorReason("ok", 5, 5), /5.*custom/i);
});
