/**
 * MLB-002 research · challenger mlb-pa-matchup-v1 (docs/research/mlb/mlb-002/matchup-v1/PREREGISTRATION.md).
 * The matchup PA model is opt-in research: it must leave the published engine byte-identical, and behave as log5 says.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/matchup.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SeededRng } from "../../game-simulations/rng.ts";
import { DEFAULT_ENGINE_PARAMS, simulateGame } from "./engine.ts";
import { buildMatchupPaOutcome, log5 } from "./plate-appearance.ts";

const ML = { k: 0.222, bb: 0.083, hr: 0.031, hbp: 0.011 };
const close = (a, b, eps = 1e-12) => Math.abs(a - b) < eps;

test("log5: league meets league is league; a league pitcher leaves the batter's rate; symmetric", () => {
  assert.ok(close(log5(0.2, 0.2, 0.2), 0.2));
  assert.ok(close(log5(0.31, 0.222, 0.222), 0.31, 1e-9));
  assert.ok(close(log5(0.15, 0.3, 0.22), log5(0.3, 0.15, 0.22)));
  // A strikeout-prone batter against a strikeout pitcher strikes out more than either alone.
  assert.ok(log5(0.3, 0.3, 0.22) > 0.3);
});

test("matchup PA: probabilities are a distribution; a tougher pitcher means fewer walks and homers, more Ks", () => {
  const base = { expHits: 1.0, expTotalBases: 1.6, slotPa: 4.35, matchupLeague: ML };
  const avg = buildMatchupPaOutcome({ ...base, batter: ML, pitcher: ML });
  const ace = buildMatchupPaOutcome({ ...base, batter: ML, pitcher: { k: 0.32, bb: 0.05, hr: 0.02 } });
  for (const p of [avg, ace]) {
    const sum = Object.values(p).reduce((s, x) => s + x, 0);
    assert.ok(close(sum, 1, 1e-9));
    assert.ok(Object.values(p).every((x) => x >= 0));
  }
  assert.ok(ace.strikeout > avg.strikeout);
  assert.ok(ace.walk < avg.walk);
  assert.ok(ace.homeRun < avg.homeRun);
  // Walks include HBP; at league rates the walk mass is league BB + HBP (before normalisation, which is ~1 here).
  assert.ok(Math.abs(avg.walk - (ML.bb + ML.hbp)) < 0.01);
});

test("slot-aware PA: the same per-game projection is a higher per-PA rate in a slot with fewer PA", () => {
  const p = (slotPa) => buildMatchupPaOutcome({ expHits: 1.0, expTotalBases: 1.6, slotPa, batter: ML, pitcher: ML, matchupLeague: ML });
  const leadoff = p(4.65);
  const ninth = p(3.75);
  const bip = (x) => x.single + x.double + x.triple;
  assert.ok(bip(ninth) > bip(leadoff));
});

test("opt-in only: no `matchup` params ⇒ the published engine, even when inputs carry matchup rates", () => {
  const bat = (id, t) => ({ playerId: id, name: "b", team: t, expHits: 0.95, expTotalBases: 1.5, expHrr: null });
  const withRates = (b) => ({ ...b, matchup: { slotPa: 4.35, vsStarter: { k: 0.3, bb: 0.12, hr: 0.05 }, vsBullpen: { k: 0.3, bb: 0.12, hr: 0.05 } } });
  const g = (rates) => ({
    gamePk: 1, date: "2026-08-01",
    awayLineup: Array.from({ length: 9 }, (_, i) => (rates ? withRates(bat(i, "A")) : bat(i, "A"))),
    homeLineup: Array.from({ length: 9 }, (_, i) => (rates ? withRates(bat(100 + i, "H")) : bat(100 + i, "H"))),
    awayStarter: { playerId: 1, name: "p", team: "A", expStrikeouts: 5.2, ...(rates ? { matchup: { k: 0.3, bb: 0.05, hr: 0.02 } } : {}) },
    homeStarter: { playerId: 2, name: "p", team: "H", expStrikeouts: 5.2 },
    completeness: { level: "ready" },
  });
  for (let i = 0; i < 200; i += 1) {
    assert.deepEqual(simulateGame(g(true), new SeededRng(`m|${i}`), DEFAULT_ENGINE_PARAMS), simulateGame(g(false), new SeededRng(`m|${i}`), DEFAULT_ENGINE_PARAMS));
  }
  // With the research switch on, the same inputs produce a different game stream (the model is actually used).
  const on = { ...DEFAULT_ENGINE_PARAMS, matchup: { league: ML } };
  let differ = 0;
  for (let i = 0; i < 50; i += 1) if (JSON.stringify(simulateGame(g(true), new SeededRng(`m|${i}`), on)) !== JSON.stringify(simulateGame(g(false), new SeededRng(`m|${i}`), DEFAULT_ENGINE_PARAMS))) differ += 1;
  assert.ok(differ > 40);
});
