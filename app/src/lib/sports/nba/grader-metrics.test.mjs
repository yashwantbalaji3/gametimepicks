/**
 * NBA shadow validation metrics (Session 10 · G5). Synthetic graded games only — the forward ledger has no
 * graded regular-season game yet, and a test must not depend on one existing.
 *
 * Run: cd app && npx tsx --test src/lib/sports/nba/grader-metrics.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { reliability, validationMetrics, validationByLabel, PREREG, MARKET_STATE } from "./grader-metrics.mjs";
import { gradeForecastGame, LABELS } from "./experimental-forecast.mjs";

const REG = LABELS[2];
const PRE = LABELS[1];
let seq = 0;
/** A forecast game in the artifact's real shape, graded through the REAL grader. */
function graded({ pHome = 0.6, ftHome = 110, ftAway = 100, margin = { mean: 4, p10: -12, p50: 4, p90: 20 }, total = { mean: 215, p10: 195, p50: 215, p90: 235 }, label = REG, inputAsOf = "2030-01-10T12:00:00Z", dateUtc = "2030-01-11T00:00Z", overtime } = {}) {
  seq += 1;
  const game = {
    providerEventId: String(seq), label, dateUtc,
    home: { providerTeamId: "1" }, away: { providerTeamId: "2" },
    forecast: { inputAsOf, elo: { pHome: 0.55 }, sim: { pHome, tieMass: 0.05, home: { mean: 110 }, away: { mean: 106 }, margin, total }, players: { home: [], away: [] } },
  };
  return gradeForecastGame(game, { ftHome, ftAway, source: "test", overtime }, null);
}

test("the preregistered constants are the document's numbers (a drift in either fails here)", () => {
  const doc = fs.readFileSync(path.resolve(process.cwd(), "..", PREREG.doc), "utf8");
  // Literal substrings of the frozen document (markdown escapes its table pipes as \|).
  for (const needle of ["n ≥ 300", "sim Brier ≤ 0.240", "ECE ≤ 0.05", "margin MAE ≤ 12.5", "p10–p90 coverage ∈ [0.76, 0.84]", "\\|bias\\| ≤ 1.0", "total MAE ≤ 16.0", "\\|bias\\| ≤ 2.0", "n ≥ 1,500", "minutes MAE ≤ 6.0", "n ≥ 800", "coverage ∈ [0.74, 0.86]", "ECE > 0.08 at any n ≥ 150", "10 equal-width bins", "Elo log loss + 0.005", "coin − 0.010"]) {
    assert.ok(doc.includes(needle), `preregistration must still say "${needle}"`);
  }
  assert.equal(PREREG.winner.minN, 300); assert.equal(PREREG.winner.brierMax, 0.240); assert.equal(PREREG.winner.eceMax, 0.05);
  assert.deepEqual(PREREG.margin.coverage, [0.76, 0.84]); assert.equal(PREREG.margin.maeMax, 12.5); assert.equal(PREREG.total.maeMax, 16.0);
  assert.equal(PREREG.player.pts.minN, 1500); assert.equal(PREREG.player.threePm.minN, 800); assert.deepEqual(PREREG.player.threePm.coverage, [0.74, 0.86]);
});

test("reliability: 10 equal-width bins, ECE is the n-weighted |predicted − actual|", () => {
  const pairs = [...Array(10)].map(() => ({ p: 0.15, y: 0 })).concat([...Array(10)].map((_, i) => ({ p: 0.85, y: i < 9 ? 1 : 0 })));
  const r = reliability(pairs);
  assert.equal(r.n, 20);
  assert.deepEqual(r.table.map((b) => [b.bin, b.n, b.predicted, b.actual]), [["0.1–0.2", 10, 0.15, 0], ["0.8–0.9", 10, 0.85, 0.9]]);
  assert.equal(r.ece, 0.1); // 0.5·0.15 + 0.5·0.05
  assert.equal(reliability([{ p: 1, y: 1 }]).table[0].bin, "0.9–1.0", "p = 1 lands in the top bin, not an 11th");
});

test("interval coverage is recorded per game and aggregated; a game with no stored interval is NOT a miss", () => {
  const m = validationMetrics([graded({ ftHome: 110, ftAway: 100 }), graded({ ftHome: 140, ftAway: 100 }), graded({ margin: { mean: 4 } })]);
  assert.equal(m.margin.coverage80N, 2, "the interval-less game is excluded from the denominator");
  assert.equal(m.margin.coverage80, 0.5);
  assert.equal(m.margin.intervalNotRecorded, 1);
  assert.equal(m.margin.coverage50, null);
  assert.match(m.margin.coverage50Reason, /NOT_RECORDED/);
});

test("overtime: a final with no overtime fact is NOT_MEASURED, never counted as 'no overtime'", () => {
  const m = validationMetrics([graded({ overtime: true }), graded({ overtime: false }), graded({})]);
  assert.equal(m.overtime.n, 2);
  assert.equal(m.overtime.notMeasured, 1);
  assert.equal(m.overtime.actualRate, 0.5);
});

test("baselines: coin and the (labelled, in-sample) home rate are reported beside the model", () => {
  const m = validationMetrics([graded({ ftHome: 110, ftAway: 100 }), graded({ ftHome: 90, ftAway: 100 })]);
  assert.equal(m.winner.baselines.coin.logLoss, 0.6931);
  assert.equal(m.winner.baselines.homeRate.rate, 0.5);
  assert.equal(m.winner.baselines.homeRate.inSample, true);
  assert.equal(m.winner.baselines.market.state, "NO_AUTHORIZED_PRICE");
  assert.ok(m.winner.sim.reliability.length > 0 && m.winner.elo.ece != null, "both heads get ECE and a reliability table");
});

test("§6 · below the minimum n every market is HOLD regardless of its numbers", () => {
  const m = validationMetrics([...Array(50)].map(() => graded({})));
  for (const k of ["winner", "margin", "total", "pts", "reb", "ast", "threePm", "pra"]) assert.equal(m.states[k].state, MARKET_STATE.HOLD, k);
});

/** 300 well-calibrated games: p = 0.6, home wins 60%, margins inside p10–p90 80% of the time. */
function goodSample() {
  return [...Array(300)].map((_, i) => graded({
    pHome: 0.6,
    ftHome: i % 10 < 6 ? 110 : 100, ftAway: i % 10 < 6 ? 100 : 110,
    margin: i % 10 < 8 ? { mean: 0, p10: -12, p50: 0, p90: 12 } : { mean: 0, p10: 30, p50: 35, p90: 40 },
    total: i % 10 < 8 ? { mean: 210, p10: 190, p50: 210, p90: 230 } : { mean: 300, p10: 290, p50: 300, p90: 310 },
  }));
}

test("§7 · at n ≥ 300 the winner bars are evaluated; a bar failure is BARS_FAIL, not HOLD", () => {
  const ok = validationMetrics(goodSample());
  assert.equal(ok.states.winner.n, 300);
  assert.equal(ok.states.winner.bars.ece, true);
  assert.equal(ok.margin.coverage80, 0.8);
  assert.equal(ok.states.margin.bars.coverage, true);
  // Brier at p=0.6 / 60% hit = 0.24 → passes ≤ 0.240; log loss 0.673 vs coin 0.693 − 0.010 → passes.
  assert.equal(ok.states.winner.bars.brier, true);
  // over-confident model: p = 0.95 with the same 60% outcome rate fails Brier and ECE
  const bad = validationMetrics(goodSample().map((g) => ({ ...g, winner: { ...g.winner, sim: { ...g.winner.sim, p: 0.95 } } })));
  assert.equal(bad.states.winner.state, MARKET_STATE.REJECT_EARLY_ECE, "ECE 0.35 at n ≥ 150 is the §10 early reject");
});

test("§8/§10 · ONE graded game forecast after tip holds every market, even at full n", () => {
  const games = goodSample();
  games.push(graded({ inputAsOf: "2030-01-11T00:30:00Z", dateUtc: "2030-01-11T00:00Z" }));
  const m = validationMetrics(games);
  assert.equal(m.timing.notPreTip, 1);
  assert.equal(m.states.winner.state, MARKET_STATE.HOLD);
  assert.equal(m.states.margin.state, MARKET_STATE.HOLD);
});

test("player families: only expectedMinutes ≥ 20 rows count, 3PM also needs rate ≥ 0.05/min; missing intervals are not misses", () => {
  const row = (em, rate3, inside) => ({ expectedMinutes: em, minutesAbsErr: 3, rates: { pts: 0.5, reb: 0.2, ast: 0.1, threePm: rate3 }, conditional: { pts: 2, reb: 1, ast: 1, threePm: 1 }, unconditional: { pts: 3, reb: 1, ast: 1, threePm: 1 }, inside80: { pts: inside, reb: inside, ast: inside, threePm: inside }, atOrAboveMedian: { pts: 1, reb: 0, ast: 1, threePm: 0 } });
  const g = { ...graded({}), players: { rows: [row(30, 0.08, 1), row(25, 0.02, 0), row(12, 0.1, 1), row(22, 0.06, null)], predictedButDnp: [], predictedButAbsent: [], playedButUnpredicted: [] } };
  const m = validationMetrics([g]);
  assert.equal(m.players.families.pts.n, 3, "the 12-minute row is out");
  assert.equal(m.players.families.pts.coverage80N, 2, "the null-interval row is not a miss");
  assert.equal(m.players.families.pts.coverage80, 0.5);
  assert.equal(m.players.families.threePm.n, 2, "3PM also drops the 0.02/min row");
  assert.equal(m.players.families.pts.medianEce, null);
});

test("validationByLabel · preseason and regular are never pooled; an event counts once", () => {
  const a = graded({}); const b = graded({ label: PRE });
  const v = validationByLabel([{ games: [a, b] }, { games: [a] }], { computedAt: "2030-01-12T00:00:00Z" });
  assert.deepEqual(Object.keys(v.byLabel).sort(), [PRE, REG].sort());
  assert.equal(v.byLabel[REG].games, 1);
  assert.equal(v.byLabel[PRE].games, 1);
});
