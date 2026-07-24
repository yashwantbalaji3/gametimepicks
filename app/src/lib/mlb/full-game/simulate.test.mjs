/**
 * FULL-GAME ARTIFACT TESTS (Sprint 008 · Phase 4/10). Proves the aggregated artifact is internally
 * consistent: probabilities conserve, total = away + home, percentiles order, run-line/team-total
 * probabilities recompute from the stored distributions, no unsupported field is a number, completeness
 * survives, and the artifact hash is reproducible.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/simulate.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { simulateFullGame } from "./simulate.ts";

const lineup = (base, team, eh = 0.9, etb = 1.45) =>
  Array.from({ length: 9 }, (_, i) => ({ playerId: base + i, name: `B${base + i}`, team, expHits: eh, expTotalBases: etb, expHrr: eh * 2.2 }));

const input = (over = {}) => ({
  gamePk: 999001,
  date: "2026-07-24",
  slug: "aaa-vs-bbb-2026-07-24",
  awayTeam: "AAA",
  homeTeam: "BBB",
  awayTeamName: "A team",
  homeTeamName: "B team",
  venue: "Test Park",
  firstPitch: "2026-07-24T20:00:00Z",
  awayLineup: lineup(100, "AAA"),
  homeLineup: lineup(200, "BBB"),
  awayStarter: { playerId: 1, name: "Ace A", team: "AAA", expStrikeouts: 5 },
  homeStarter: { playerId: 2, name: "Ace B", team: "BBB", expStrikeouts: 5 },
  completeness: { level: "ready", notes: [], awayLineupCount: 9, homeLineupCount: 9, hasAwayStarter: true, hasHomeStarter: true, missingFamilies: [] },
  market: null,
  ...over,
});
const opts = { runCount: 4000, modelVersion: "mlb-fg-test", simulationVersion: 1, generatedAt: "2026-07-24T16:00:00Z" };

test("win probabilities conserve (away + home = 1)", () => {
  const g = simulateFullGame(input(), opts);
  assert.equal(g.status, "ready");
  assert.ok(Math.abs(g.winProbability.away + g.winProbability.home - 1) < 0.002);
});

test("total runs mean equals away mean + home mean", () => {
  const g = simulateFullGame(input(), opts);
  assert.ok(Math.abs(g.totalRuns.mean - (g.runs.away.mean + g.runs.home.mean)) < 0.05);
});

test("percentiles order: p10 ≤ median ≤ p90 for every distribution", () => {
  const g = simulateFullGame(input(), opts);
  for (const d of [g.runs.away, g.runs.home, g.totalRuns, g.runDifferential]) {
    assert.ok(d.p10 <= d.median && d.median <= d.p90, `p10 ${d.p10} ≤ med ${d.median} ≤ p90 ${d.p90}`);
  }
});

test("stored distributions are valid histograms (probabilities sum to 1)", () => {
  const g = simulateFullGame(input(), opts);
  for (const dist of [g.totalRuns.distribution, g.runDifferential.distribution]) {
    const s = dist.reduce((a, b) => a + b.probability, 0);
    assert.ok(Math.abs(s - 1) < 0.005, `hist sums to 1 (got ${s.toFixed(4)})`);
    for (const b of dist) assert.ok(b.probability >= 0 && b.count >= 0);
  }
});

test("run-line homeCover recomputes from the run-differential distribution", () => {
  const g = simulateFullGame(input(), opts);
  const rl15 = g.runLine.find((r) => r.line === 1.5);
  // P(home wins by > 1.5) = sum of run-diff mass at values ≥ 2.
  const recomputed = g.runDifferential.distribution.filter((b) => b.value >= 2).reduce((a, b) => a + b.probability, 0);
  assert.ok(Math.abs(rl15.homeCover - recomputed) < 0.02, `run-line ${rl15.homeCover} ≈ recomputed ${recomputed.toFixed(3)}`);
  assert.ok(rl15.homeCover <= g.winProbability.home + 0.01, "covering by 2+ is rarer than simply winning");
});

test("team totals + final scores are well-formed probabilities", () => {
  const g = simulateFullGame(input(), opts);
  for (const t of [...g.teamTotals.away, ...g.teamTotals.home]) {
    assert.ok(Math.abs(t.over + t.under - 1) < 0.005, "over + under = 1");
  }
  let prev = 1;
  for (const s of g.finalScores) {
    assert.ok(s.probability > 0 && s.probability <= prev, "final scores sorted descending");
    prev = s.probability;
    assert.ok(Number.isInteger(s.away) && Number.isInteger(s.home) && s.away !== s.home, "no tied final score");
  }
});

test("simulated box score comes from the same universe (18 batters, ≤2 starters, extras in [0,1])", () => {
  const g = simulateFullGame(input(), opts);
  assert.equal(g.players.batters.length, 18);
  assert.ok(g.players.pitchers.length <= 2);
  assert.ok(g.extraInningsProbability >= 0 && g.extraInningsProbability <= 1);
  // Every batter's simulated total bases ≥ hits (a coherence check on the box score).
  for (const b of g.players.batters) assert.ok(b.totalBases >= b.hits - 0.01, "TB ≥ hits");
});

test("artifact hash is reproducible and independent of generatedAt", () => {
  const g1 = simulateFullGame(input(), opts);
  const g2 = simulateFullGame(input(), { ...opts, generatedAt: "2099-01-01T00:00:00Z" });
  assert.equal(g1.artifactHash, g2.artifactHash, "hash excludes generatedAt");
  assert.deepEqual(g1, g2, "same board + model → byte-identical game");
});

test("an unavailable game produces no fabricated numbers", () => {
  const g = simulateFullGame(
    input({ completeness: { level: "unavailable", notes: ["too few batters"], awayLineupCount: 2, homeLineupCount: 9, hasAwayStarter: true, hasHomeStarter: true, missingFamilies: [] } }),
    opts,
  );
  assert.equal(g.status, "unavailable");
  assert.equal(g.runCount, 0);
  assert.equal(g.winProbability, null);
  assert.equal(g.runs, null);
  assert.equal(g.totalRuns, null);
  assert.equal(g.players, null);
  assert.deepEqual(g.runLine, []);
});

test("completeness (degraded lineup padding) survives into the artifact", () => {
  const g = simulateFullGame(
    input({ completeness: { level: "degraded", notes: ["AAA lineup padded: 7/9"], awayLineupCount: 7, homeLineupCount: 9, hasAwayStarter: true, hasHomeStarter: true, missingFamilies: ["confirmed_batting_order"] } }),
    opts,
  );
  assert.equal(g.status, "degraded");
  assert.match(g.completeness.notes[0], /padded/);
  assert.ok(g.completeness.missingFamilies.includes("confirmed_batting_order"));
});
