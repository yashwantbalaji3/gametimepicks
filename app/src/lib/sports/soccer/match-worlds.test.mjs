/**
 * Soccer coherent match worlds (SW-1, shadow). Run: cd app && npx tsx --test src/lib/sports/soccer/match-worlds.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { scoreMatrix } from "./dixon-coles.mjs";
import {
  MATCH_WORLDS_DEFAULTS, fnv1a32, assertGrid, worldSetIdentity, sampleWorlds, legPredicate, exactProbability,
  sampledProbability, mcStandardError, runsForTolerance, queryJoint, buildMatchWorlds, STANDARD_SINGLE_LEGS,
} from "./match-worlds.mjs";

const LAMBDAS = [[0.3, 0.2], [1.45, 1.1], [2.8, 0.6], [0.9, 3.4], [4.5, 4.2]];
const grid = (lh, la, rho = 0) => scoreMatrix(lh, la, rho).grid;

test("exact legs reproduce the score matrix's own published marginals to float precision", () => {
  for (const [lh, la] of LAMBDAS) for (const rho of [0, -0.08, 0.05]) {
    const m = scoreMatrix(lh, la, rho);
    const g = m.grid;
    assert.ok(Math.abs(exactProbability(g, [{ market: "result", side: "home" }]) - m.oneXTwo.home) < 1e-12);
    assert.ok(Math.abs(exactProbability(g, [{ market: "result", side: "draw" }]) - m.oneXTwo.draw) < 1e-12);
    assert.ok(Math.abs(exactProbability(g, [{ market: "result", side: "away" }]) - m.oneXTwo.away) < 1e-12);
    assert.ok(Math.abs(exactProbability(g, [{ market: "total", side: "over", line: 2.5 }]) - m.over25) < 1e-12);
    assert.ok(Math.abs(exactProbability(g, [{ market: "total", side: "under", line: 2.5 }]) - m.under25) < 1e-12);
  }
});

test("joint of complementary legs is zero; joint with a superset leg equals the narrower leg", () => {
  const g = grid(1.45, 1.1, -0.05);
  assert.equal(exactProbability(g, [{ market: "result", side: "home" }, { market: "result", side: "away" }]), 0);
  const home = exactProbability(g, [{ market: "result", side: "home" }]);
  const both = exactProbability(g, [{ market: "result", side: "home" }, { market: "doubleChance", side: "homeOrDraw" }]);
  assert.ok(Math.abs(home - both) < 1e-15);
  // home win AND over 2.5 is NOT the product of the marginals — the whole point of a joint
  const over = exactProbability(g, [{ market: "total", side: "over", line: 2.5 }]);
  const joint = exactProbability(g, [{ market: "result", side: "home" }, { market: "total", side: "over", line: 2.5 }]);
  assert.ok(Math.abs(joint - home * over) > 0.005, `joint ${joint} vs product ${home * over}`);
});

test("worlds are deterministic for a seed and differ across seeds", () => {
  const g = grid(1.45, 1.1, -0.05);
  const a = sampleWorlds(g, { runs: 2000, seed: 7 });
  const b = sampleWorlds(g, { runs: 2000, seed: 7 });
  const c = sampleWorlds(g, { runs: 2000, seed: 8 });
  assert.deepEqual([...a.home], [...b.home]);
  assert.deepEqual([...a.away], [...b.away]);
  assert.notDeepEqual([...a.home], [...c.home]);
});

test("every world is a coherent scoreline inside the grid, and only cells with mass are ever drawn", () => {
  const g = grid(0.3, 0.2, 0);
  g[3][3] = g[3][3] + g[10][10]; g[10][10] = 0; // a zero cell must never be sampled
  const w = sampleWorlds(g, { runs: 20_000, seed: 11 });
  for (let i = 0; i < w.runs; i++) {
    assert.ok(w.home[i] <= 10 && w.away[i] <= 10);
    assert.ok(g[w.home[i]][w.away[i]] > 0);
    // one world answers every market consistently: result, total and BTTS read off the same pair
    const x = w.home[i], y = w.away[i];
    assert.equal(legPredicate({ market: "result", side: "draw" })(x, y), x === y);
    assert.equal(legPredicate({ market: "btts", side: "yes" })(x, y) && legPredicate({ market: "total", side: "under", line: 1.5 })(x, y), false);
  }
});

test("10,000 worlds converge on the exact matrix: every standard share within 4 SE", () => {
  for (const [lh, la] of LAMBDAS) {
    const r = buildMatchWorlds({ eventId: `t:${lh}:${la}`, modelId: "soccer-dixon-coles-v2", lambdas: { home: lh, away: la }, rho: -0.05, grid: grid(lh, la, -0.05) });
    assert.equal(r.runs, 10_000);
    assert.ok(r.summary.convergence.withinNoise, `max |z| ${r.summary.convergence.maxAbsZ} at λ ${lh}/${la}`);
    assert.ok(r.summary.convergence.singlesWithinTolerance, "single-leg MC error ≤ 0.5 pp at 10,000 runs");
    const m = scoreMatrix(lh, la, -0.05).expectedGoals;
    assert.ok(Math.abs(r.summary.sampledMeanGoals.home - m.home) < 4 * Math.sqrt(lh / 10_000) + 1e-9);
  }
});

test("published probability is always the exact value, never the sampled one", () => {
  const g = grid(2.8, 0.6, 0);
  const w = sampleWorlds(g, { runs: 500, seed: 3 }); // deliberately few worlds: sampled ≠ exact
  const q = queryJoint({ grid: g, worlds: w, legs: [{ market: "result", side: "home" }, { market: "total", side: "over", line: 2.5 }] });
  assert.equal(q.basis, "ANALYTIC_MODEL");
  assert.equal(q.probability, exactProbability(g, [{ market: "result", side: "home" }, { market: "total", side: "over", line: 2.5 }]));
  assert.notEqual(q.probability, q.sampled.p);
  assert.equal(q.convergence.tolerance, MATCH_WORLDS_DEFAULTS.toleranceJoint);
  assert.equal(q.convergence.withinTolerance, false); // 500 runs cannot reach 0.3 pp
  assert.ok(q.convergence.requiredRuns > 500);
});

test("MC error arithmetic: 10,000 runs at p = 0.5 is 0.5 pp; 0.3 pp at p = 0.5 needs 27,778 runs", () => {
  assert.ok(Math.abs(mcStandardError(0.5, 10_000) - 0.005) < 1e-15);
  assert.equal(runsForTolerance(0.5, 0.003), 27_778);
  assert.equal(runsForTolerance(0, 0.003), 0);
});

test("world set identity names and seeds the set; any input change is a different set", () => {
  const base = { eventId: "soccer:laliga:1", modelId: "soccer-dixon-coles-v2", lambdas: { home: 1.3554, away: 0.6936 }, rho: 0.006952, runs: 10_000 };
  const id = worldSetIdentity(base);
  assert.equal(fnv1a32(id), fnv1a32(worldSetIdentity({ ...base })));
  assert.notEqual(id, worldSetIdentity({ ...base, rho: 0 }));
  assert.notEqual(id, worldSetIdentity({ ...base, runs: 5000 }));
  assert.throws(() => worldSetIdentity({ ...base, eventId: "" }), /required/);
  const g = scoreMatrix(1.3554, 0.6936, 0.006952).grid;
  const a = buildMatchWorlds({ ...base, grid: g });
  const b = buildMatchWorlds({ ...base, grid: g });
  assert.equal(a.worldSetId, b.worldSetId);
  assert.deepEqual(a.summary, b.summary);
});

test("refuses bad inputs instead of guessing", () => {
  const g = grid(1.2, 1.0);
  assert.throws(() => sampleWorlds(g, { runs: 100 }), /seed/);
  assert.throws(() => sampleWorlds(g, { runs: 0, seed: 1 }), /runs/);
  const unnormalised = g.map((row) => row.map((p) => p * 0.9));
  assert.throws(() => assertGrid(unnormalised), /not 1/);
  assert.throws(() => assertGrid([[0.5, 0.5]]), /square/);
  assert.throws(() => legPredicate({ market: "total", side: "over", line: 2 }), /unsupported/); // whole lines push; not modelled
  assert.throws(() => legPredicate({ market: "corners", side: "over", line: 9.5 }), /unsupported/);
  assert.throws(() => exactProbability(g, []), /at least one leg/);
});

test("standard legs are all scoreline-defined and well formed", () => {
  const g = grid(1.45, 1.1);
  for (const leg of STANDARD_SINGLE_LEGS) {
    const p = exactProbability(g, [leg]);
    assert.ok(p >= 0 && p <= 1, JSON.stringify(leg));
  }
  const w = sampleWorlds(g, { runs: 1000, seed: 1 });
  const s = sampledProbability(w, [{ market: "doubleChance", side: "homeOrAway" }]);
  const d = sampledProbability(w, [{ market: "result", side: "draw" }]);
  assert.equal(s.hits + d.hits, 1000);
});
