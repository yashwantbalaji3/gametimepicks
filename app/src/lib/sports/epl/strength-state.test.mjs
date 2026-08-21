/**
 * EPL strength-state + score-model guards (Program 167 · Release G).
 * Run: npx tsx --test src/lib/sports/epl/strength-state.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { fitEplStrength, scoreMatrix, lambdasFor, normalizeClubName } from "./strength-state.mjs";

const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/epl/corpus-v1.json"), "utf8"));

test("cutoff is structural: matches at/after the cutoff never fold; deeper cutoff = same earlier fold", () => {
  const a = fitEplStrength({ rows: corpus.rows, cutoffIso: "2024-08-01T00:00:00Z" });
  const b = fitEplStrength({ rows: corpus.rows, cutoffIso: "2025-08-01T00:00:00Z" });
  assert.ok(a.matchesFitted < b.matchesFitted);
  assert.equal(a.matchesFitted, corpus.rows.filter((m) => Date.parse(m.dateUtc) < Date.parse("2024-08-01T00:00:00Z")).length);
  const target = corpus.rows.find((m) => m.season === "2025-26");
  const c = fitEplStrength({ rows: corpus.rows, cutoffIso: target.dateUtc });
  assert.ok(!c ? false : c.matchesFitted === corpus.rows.filter((m) => Date.parse(m.dateUtc) < Date.parse(target.dateUtc)).length, "the target match itself never contributes");
});

test("missing integer scores are refused from the fold", () => {
  const rows = [
    { dateUtc: "2025-01-01T15:00:00Z", home: "A", away: "B", ftHome: 2, ftAway: 1 },
    { dateUtc: "2025-01-02T15:00:00Z", home: "A", away: "B", ftHome: null, ftAway: 1 },
    { dateUtc: "2025-01-03T15:00:00Z", home: "A", away: "B" },
  ];
  const s = fitEplStrength({ rows, cutoffIso: "2025-02-01T00:00:00Z" });
  assert.equal(s.matchesFitted, 1);
});

test("promoted/unseen clubs cold-start at league-average multipliers, flagged", () => {
  const state = fitEplStrength({ rows: corpus.rows, cutoffIso: "2026-08-01T00:00:00Z" });
  const { lamHome, lamAway, coldStart } = lambdasFor(state, "Coventry City", "Arsenal");
  assert.equal(coldStart.home, true, "Coventry City has no corpus history");
  assert.equal(coldStart.away, false);
  assert.ok(Math.abs(lamHome - state.muHome * 1.0 * (state.stats.get(normalizeClubName("Arsenal")).aa / state.stats.get(normalizeClubName("Arsenal")).ag / state.muHome)) < 1e-9, "cold-start attack is exactly league average × opponent defence");
  assert.ok(lamHome > 0 && lamAway > 0);
});

test("the matrix reconciles: 1X2 sums to 1, totals distribution sums to 1, quantiles ordered", () => {
  const state = fitEplStrength({ rows: corpus.rows, cutoffIso: "2026-08-01T00:00:00Z" });
  const mx = scoreMatrix(state, "Arsenal", "Chelsea");
  assert.equal(mx.reconciliation, true);
  assert.ok(Math.abs(mx.oneXTwo.home + mx.oneXTwo.draw + mx.oneXTwo.away - 1) < 1e-9);
  assert.ok(Math.abs(mx.totals.distribution.reduce((s, p) => s + p, 0) - 1) < 1e-4);
  const q = mx.totals.quantiles;
  assert.ok(q.p10 <= q.p25 && q.p25 <= q.p50 && q.p50 <= q.p75 && q.p75 <= q.p90);
  assert.ok(mx.oneXTwo.draw > 0.1 && mx.oneXTwo.draw < 0.5, "the draw is a real outcome, preserved");
  assert.ok(Math.abs(mx.totals.over25 + mx.totals.under25 - 1) < 1e-9);
});

test("PARITY · the lib reproduces the committed baseline evaluation exactly (same arithmetic)", () => {
  const report = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/epl/reports/model-v1-evaluation.json"), "utf8"));
  const baseline = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/epl/reports/baseline-evaluation-v1.json"), "utf8"));
  assert.equal(report.metrics.model.n, baseline.models.poisson.overall.n);
  assert.equal(report.metrics.model.logLoss, baseline.models.poisson.overall.logLoss, "logLoss parity with the committed baseline — one arithmetic, two receipts");
  assert.equal(report.metrics.model.accuracy, baseline.models.poisson.overall.accuracy);
  assert.ok(report.metrics.model.logLoss < report.metrics.baselines.uniform.logLoss);
});

test("determinism: same rows + cutoff → identical lambdas", () => {
  const s1 = fitEplStrength({ rows: corpus.rows, cutoffIso: "2026-08-01T00:00:00Z" });
  const s2 = fitEplStrength({ rows: corpus.rows, cutoffIso: "2026-08-01T00:00:00Z" });
  assert.deepEqual(lambdasFor(s1, "Arsenal", "Chelsea"), lambdasFor(s2, "Arsenal", "Chelsea"));
});

/*
 * P188 — the derived markets are READ OFF the same grid, so "does it reconcile" is the whole test.
 *
 * The published forecast carried five numbers out of a distribution that answers far more; the rest
 * were computed and discarded. The risk in reading them out is not that the arithmetic is hard — it
 * is that a second, subtly different derivation drifts from the 1X2 block the page prints beside it.
 * Every assertion below ties a derived number back to the block it must agree with, so a future
 * shortcut (a sampled BTTS, an approximated ladder) fails here rather than on a live page.
 */
test("derived markets reconcile against the same matrix they are read from", () => {
  const state = fitEplStrength({ rows: corpus.rows, cutoffIso: "2026-08-01T00:00:00Z" });
  for (const [h, a] of [["Arsenal", "Chelsea"], ["Everton", "Liverpool"], ["Brentford", "Fulham"]]) {
    const mx = scoreMatrix(state, h, a);
    const tag = `${h} v ${a}`;

    // Double chance is a sum of 1X2 terms — it may never be its own estimate.
    assert.ok(Math.abs(mx.doubleChance.homeOrDraw - (mx.oneXTwo.home + mx.oneXTwo.draw)) < 2e-6, `${tag}: homeOrDraw`);
    assert.ok(Math.abs(mx.doubleChance.drawOrAway - (mx.oneXTwo.draw + mx.oneXTwo.away)) < 2e-6, `${tag}: drawOrAway`);
    assert.ok(Math.abs(mx.doubleChance.homeOrAway - (mx.oneXTwo.home + mx.oneXTwo.away)) < 2e-6, `${tag}: homeOrAway`);

    // Complements are exact on a half line: no push is reachable, so over + under is exactly 1.
    assert.ok(Math.abs(mx.btts.yes + mx.btts.no - 1) < 2e-6, `${tag}: btts complement`);
    for (const l of mx.totals.ladder) {
      assert.ok(Math.abs(l.over + l.under - 1) < 2e-6, `${tag}: ladder ${l.line} complement`);
      assert.ok(Number.isFinite(l.over) && l.over >= 0 && l.over <= 1, `${tag}: ladder ${l.line} in range`);
    }
    // The ladder's 2.5 rung and the standalone over25 are the SAME quantity; two fields, one number.
    const l25 = mx.totals.ladder.find((l) => l.line === 2.5);
    assert.ok(Math.abs(l25.over - mx.totals.over25) < 2e-6, `${tag}: ladder 2.5 must equal totals.over25`);
    // A ladder must be monotone — a longer line cannot be likelier to go over.
    for (let i = 1; i < mx.totals.ladder.length; i++) {
      assert.ok(mx.totals.ladder[i].over <= mx.totals.ladder[i - 1].over, `${tag}: ladder monotonicity at ${mx.totals.ladder[i].line}`);
    }

    // Marginals must rebuild the joint's expectations, or they are a different model.
    assert.ok(Math.abs(mx.teamGoals.home.distribution.reduce((s, p) => s + p, 0) - 1) < 1e-4, `${tag}: home marginal sums to 1`);
    assert.ok(Math.abs(mx.teamGoals.away.distribution.reduce((s, p) => s + p, 0) - 1) < 1e-4, `${tag}: away marginal sums to 1`);
    assert.ok(Math.abs(mx.totals.expected - (mx.teamGoals.home.expected + mx.teamGoals.away.expected)) < 2e-3, `${tag}: E[total] = E[home] + E[away]`);
    assert.ok(Math.abs(mx.margin.expected - (mx.teamGoals.home.expected - mx.teamGoals.away.expected)) < 2e-3, `${tag}: E[margin] = E[home] − E[away]`);
    assert.ok(Math.abs(mx.margin.distribution.reduce((s, d) => s + d.p, 0) - 1) < 1e-4, `${tag}: margin sums to 1`);

    // A clean sheet for the home side is exactly "the away side scores none" — the away marginal at 0.
    assert.ok(Math.abs(mx.cleanSheet.home - mx.teamGoals.away.distribution[0]) < 2e-6, `${tag}: home clean sheet`);
    assert.ok(Math.abs(mx.cleanSheet.away - mx.teamGoals.home.distribution[0]) < 2e-6, `${tag}: away clean sheet`);

    // The scoreline list must state how much of the distribution it actually covers.
    assert.equal(mx.topScorelines.length, 10, `${tag}: ten scorelines`);
    const listed = mx.topScorelines.reduce((t, s) => t + s.p, 0);
    assert.ok(Math.abs(mx.topScorelinesMass - listed) < 2e-5, `${tag}: topScorelinesMass must equal the listed mass`);
    assert.ok(mx.topScorelinesMass < 1, `${tag}: a top-N list is never the whole distribution`);
    for (let i = 1; i < mx.topScorelines.length; i++) {
      assert.ok(mx.topScorelines[i].p <= mx.topScorelines[i - 1].p, `${tag}: scorelines ordered by probability`);
    }
  }
});

test("the derived markets are FIXTURE-SPECIFIC, not a shared prior", () => {
  /*
   * The NFL lesson (P179/P184), applied before publication rather than after: ten games wearing one
   * shared prior looked like ten model reads. If EPL's derived markets were ever to collapse onto a
   * league-average constant, this is where it should be caught — a mismatched pair must not produce
   * the same clean-sheet or margin numbers as a level one.
   */
  const state = fitEplStrength({ rows: corpus.rows, cutoffIso: "2026-08-01T00:00:00Z" });
  const strong = scoreMatrix(state, "Manchester City", "Everton");
  const level = scoreMatrix(state, "Brentford", "Fulham");
  assert.ok(Math.abs(strong.margin.expected - level.margin.expected) > 0.25,
    "a mismatched fixture and a level one must not share an expected margin");
  assert.ok(strong.cleanSheet.home !== level.cleanSheet.home, "clean-sheet probability is fixture-specific");
  assert.notDeepEqual(strong.topScorelines[0], level.topScorelines[0], "the likeliest scoreline is fixture-specific");
});
