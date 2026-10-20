/**
 * Grader-v2 metrics (RMSE, bias, accuracy, slices, OT head) and daily diagnostics (SYNTHETIC fixtures, clearly marked).
 * Run (from app/): npx tsx --test src/lib/sports/nba/model-diagnostics.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { validationMetrics, validationFromGrades, errorStats, MINUTES_BANDS } from "./grader-metrics.mjs";
import { buildDiagnostics, systematicFindings, proposeCandidates, diagnosticsMarkdown, wilson, coverageInterval } from "./model-diagnostics.mjs";
import { paceFromBoxscore } from "./experimental-forecast.mjs";
import { FIXTURE_NOTE, graded, predPlayer, boxDoc, boxRow, forecastGame, HOME, AWAY, REG, PRE } from "./__fixtures__/nba-grading-fixtures.mjs";

test("fixtures are labelled synthetic", () => assert.match(FIXTURE_NOTE, /SYNTHETIC/));

test("errorStats: MAE, RMSE and bias (forecast − actual) with n", () => {
  const s = errorStats([2, -2, 4]);
  assert.deepEqual([s.n, s.mae, s.rmse, s.bias], [3, 2.6667, 2.8284, 1.3333]);
  assert.deepEqual(errorStats([]), { n: 0, mae: null, rmse: null, bias: null, biasN: 0 });
});

/** One game with players p1 (starter, 30 min expected) and p2 (bench, 15 expected, Day-To-Day) on the home side. */
function playerGame(id, { p1 = {}, p2 = {}, final = [110, 100], dnpP2 = false, ...over } = {}) {
  const box = boxDoc(id, {
    homeRows: [boxRow("p1", HOME, { minutes: 34, pts: 20, starter: true, ...p1 }), dnpP2 ? boxRow("p2", HOME, { didNotPlay: true, minutes: null, pts: null, reb: null, ast: null, threePm: null, dnpReason: "COACH'S DECISION" }) : boxRow("p2", HOME, { minutes: 10, pts: 4, starter: false, ...p2 }), boxRow("u9", HOME, { minutes: 22, pts: 9, starter: false })],
    awayRows: [boxRow("q1", AWAY)],
  });
  return graded(id, { final, box, home: [predPlayer("p1", { em: 30, pts: 18 }), predPlayer("p2", { em: 15, pts: 6, injuryStatus: "Day-To-Day" })], ...over });
}

test("grade rows carry signed errors, availability and combos; player metrics report RMSE + bias beside MAE, n everywhere", () => {
  const g = playerGame("m1");
  const r = g.players.rows.find((x) => x.providerAthleteId === "p1");
  assert.equal(r.minutesErr, -4, "expected 30 − actual 34");
  assert.equal(r.signed.pts, -2);
  assert.equal(r.combos.pra.actual, 20 + 6 + 4);
  assert.deepEqual(g.players.playedButUnpredicted.filter((x) => x.side === "home").map((x) => x.providerAthleteId), ["u9"]);
  const m = validationMetrics([g, playerGame("m2", { p1: { pts: 14 } })]);
  assert.equal(m.players.minutes.n, 4);
  assert.ok(Number.isFinite(m.players.minutes.rmse) && m.players.minutes.rmse >= m.players.minutes.mae);
  assert.equal(m.players.allRows.pts.unconditional.n, 4);
  assert.ok(Number.isFinite(m.players.allRows.pts.unconditional.rmse));
  assert.equal(m.players.allRows.pra.coverage80.n, 4);
  assert.equal(m.winner.sim.n, 2); assert.equal(m.winner.sim.accuracy, 1);
  assert.ok(Number.isFinite(m.margin.rmse));
});

test("slices: expected-minutes bands, injury status, home/away, starter, rest (§9) and availability misses — each with n", () => {
  const g1 = { ...playerGame("s1"), context: { restDays: { home: 0, away: 2 } } };
  const g2 = { ...playerGame("s2", { dnpP2: true }), context: { restDays: { home: 1, away: 1 } } };
  const s = validationMetrics([g1, g2]).slices;
  assert.deepEqual(MINUTES_BANDS.map((b) => b.key), ["<10", "10-20", "≥20"]);
  assert.equal(s.players.expectedMinutes["≥20"].n, 2);
  assert.equal(s.players.expectedMinutes["10-20"].n, 1);
  assert.equal(s.players.injuryStatus["Day-To-Day"].n, 1);
  assert.equal(s.players.rest["0 (back-to-back)"].n, 2);
  assert.equal(s.players.rest["1"].n, 1);
  assert.equal(s.players.starter.started.n, 2);
  assert.deepEqual(s.availabilityMisses["Day-To-Day"], { predicted: 2, played: 1, predictedButDnp: 1, predictedButAbsent: 0, missRate: 0.5 });
  assert.equal(s.games.backToBack["home back-to-back"].n, 1);
  assert.equal(s.games.backToBack.neither.n, 1);
});

test("pace: possessions from the box score (FGA + 0.44·FTA − OREB + TOV), null when an input is missing — never zero", () => {
  const game = forecastGame("pc");
  const doc = boxDoc("pc", { homeRows: [boxRow("a", HOME, { fga: 80, fta: 20, oreb: 10, tov: 14 })], awayRows: [boxRow("b", AWAY, { fga: 90, fta: 25, oreb: 12, tov: 12 })] });
  assert.equal(paceFromBoxscore(doc, game).possessions, ((80 + 8.8 - 10 + 14) + (90 + 11 - 12 + 12)) / 2);
  const missing = { ...doc, players: doc.players.map((p) => (p.providerAthleteId === "a" ? { ...p, tov: null } : p)) };
  assert.equal(paceFromBoxscore(missing, game), null);
});

test("overtime head: P(OT) scored with Brier / log loss / ECE on measured games only; sources counted", () => {
  const withOt = (id, actual) => {
    const g = graded(id, { overtimeRate: 0.05 });
    return { ...g, overtime: { ...g.overtime, actual, source: "boxscore-minutes" } };
  };
  const m = validationMetrics([withOt("o1", true), withOt("o2", false), graded("o3")]);
  assert.equal(m.overtime.n, 2); assert.equal(m.overtime.notMeasured, 1);
  assert.equal(m.overtime.head.n, 2);
  assert.equal(m.overtime.head.brier, Number((((0.05 - 1) ** 2 + 0.05 ** 2) / 2).toFixed(4)));
  assert.deepEqual(m.overtime.sources, { "boxscore-minutes": 2 });
});

test("validationFromGrades: one block per label, never pooled", () => {
  const v = validationFromGrades([graded("a"), graded("b", { label: PRE })], { computedAt: "t" });
  assert.deepEqual(Object.keys(v.byLabel).sort(), [PRE, REG].sort());
  assert.equal(v.byLabel[REG].games, 1);
});

test("findings: SYSTEMATIC only when the interval excludes the nominal value; text carries n and the interval", () => {
  // 40 games, every total over-forecast by 15–25 → systematic; margins scattered around 0 → no claim.
  const games = Array.from({ length: 40 }, (_, i) => graded(`f${i}`, { final: [100 + (i % 7), 100 - (i % 5) - 1], totalMean: 200 + 15 + (i % 11), marginMean: (i % 7) + (i % 5) + 1 + (i % 2 ? 6 : -6) }));
  const f = systematicFindings(games, { B: 400 });
  const total = f.find((x) => x.key === "totalBias");
  assert.equal(total.status, "SYSTEMATIC");
  assert.match(total.text, /n 40 over 40 games/);
  assert.equal(f.find((x) => x.key === "marginBias").status, "NO_CLAIM");
  const props = proposeCandidates(f, { family: "v0.2", population: REG });
  assert.ok(props.some((p) => /Calibration candidate \(text only\)/.test(p) && /total/.test(p)));
});

test("coverage interval: a degenerate all-inside sample does not become a claim (Wilson on games widens it)", () => {
  assert.deepEqual(wilson(1, 12), [0.7575, 1]);
  const ci = coverageInterval(Array.from({ length: 12 }, () => [1]), { B: 200 });
  assert.ok(ci.lo <= 0.8, `lower ${ci.lo} must reach the nominal 0.80`);
});

test("diagnostics report: slate vs season-to-date, surprises listed, proposals text only, changes nothing", () => {
  const entries = [
    { providerEventId: "d1", date: "2030-01-10", status: "GRADED", grade: { ...playerGame("d1", { dnpP2: true }), context: { finalState: "FINAL_UNDER_REVIEW", boxscorePoints: { home: 1, away: 2, agrees: false } } } },
    { providerEventId: "d2", date: "2030-01-09", status: "GRADED", grade: playerGame("d2") },
    { providerEventId: "d3", date: "2030-01-11", status: "GRADED", grade: playerGame("d3") },
  ];
  const r = buildDiagnostics({ family: "v0.1", date: "2030-01-10", generatedAt: "t", entries, bootstrap: { B: 200 } });
  assert.equal(r.changesNothing, true);
  assert.equal(r.slate.games, 0, "d1's final is disputed: it feeds no finding (review #5)");
  assert.equal(r.excluded.disputedFinal, 1);
  assert.equal(r.populations[REG].seasonToDate.games, 1, "a later slate is never read; the disputed d1 is excluded");
  assert.equal(r.populations[REG].proposalsAreTextOnly, true);
  const s = r.slate.surprises;
  assert.equal(s.predictedButDnp.length, 1);
  assert.equal(s.predictedButDnp[0].injuryStatus, "Day-To-Day");
  assert.deepEqual(s.playedButUnpredicted.map((p) => p.providerAthleteId).sort(), ["q1", "u9"], "u9 (22 min) and the unpredicted away row (30 min)");
  assert.deepEqual(s.dataChecks.finalsUnderReview, ["d1"]);
  assert.equal(s.dataChecks.boxscorePointsDisagree.length, 1);
  const md = diagnosticsMarkdown(r);
  assert.match(md, /proposals are text only/);
  assert.match(md, /Proposals \(text only — nothing is applied\)/);
});
