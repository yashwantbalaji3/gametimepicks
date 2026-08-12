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
