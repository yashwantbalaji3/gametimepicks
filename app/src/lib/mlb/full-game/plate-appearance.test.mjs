/**
 * PLATE-APPEARANCE MODEL TESTS (Sprint 008). Proves the PA distribution is a valid categorical (sums to 1,
 * non-negative) AND that it REPRODUCES the board projections it was derived from: expected hits over a
 * nominal game ≈ batter_hits projection, and expected total bases ≈ batter_total_bases projection. That
 * construction is what makes player props fall out of the same simulated universe as the game.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/plate-appearance.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  LEAGUE,
  buildPaOutcome,
  hitTypeSplit,
  pitcherStrikeoutRate,
  samplePaOutcome,
  PA_OUTCOME_ORDER,
} from "./plate-appearance.ts";

const sum = (p) => PA_OUTCOME_ORDER.reduce((s, k) => s + p[k], 0);
const expBases = (p) => p.single + 2 * p.double + 3 * p.triple + 4 * p.homeRun;

test("PA distribution is a valid categorical (non-negative, sums to 1)", () => {
  for (const expHits of [0.6, 1.02, 1.4, null]) {
    for (const expTotalBases of [0.9, 1.54, 2.6, null]) {
      const p = buildPaOutcome({ expHits, expTotalBases, pitcherKRate: 0.21 });
      for (const k of PA_OUTCOME_ORDER) assert.ok(p[k] >= 0, `${k} non-negative`);
      assert.ok(Math.abs(sum(p) - 1) < 1e-9, "sums to 1");
    }
  }
});

test("expected hits over a nominal game reproduces the batter_hits projection", () => {
  // Chourio: E[hits]=1.02. Per-PA hit prob × PA_PER_GAME should recover ~1.02.
  const p = buildPaOutcome({ expHits: 1.02, expTotalBases: 1.54, pitcherKRate: 0.21 });
  const perPaHit = p.single + p.double + p.triple + p.homeRun;
  const gameHits = perPaHit * LEAGUE.PA_PER_GAME;
  assert.ok(Math.abs(gameHits - 1.02) < 0.06, `game hits ${gameHits.toFixed(3)} ≈ 1.02`);
});

test("expected total bases over a nominal game reproduces the batter_total_bases projection", () => {
  const p = buildPaOutcome({ expHits: 1.02, expTotalBases: 1.54, pitcherKRate: 0.21 });
  const gameTb = expBases(p) * LEAGUE.PA_PER_GAME;
  assert.ok(Math.abs(gameTb - 1.54) < 0.08, `game TB ${gameTb.toFixed(3)} ≈ 1.54`);
});

test("hitTypeSplit reproduces the target bases-per-hit and sums to 1", () => {
  for (const r of [1.2, 1.5, 1.6, 1.9, 2.2]) {
    const s = hitTypeSplit(r);
    const total = s.single + s.double + s.triple + s.homeRun;
    assert.ok(Math.abs(total - 1) < 1e-9, "hit-type fractions sum to 1");
    const bases = s.single + 2 * s.double + 3 * s.triple + 4 * s.homeRun;
    assert.ok(Math.abs(bases - r) < 0.02, `bases/hit ${bases.toFixed(3)} ≈ ${r}`);
    for (const k of ["single", "double", "triple", "homeRun"]) assert.ok(s[k] >= 0, `${k} ≥ 0`);
  }
});

test("pitcher strikeout rate: starter derived from projection, bullpen is the league prior", () => {
  // Drohan E[K]=4.83 over 23 BF → ~0.21.
  const starter = pitcherStrikeoutRate(4.83, true);
  assert.ok(Math.abs(starter - 4.83 / LEAGUE.STARTER_BATTERS_FACED) < 1e-9);
  assert.ok(starter > 0.18 && starter < 0.24);
  assert.equal(pitcherStrikeoutRate(4.83, false), LEAGUE.BULLPEN_K_RATE);
  // A high-K ace clamps at the ceiling; null → league starter rate.
  assert.equal(pitcherStrikeoutRate(20, true), LEAGUE.MAX_K_RATE);
  assert.ok(pitcherStrikeoutRate(null, true) > 0.18);
});

test("higher pitcher K rate raises P(strikeout) and lowers field outs, hits unchanged in expectation", () => {
  const lowK = buildPaOutcome({ expHits: 1.0, expTotalBases: 1.5, pitcherKRate: 0.12 });
  const highK = buildPaOutcome({ expHits: 1.0, expTotalBases: 1.5, pitcherKRate: 0.32 });
  assert.ok(highK.strikeout > lowK.strikeout, "more Ks vs a high-K pitcher");
  // Hit mass is anchored to the projection, so it barely moves; the K comes out of field outs.
  const hitLow = lowK.single + lowK.double + lowK.triple + lowK.homeRun;
  const hitHigh = highK.single + highK.double + highK.triple + highK.homeRun;
  assert.ok(Math.abs(hitLow - hitHigh) < 0.02, "hit mass stays anchored to the projection");
});

test("samplePaOutcome partitions [0,1) into the outcome buckets in order", () => {
  const p = buildPaOutcome({ expHits: 1.0, expTotalBases: 1.6, pitcherKRate: 0.22 });
  assert.equal(samplePaOutcome(p, 0), "strikeout");
  assert.equal(samplePaOutcome(p, 0.999999), "fieldOut");
  // Monte-Carlo the sampler and confirm empirical frequencies match the probs.
  const counts = Object.fromEntries(PA_OUTCOME_ORDER.map((k) => [k, 0]));
  const N = 200000;
  for (let i = 0; i < N; i += 1) counts[samplePaOutcome(p, (i + 0.5) / N)] += 1;
  for (const k of PA_OUTCOME_ORDER) {
    assert.ok(Math.abs(counts[k] / N - p[k]) < 0.01, `empirical ${k} ≈ prob`);
  }
});
