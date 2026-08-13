/**
 * NFL game-sim guards (Program 169 · Release C).
 * Run: npx tsx --test src/lib/sports/nfl/game-sim.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { simulateNflGame, snapScore, PRESEASON_VARIANT, mulberry32 } from "./game-sim.mjs";
import { fitNflV1 } from "./model-v1.mjs";
import { strengthStateAt, ELO_PARAMS } from "./strength-state.mjs";

const corpus = JSON.parse(fs.readFileSync(path.join(process.cwd(), "..", "data/internal/research/nfl/corpus-v1.json"), "utf8"));
const FIT = fitNflV1(corpus.rows.filter((r) => [2023, 2024].includes(r.season)));
const STATE = strengthStateAt({ rows: corpus.rows, cutoffIso: "2026-08-13T00:00:00Z" });
const EVENT = { providerEventId: "999100", home: "Kansas City Chiefs", away: "Las Vegas Raiders", seasonType: 2, dateUtc: "2026-09-13T17:00:00Z" };

test("determinism: same inputs → byte-identical output; different artifact date → different stream", () => {
  const a = simulateNflGame({ fit: FIT, strengthState: STATE, event: EVENT, artifactDate: "2026-09-13", runs: 4000 });
  const b = simulateNflGame({ fit: FIT, strengthState: STATE, event: EVENT, artifactDate: "2026-09-13", runs: 4000 });
  assert.deepEqual(a, b, "no per-user reroll surface exists");
  const c = simulateNflGame({ fit: FIT, strengthState: STATE, event: EVENT, artifactDate: "2026-09-14", runs: 4000 });
  assert.notEqual(a.deterministicSeed, c.deterministicSeed);
});

test("the reported win head IS the validated elo-logistic; score-implied rate ships as a diagnostic", () => {
  const s = simulateNflGame({ fit: FIT, strengthState: STATE, event: EVENT, artifactDate: "2026-09-13", runs: 10000 });
  const d = STATE.ratingFor(EVENT.home) + ELO_PARAMS.HOME_ADVANTAGE - STATE.ratingFor(EVENT.away);
  const logistic = 1 / (1 + 10 ** (-d / 400));
  const winNoTie = s.winProbability.home / (s.winProbability.home + s.winProbability.away);
  assert.ok(Math.abs(winNoTie - logistic) < 2e-4, `reported head equals the analytic head up to 4dp artifact rounding (gap ${Math.abs(winNoTie - logistic)})`);
  assert.ok(s.scoreImpliedWinDiagnostic.headAgreementGap >= 0, "the divergence is visible, not hidden");
  assert.ok(Math.abs(s.winProbability.home + s.winProbability.away + s.winProbability.tie - 1) < 1e-6);
});

test("preseason events use the fit-chosen conservative variant and say so", () => {
  const s = simulateNflGame({ fit: FIT, strengthState: STATE, event: { ...EVENT, seasonType: 1 }, artifactDate: "2026-08-13", runs: 4000 });
  assert.equal(s.variant, "PRESEASON_CONSERVATIVE");
  assert.equal(s.evidenceTier, "REDUCED_PRESEASON");
  assert.equal(PRESEASON_VARIANT.marginShrink, 0.2, "the committed shrink is the train-chosen value — changing it requires a new committed evaluation");
  const reg = simulateNflGame({ fit: FIT, strengthState: STATE, event: EVENT, artifactDate: "2026-08-13", runs: 4000 });
  assert.ok(Math.abs(s.winProbability.home - 0.5) < Math.abs(reg.winProbability.home - 0.5), "shrunk signal sits nearer coin than the regular head");
});

test("score support is legal: integers, non-negative, never exactly 1", () => {
  assert.equal(snapScore(-3), 0);
  assert.equal(snapScore(1.2), 0);
  assert.equal(snapScore(0.9), 0);
  assert.equal(snapScore(2.4), 2);
  const s = simulateNflGame({ fit: FIT, strengthState: STATE, event: EVENT, artifactDate: "2026-09-13", runs: 4000 });
  for (const side of ["home", "away"]) {
    const q = s.scores[side].quantiles;
    for (const v of Object.values(q)) assert.ok(Number.isInteger(v) && v >= 0 && v !== 1, `${side} quantile ${v} legal`);
  }
});

test("spread/total probabilities appear only when lines are supplied; pushes counted separately", () => {
  const bare = simulateNflGame({ fit: FIT, strengthState: STATE, event: EVENT, artifactDate: "2026-09-13", runs: 4000 });
  assert.equal(bare.spreadCover, undefined);
  assert.equal(bare.totalOver, undefined);
  const s = simulateNflGame({ fit: FIT, strengthState: STATE, event: EVENT, artifactDate: "2026-09-13", runs: 8000, lines: { spread: -3, total: 44 } });
  assert.ok(s.spreadCover.home > 0 && s.spreadCover.home < 1);
  assert.ok(s.spreadCover.push >= 0, "integer lines can push");
  assert.ok(Math.abs(s.totalOver.over + s.totalOver.push - (1 - (1 - s.totalOver.over - s.totalOver.push))) < 1e-9);
});

test("abstention rungs: unresolved identity and missing seed components refuse", () => {
  assert.equal(simulateNflGame({ fit: FIT, strengthState: STATE, event: { providerEventId: "x", seasonType: 2 }, artifactDate: "2026-09-13" }).state, "ABSTAIN");
  assert.equal(simulateNflGame({ fit: FIT, strengthState: STATE, event: { ...EVENT, providerEventId: null }, artifactDate: "2026-09-13" }).state, "ABSTAIN");
  assert.equal(simulateNflGame({ fit: FIT, strengthState: STATE, event: EVENT, artifactDate: null }).state, "ABSTAIN");
});

test("convergence is measured and sane at n=10k", () => {
  const s = simulateNflGame({ fit: FIT, strengthState: STATE, event: EVENT, artifactDate: "2026-09-13", runs: 10000 });
  assert.ok(s.convergence.binomialSE <= 0.005, `SE ${s.convergence.binomialSE}`);
  assert.ok(s.convergence.splitHalfGap < 0.03, `split-half gap ${s.convergence.splitHalfGap}`);
});

test("REAL SLATE · tonight's six preseason games simulate under the variant, privately", () => {
  const sch = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/nfl/schedule/latest.json"), "utf8"));
  const tonight = sch.rows.filter((r) => r.statusRaw === "STATUS_SCHEDULED" && r.dateUtc >= "2026-08-13T22:00Z" && r.dateUtc <= "2026-08-14T02:00Z");
  assert.ok(tonight.length >= 5, `slate resolved from committed capture (${tonight.length})`);
  for (const g of tonight) {
    const s = simulateNflGame({ fit: FIT, strengthState: STATE, event: g, artifactDate: "2026-08-13", runs: 4000 });
    assert.equal(s.state, "SIMULATED");
    assert.equal(s.variant, "PRESEASON_CONSERVATIVE", g.shortName);
    assert.equal(s.publicActivation, "OFF");
    assert.ok(s.winProbability.home > 0.3 && s.winProbability.home < 0.7, `${g.shortName}: shrunk preseason head stays near coin (${s.winProbability.home})`);
  }
});

test("prng sanity: mulberry32 is uniform-ish and deterministic", () => {
  const r1 = mulberry32("abcdef12");
  const r2 = mulberry32("abcdef12");
  const xs = Array.from({ length: 1000 }, () => r1());
  assert.equal(xs[0], r2(), "same seed, same stream");
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(m > 0.45 && m < 0.55, `mean ${m}`);
});
