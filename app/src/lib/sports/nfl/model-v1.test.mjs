/**
 * NFL model v1 guards (Program 167 · Release E).
 * Run: npx tsx --test src/lib/sports/nfl/model-v1.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { walkForwardObservations, fitNflV1, predictNflV1, strengthStateAt } from "./model-v1.mjs";

const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/nfl/corpus-v1.json"), "utf8"));
const trainRows = corpus.rows.filter((r) => [2023, 2024].includes(r.season));

test("walk-forward: preseason never predicts or fits; observations are chronological and pre-game", () => {
  const obs = walkForwardObservations(corpus.rows);
  assert.ok(obs.every((o) => o.phase !== 1), "phase-1 games are absent");
  for (let i = 1; i < obs.length; i++) assert.ok(obs[i].dateUtc >= obs[i - 1].dateUtc, "chronological");
  assert.ok(obs.every((o) => o.pHome > 0 && o.pHome < 1));
});

test("fit: deterministic, floor-guarded, parameters in sane football ranges", () => {
  const a = fitNflV1(trainRows);
  const b = fitNflV1(trainRows);
  assert.deepEqual(a.params, b.params, "same rows, same fit — no RNG anywhere");
  assert.ok(a.params.marginSlope > 0.01 && a.params.marginSlope < 0.1, `Elo→points slope ${a.params.marginSlope} near the known ~1/25 regime`);
  assert.ok(a.params.sigmaMargin > 9 && a.params.sigmaMargin < 18, `margin σ ${a.params.sigmaMargin} in the NFL band`);
  assert.ok(a.params.muTotal > 30 && a.params.muTotal < 60, `league total μ ${a.params.muTotal}`);
  assert.throws(() => fitNflV1(trainRows.slice(0, 50)), /below the floor/);
});

test("predict: probabilities sum to 1, quantiles ordered, features carry the cutoff", () => {
  const fit = fitNflV1(trainRows);
  const state = strengthStateAt({ rows: trainRows, cutoffIso: "2025-01-01T00:00:00Z" });
  const out = predictNflV1({ fit, strengthState: state, event: { providerEventId: "x", seasonType: 2, home: "Kansas City Chiefs", away: "Las Vegas Raiders" } });
  assert.equal(out.state, "PREDICTED");
  assert.ok(Math.abs(out.probs.home + out.probs.away - 1) < 1e-9);
  const q = out.margin.quantiles;
  assert.ok(q.p10 < q.p25 && q.p25 < q.p50 && q.p50 < q.p75 && q.p75 < q.p90, "margin quantiles ordered");
  assert.equal(q.p50, out.margin.mean, "analytic median = mean for a normal");
  assert.equal(out.features.strengthCutoffIso, "2025-01-01T00:00:00Z");
  assert.match(out.total.basis, /climatology/, "the total head states its own limitation");
});

test("preseason ABSTAINS with the model card's stated reason — never a prediction", () => {
  const fit = fitNflV1(trainRows);
  const state = strengthStateAt({ rows: trainRows, cutoffIso: "2026-08-12T00:00:00Z" });
  const out = predictNflV1({ fit, strengthState: state, event: { providerEventId: "401873272", seasonType: 1, home: { abbr: "CIN" }, away: { abbr: "DET" } } });
  assert.equal(out.state, "ABSTAIN");
  assert.match(out.reason, /preseason/i);
  assert.equal(out.probs, undefined, "an abstention carries no probabilities at all");
});

test("independence is structural: predict has no odds parameter and never reads market data", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/lib/sports/nfl/model-v1.mjs"), "utf8");
  assert.ok(!/odds|market|price|bookmaker/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "no odds/market identifier appears in model code (comments excluded)");
});

test("the committed evaluation report matches a fresh replay (no hand-edited numbers)", () => {
  const report = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/nfl/reports/model-v1-evaluation.json"), "utf8"));
  const fit = fitNflV1(trainRows);
  assert.deepEqual(report.fitParams, fit.params, "committed fit params re-derive exactly");
  assert.equal(report.protocol.train.observations, fit.trainObservations);
  assert.ok(report.metrics.model.logLoss < report.metrics.baselines.coin.logLoss, "beats coin on the held-out season");
  assert.equal(report.coverage.predicted + report.coverage.abstainedPreseason, report.coverage.testGamesTotal, "coverage arithmetic exact");
});
