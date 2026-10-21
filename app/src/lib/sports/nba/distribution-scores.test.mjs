/**
 * Distribution scores over FROZEN RECEIPT QUANTILES — hand-computable fixtures (SYNTHETIC, clearly marked).
 * Run (from app/, under tsx — the parity test imports the TypeScript-backed market evaluator):
 *   npx tsx --test src/lib/sports/nba/distribution-scores.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { pinball, intervalScore, crpsFromPinball, probAtLeast, thresholdLogScore, scoreQuantileBlock, aggregateScores, commonLevels, THRESHOLDS } from "./distribution-scores.mjs";
import { lineProbabilities } from "../../consistency/market-evaluator.mjs";
import { DISTRIBUTION_KIND } from "../../consistency/official-snapshot.mjs";
import { validationMetrics } from "./grader-metrics.mjs";
import { pairGames, pairedMetrics } from "./champion-challenger.mjs";
import { buildDiagnostics, diagnosticsMarkdown, distributionScoreTable, distributionTableMarkdown } from "./model-diagnostics.mjs";
import { FIXTURE_NOTE, graded, predPlayer, boxDoc, boxRow, HOME, REG } from "./__fixtures__/nba-grading-fixtures.mjs";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const B3 = { p10: 5, p50: 10, p90: 15 };
const B5 = { p10: 5, p25: 8, p50: 10, p75: 12, p90: 15 };

test("fixtures are labelled synthetic", () => assert.match(FIXTURE_NOTE, /SYNTHETIC/));

test("pinball loss ρ_τ(y − q): τ 0.1, q 10 → y 15 gives 0.5, y 5 gives 4.5", () => {
  close(pinball(0.1, 10, 15), 0.5);
  close(pinball(0.1, 10, 5), 4.5);
  close(pinball(0.5, 10, 12), 1.0);
});

test("CRPS ≈ 2 × mean pinball over the stored levels: {5,10,15} at y 12 → pinball 0.7 / 1.0 / 0.3 → 1.333333", () => {
  const s = scoreQuantileBlock(B3, 12, { market: "pts" });
  assert.deepEqual(s.levels, ["p10", "p50", "p90"]);
  assert.deepEqual(s.pinball, { p10: 0.7, p50: 1, p90: 0.3 });
  close(crpsFromPinball(s.pinball, s.levels), 4 / 3);
});

test("interval score (Gneiting–Raftery): [5, 15], α 0.2 → y 12: 10 · y 20: 60 · y 0: 60; 50% only where p25/p75 are stored", () => {
  assert.equal(intervalScore(5, 15, 12, 0.2), 10);
  assert.equal(intervalScore(5, 15, 20, 0.2), 60);
  assert.equal(intervalScore(5, 15, 0, 0.2), 60);
  assert.equal(scoreQuantileBlock(B3, 12, { market: "pts" }).is50, null);
  assert.equal(scoreQuantileBlock(B5, 13, { market: "pts" }).is50, 4 + (2 / 0.5) * 1, "[8, 12], y 13 → 4 + 4·1 = 8");
});

test("P(X ≥ k) = 1 − F(k − ½) with linear interpolation and exponential tails (hand values)", () => {
  close(probAtLeast(B3, 10), 0.54);                        // F(9.5) = 0.1 + 0.4·4.5/5 = 0.46
  close(probAtLeast(B3, 16), 0.1 * Math.exp(-0.4));        // above p90: (1 − 0.9)·e^{−0.5·0.08/0.1}
  close(probAtLeast(B3, 3), 1 - 0.1 * Math.exp(-2));       // below p10: 0.1·e^{−2.5·0.08/0.1}
  assert.equal(probAtLeast(B3, 0), 1, "a count's lower bound: P(X ≥ 0) = 1");
});

test("PARITY: P(X ≥ k) equals market-evaluator.mjs lineProbabilities(…, k − 0.5).pOver on the same stored points", () => {
  for (const block of [B3, B5, { p10: 0, p50: 1, p90: 3 }, { p10: 12.4, p25: 17, p50: 21.4, p75: 25.9, p90: 30.1 }]) {
    const points = Object.entries({ p10: 0.1, p25: 0.25, p50: 0.5, p75: 0.75, p90: 0.9 }).filter(([k]) => block[k] != null).map(([k, q]) => ({ q, v: block[k] }));
    for (const k of [0, 1, 2, 3, 5, 10, 15, 20, 25, 30, 40]) {
      const ref = lineProbabilities({ kind: DISTRIBUTION_KIND.QUANTILES, points, lowerBound: 0 }, k - 0.5).pOver;
      close(probAtLeast(block, k, 0), ref, 1e-9);
    }
  }
});

test("threshold log score: −ln P̂ of the realised side (P(X ≥ 10) = 0.54: y 12 → 0.616186, y 8 → 0.776529)", () => {
  close(thresholdLogScore(0.54, 12, 10), -Math.log(0.54));
  close(thresholdLogScore(0.54, 8, 10), -Math.log(0.46));
  assert.deepEqual(THRESHOLDS.pts, [10, 15, 20, 25, 30]);
  assert.deepEqual(Object.keys(scoreQuantileBlock(B3, 12, { market: "pts" }).pGe), ["10", "15", "20", "25", "30"]);
  assert.deepEqual(scoreQuantileBlock(B3, 12, { market: "minutes" }).pGe, {}, "no threshold set for minutes");
});

test("aggregate per engine × market: CRPS on the levels EVERY row stores; IS80 / IS50 / threshold scores with n", () => {
  const a = aggregateScores([scoreQuantileBlock(B3, 12, { market: "pts" }), scoreQuantileBlock(B5, 12, { market: "pts" })], "pts");
  assert.deepEqual(a.crps.levels, ["p10", "p50", "p90"], "p25/p75 dropped: one row lacks them");
  close(a.crps.mean, 4 / 3);
  assert.equal(a.crps.n, 2);
  assert.deepEqual([a.is80.n, a.is80.mean, a.is50.n], [2, 10, 1]);
  assert.equal(a.thresholdLogScore.ge10.n, 2);
  close(a.thresholdLogScore.ge10.baseRate, 1);
  assert.match(a.crps.note, /approximates CRPS on a sparse quantile set/);
  assert.deepEqual(commonLevels({ levels: ["p10", "p25", "p50"] }, { levels: ["p10", "p50", "p90"] }), ["p10", "p50"]);
});

/** One game, one predicted player p1 (pts p10/p50/p90 = 11.6/18/24.4 from the fixture q(18, 5)), actual 20 pts. */
const game = (id, over = {}) => graded(id, {
  inputAsOf: "2029-12-31T00:00:00Z",
  box: boxDoc(id, { homeRows: [boxRow("p1", HOME, { minutes: 32, pts: 20 })] }),
  home: [predPlayer("p1", { em: 30, pts: 18 })], ...over,
});

test("grades carry the scores computed from the FROZEN quantiles (player markets + team margin/total)", () => {
  const g = game("d1");
  const r = g.players.rows[0];
  for (const m of ["pts", "reb", "ast", "threePm", "pra", "ptsReb", "ptsAst", "minutes"]) assert.ok(r.dist[m], `row.dist.${m}`);
  assert.equal(r.dist.pts.actual, 20);
  assert.deepEqual(r.dist.pts.levels, ["p10", "p50", "p90"]);
  close(r.dist.pts.pinball.p50, 0.5 * 2);           // τ 0.5, q 18, y 20
  assert.ok(g.dist.margin && g.dist.total, "team markets where the engine stores them");
  assert.equal(g.dist.margin.actual, 10);
});

test("validation reports an engine × market distribution-score block (n everywhere)", () => {
  const m = validationMetrics([game("v1"), game("v2")]);
  assert.equal(m.distributionScores.pts.n, 2);
  assert.equal(m.distributionScores.pts.crps.n, 2);
  assert.equal(m.distributionScores.margin.n, 2);
  assert.match(m.distributionScores.label, /diagnostic, promotes nothing/);
});

test("paired distribution scores: identical rows, common levels only, game-clustered interval, one n", () => {
  // Champion stores p10/p50/p90; challenger adds p25/p75 — the comparison uses p10/p50/p90 for both.
  const champ = [game("c1"), game("c2"), game("c3")];
  const chall = [game("c1"), game("c2"), game("c3")].map((g) => ({ ...g, players: { ...g.players, rows: g.players.rows.map((r) => ({ ...r, dist: { ...r.dist, pts: scoreQuantileBlock({ p10: 15, p25: 17, p50: 19, p75: 21, p90: 23 }, r.dist.pts.actual, { market: "pts" }) } })) } }));
  const m = pairedMetrics(pairGames(champ, chall).pairs, { B: 200 }).distribution;
  const c = m.players.pts.crps;
  assert.equal(c.n, 3);
  assert.deepEqual(c.levels, ["p10", "p50", "p90"]);
  // y 20: champion pinball (11.6/18/24.4) = 0.84, 1.0, 0.44 → CRPS 1.52; challenger (15/19/23) = 0.5, 0.5, 0.3 → 0.866667.
  close(c.champion, 2 * (0.84 + 1 + 0.44) / 3, 1e-4);
  close(c.challenger, 2 * (0.5 + 0.5 + 0.3) / 3, 1e-4);
  close(c.diff, c.challenger - c.champion, 1e-4);
  assert.equal(m.players.pts.is50.n, 0, "50% interval only where BOTH engines store p25/p75");
  assert.equal(m.players.pts.thresholdLogScore.ge20.n, 3);
  assert.equal(m.team.margin.crps.n, 3);
});

test("daily report: an engine × market table labelled 'diagnostic, promotes nothing'", () => {
  const entries = (fam) => [game("t1"), game("t2")].map((g, i) => ({ providerEventId: g.providerEventId, date: "2030-01-10", status: "GRADED", grade: g, i, fam }));
  const t = distributionScoreTable({ families: { "v0.1": entries("v0.1"), v1: entries("v1") }, date: "2030-01-10", label: REG });
  assert.equal(t.rows.find((r) => r.engine === "v0.1" && r.market === "pts").crps.n, 2);
  const md = distributionTableMarkdown(t);
  assert.match(md, /diagnostic, promotes nothing/);
  assert.match(md, /\| v1 \| pts \|/);
  const r = buildDiagnostics({ family: "v0.1", date: "2030-01-10", generatedAt: "t", entries: entries("v0.1"), bootstrap: { B: 100 } });
  assert.match(diagnosticsMarkdown(r), /Distribution scores \(diagnostic, promotes nothing\)/);
});
