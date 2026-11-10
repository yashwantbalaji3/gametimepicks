/**
 * The PUBLISHED Elo's validation block (grader-metrics.mjs → winner.elo.published, states.winnerElo). SYNTHETIC graded
 * games only, built through the real grader — no real outcome is read here.
 *
 * Run: cd app && npx tsx --test src/lib/sports/nba/grader-elo-published.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { validationMetrics, publishedEloMetrics, reliability, PREREG, MARKET_STATE } from "./grader-metrics.mjs";
import { gradeForecastGame, LABELS } from "./experimental-forecast.mjs";
import { mulberry32 } from "./bootstrap.mjs";

const REG = LABELS[2];
let seq = 0;
/** A forecast game in the artifact's real shape (SYNTHETIC), graded through the real grader. */
function graded({ eloP = 0.6, homeWins = true, preTip = true } = {}) {
  seq += 1;
  const game = {
    providerEventId: `synthetic-${seq}`, label: REG, dateUtc: "2030-01-11T00:00Z",
    home: { providerTeamId: "1" }, away: { providerTeamId: "2" },
    forecast: {
      inputAsOf: preTip ? "2030-01-10T12:00:00Z" : "2030-01-11T01:00:00Z",
      elo: { pHome: eloP },
      sim: { pHome: 0.5, tieMass: 0.05, home: { mean: 110 }, away: { mean: 106 }, margin: { mean: 4, p10: -12, p50: 4, p90: 20 }, total: { mean: 215, p10: 195, p50: 215, p90: 235 } },
      players: { home: [], away: [] },
    },
  };
  return gradeForecastGame(game, { ftHome: homeWins ? 110 : 100, ftAway: homeWins ? 100 : 110, source: "test" }, null);
}

/** n games at pHome p; the home side wins in (rate × 10) of every 10 consecutive games (rate a multiple of 0.1). */
const sample = (n, p, rate) => Array.from({ length: n }, (_, i) => graded({ eloP: p, homeWins: i % 10 < Math.round(rate * 10) }));

test("published Elo: the frozen official value on forward rows only (a game frozen after tip is not counted)", () => {
  const games = [graded({ eloP: 0.7, homeWins: true }), graded({ eloP: 0.4, homeWins: false }), graded({ eloP: 0.9, homeWins: false, preTip: false })];
  const pe = publishedEloMetrics(games);
  assert.equal(pe.n, 2);
  assert.equal(pe.meanPHome, 0.55);
  assert.equal(pe.realisedHomeRate, 0.5);
  assert.equal(pe.homeBias, 0.05);
  assert.equal(pe.brier, Number((((0.3) ** 2 + (0.4) ** 2) / 2).toFixed(4)));
  assert.equal(pe.logLoss, Number(((-Math.log(0.7) - Math.log(0.6)) / 2).toFixed(4)));
  assert.equal(pe.ece, reliability([{ p: 0.7, y: 1 }, { p: 0.4, y: 0 }]).ece);
  assert.equal(pe.eceBins, PREREG.eceBins);
});

test("published Elo: game-clustered intervals bracket the point estimates and are deterministic", () => {
  const rnd = mulberry32(11);
  const games = Array.from({ length: 200 }, () => { const p = 0.3 + 0.5 * rnd(); return graded({ eloP: Number(p.toFixed(4)), homeWins: rnd() < p - 0.15 }); });
  const a = publishedEloMetrics(games), b = publishedEloMetrics(games);
  assert.deepEqual(a, b);
  for (const k of ["logLoss", "brier", "ece", "homeBias"]) {
    const [lo, hi] = a.ci95[k];
    assert.ok(lo <= a[k] && a[k] <= hi, `${k}: ${lo} ≤ ${a[k]} ≤ ${hi}`);
    assert.ok(lo < hi, `${k} has width`);
  }
  assert.ok(a.homeBias > 0 && a.ci95.homeBias[0] > 0, "a planted +0.15 home over-favour shows as an interval above 0");
  assert.deepEqual(a.bootstrap, { method: "game-clustered percentile bootstrap (one cluster per game)", B: 2000, seed: 20261020, alpha: 0.05 });
});

test("states.winnerElo: §7's winner bars verbatim — HOLD below n 300, BARS_HOLD when calibrated, BARS_FAIL when not", () => {
  const small = validationMetrics(sample(120, 0.6, 0.6));
  assert.equal(small.states.winnerElo.state, MARKET_STATE.HOLD);
  assert.equal(small.states.winnerElo.minN, PREREG.winner.minN);
  const ok = validationMetrics(sample(300, 0.6, 0.6));
  assert.equal(ok.states.winnerElo.n, 300);
  assert.deepEqual(ok.states.winnerElo.bars, { logLossVsCoin: true, ece: true, brier: true });
  assert.equal(ok.states.winnerElo.state, MARKET_STATE.BARS_HOLD);
  // p 0.65 against a 60% home rate: Brier 0.2425 fails the ≤ 0.240 bar
  const fail = validationMetrics(sample(300, 0.65, 0.6));
  assert.equal(fail.states.winnerElo.bars.brier, false);
  assert.equal(fail.states.winnerElo.state, MARKET_STATE.BARS_FAIL);
});

test("states.winnerElo: §10's early ECE rule applies as for the sim head (ECE > 0.08 at n ≥ 150)", () => {
  const m = validationMetrics(sample(150, 0.7, 0.5));
  assert.ok(m.winner.elo.published.ece > 0.08);
  assert.equal(m.states.winnerElo.state, MARKET_STATE.REJECT_EARLY_ECE);
  const below = validationMetrics(sample(149, 0.7, 0.5));
  assert.equal(below.states.winnerElo.state, MARKET_STATE.HOLD);
});

test("the existing sim winner block and state are untouched by the published-Elo block", () => {
  const m = validationMetrics(sample(300, 0.6, 0.6));
  assert.deepEqual(Object.keys(m.states.winner.bars), ["logLossVsElo", "logLossVsCoin", "ece", "brier"]);
  assert.equal(m.winner.sim.published, undefined);
  assert.ok(m.winner.elo.published && m.winner.elo.n === 300);
});
