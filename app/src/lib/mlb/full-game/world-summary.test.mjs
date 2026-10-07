/**
 * WORLD SUMMARY — every game-level number comes from the same simulated games and reconciles.
 * Run: npx tsx --test src/lib/mlb/full-game/world-summary.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { headline, quantiles, reconcile, runLineAt, totalAtLine, totalHistogram } from "./world-summary.ts";
import { simulateGame } from "./engine.ts";
import { SeededRng } from "../../game-simulations/rng.ts";
import { ENGINE_LEVEL_CANDIDATE_V1, engineParamsFor } from "./engine-candidates.ts";
import { simulateFullGame } from "./simulate.ts";

const W = (pairs) => pairs.map(([away, home]) => ({ away, home }));

test("over/under/push are counted from the totals at the line, and push exists only on a whole line", () => {
  const worlds = W([[3, 5], [4, 4 + 1], [2, 6], [1, 0], [7, 2]]); // totals 8, 9, 8, 1, 9
  const whole = totalAtLine(worlds, 8);
  assert.deepEqual(whole.counts, { over: 2, under: 1, push: 2, worlds: 5 });
  assert.equal(whole.over + whole.under + whole.push, 1);
  const half = totalAtLine(worlds, 8.5);
  assert.deepEqual(half.counts, { over: 2, under: 3, push: 0, worlds: 5 });
});

test("over/under is NOT the sum of the two medians", () => {
  // Medians 4 and 4 → "8", yet most worlds go over 8.5 because the totals are skewed.
  const worlds = W([[4, 4], [4, 4], [0, 4], [4, 9], [9, 4], [4, 10], [10, 4]]);
  const q = quantiles(worlds.map((w) => w.away));
  const qh = quantiles(worlds.map((w) => w.home));
  assert.equal(q.p50 + qh.p50, 8);
  assert.ok(totalAtLine(worlds, 8.5).over > 0.5);
});

test("reconcile flags ties, negative and fractional runs", () => {
  assert.equal(reconcile(W([[1, 2], [3, 0]])).ok, true);
  assert.equal(reconcile(W([[2, 2]])).ok, false);
  assert.equal(reconcile(W([[-1, 2]])).ok, false);
  assert.equal(reconcile(W([[1.5, 2]])).ok, false);
});

test("run line is nested inside the winner and both sides read the same margins", () => {
  const worlds = W([[1, 2], [1, 3], [5, 1], [2, 1], [0, 6]]);
  const rl = runLineAt(worlds, 1.5);
  assert.equal(rl.homeCover, 0.4); // 1-3, 0-6
  assert.equal(rl.awayCover, 0.2); // 5-1
  assert.ok(rl.homeCover <= headline(worlds, null).homeWin);
});

test("the histogram keeps the tail in a top bin and sums to the world count", () => {
  const worlds = W([[10, 12], [1, 0], [3, 4]]);
  const h = totalHistogram(worlds, 20);
  assert.equal(h.reduce((s, b) => s + b.count, 0), 3);
  assert.equal(h[20].count, 1);
  assert.equal(h[20].label, "20+");
});

test("engine worlds reconcile and reproduce the library path for the same seed and parameters", () => {
  const bat = (i) => ({ playerId: i, name: `B${i}`, team: "X", expHits: 0.9, expTotalBases: 1.4, expHrr: null });
  const input = {
    gamePk: 1, date: "2026-10-07", slug: "x-vs-y", awayTeam: "X", homeTeam: "Y", awayTeamName: "X", homeTeamName: "Y",
    venue: null, firstPitch: "2026-10-07T20:00:00Z",
    awayLineup: Array.from({ length: 9 }, (_, i) => bat(i)), homeLineup: Array.from({ length: 9 }, (_, i) => bat(i + 9)),
    awayStarter: { playerId: 100, name: "P1", team: "X", expStrikeouts: 6 }, homeStarter: { playerId: 101, name: "P2", team: "Y", expStrikeouts: 5 },
    completeness: { level: "ready", notes: [], awayLineupSource: "confirmed", homeLineupSource: "confirmed", awayRatedCount: 9, homeRatedCount: 9, awayLineupCount: 9, homeLineupCount: 9, hasAwayStarter: true, hasHomeStarter: true, startedBeforeGeneration: false, missingFamilies: [] },
    market: null,
  };
  const params = engineParamsFor(ENGINE_LEVEL_CANDIDATE_V1);
  const n = 2000;
  const seed = `${input.date}|mlb-fullgame|${input.gamePk}|v|1`;
  const rng = new SeededRng(seed);
  const worlds = Array.from({ length: n }, () => {
    const r = simulateGame(input, rng, params);
    return { away: r.awayRuns, home: r.homeRuns };
  });
  assert.equal(reconcile(worlds).ok, true);
  const lib = simulateFullGame(input, { runCount: n, modelVersion: "v", simulationVersion: 1, generatedAt: "x", engine: params });
  const h = headline(worlds, null);
  assert.equal(lib.winProbability.home, Math.round(h.homeWin * 1000) / 1000);
  assert.equal(lib.runLine.find((r) => r.line === 1.5).homeCover, Math.round(runLineAt(worlds, 1.5).homeCover * 1000) / 1000);
  const t = totalAtLine(worlds, 8.5);
  assert.equal(t.counts.over + t.counts.under, n);
});
