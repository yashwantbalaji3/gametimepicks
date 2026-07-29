/**
 * SPRINT 057 — the experiment framework's methodology must stay honest.
 *
 * These experiments produce the evidence for a founder-level product-direction decision. Every
 * failure mode below yields a plausible number instead of an error:
 *
 *   · a shuffled train/test split leaks same-slate rows across the boundary and flatters every
 *     correction;
 *   · a verdict function with soft thresholds lets a blend that merely RETURNS the market get
 *     reported as out-predicting it;
 *   · a broken normal-CDF inverse quietly corrupts every variance-expansion result at the tails.
 *
 * As with the model-learning audit, these tests pin the methodology, not the current results.
 *
 * Run: npx tsx --test src/lib/model-experiments.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EXPERIMENTS,
  fitLogistic,
  linearShrink,
  normCdf,
  normInv,
  runExperiments,
  selfTest,
  temporalSplit,
  varianceExpand,
  verdict,
} from "../../scripts/model-experiments.mjs";

test("the framework's own self-test passes", () => {
  assert.deepEqual(selfTest(), []);
});

// ── preregistration ────────────────────────────────────────────────────────────

test("experiments are preregistered: unique ids, written hypotheses, variance correction present", () => {
  assert.ok(EXPERIMENTS.length >= 6);
  assert.equal(new Set(EXPERIMENTS.map((e) => e.id)).size, EXPERIMENTS.length);
  for (const e of EXPERIMENTS) assert.ok(e.hypothesis.length > 20, `${e.id} needs a hypothesis`);
  for (const id of ["variance-global", "shrink-linear", "blend-raw", "incremental-signal"]) {
    assert.ok(EXPERIMENTS.some((e) => e.id === id), `preregistered set must include ${id}`);
  }
});

// ── numerics ───────────────────────────────────────────────────────────────────

test("normInv/normCdf round-trip across the working range", () => {
  for (const p of [0.02, 0.1, 0.25, 0.5, 0.75, 0.9, 0.98]) {
    assert.ok(Math.abs(normCdf(normInv(p)) - p) < 1e-4, `round-trip failed at ${p}`);
  }
});

test("variance expansion is monotone, symmetric, and shrinks tails more than the middle", () => {
  const ve = varianceExpand(2);
  assert.ok(Math.abs(ve(0.5) - 0.5) < 1e-9);
  assert.ok(Math.abs(ve(0.7) + ve(0.3) - 1) < 1e-6, "must be symmetric around 0.5");
  const nearMove = Math.abs(ve(0.55) - 0.55);
  const farMove = Math.abs(ve(0.9) - 0.9);
  assert.ok(farMove > nearMove * 2, "the correction must act harder far from even money");
  assert.ok(ve(0.8) > ve(0.7), "must stay monotone");
});

test("linear shrink is affine and cannot reproduce the tail-heavy shape", () => {
  const sh = linearShrink(0.6);
  const nearMove = Math.abs(sh(0.55) - 0.55);
  const farMove = Math.abs(sh(0.9) - 0.9);
  // Affine: movement is exactly proportional to distance from 0.5.
  assert.ok(Math.abs(farMove / nearMove - 8) < 1e-6);
});

// ── split discipline ───────────────────────────────────────────────────────────

test("the temporal split never leaks a test date into the train window", () => {
  const rows = [];
  for (let d = 1; d <= 20; d += 1) {
    for (let i = 0; i < 10; i += 1) rows.push({ date: `2026-06-${String(d).padStart(2, "0")}`, p: 0.5, q: 0.5, y: i % 2 });
  }
  const { train, test: te, split } = temporalSplit(rows);
  assert.ok(train.length > 0 && te.length > 0);
  const maxTrain = train.map((r) => r.date).sort().at(-1);
  const minTest = te.map((r) => r.date).sort()[0];
  assert.ok(maxTrain < split && minTest >= split, "train must end strictly before the split");
});

// ── verdict thresholds ─────────────────────────────────────────────────────────

test("verdicts require a real margin: returning the market is MATCHES, not OUTPERFORMS", () => {
  const marketBrier = 0.2412;
  const rawBrier = 0.2556;
  assert.equal(verdict({ testBrier: marketBrier, marketBrier, rawBrier }), "MATCHES_MARKET");
  assert.equal(verdict({ testBrier: marketBrier - 0.0005, marketBrier, rawBrier }), "MATCHES_MARKET");
  assert.equal(verdict({ testBrier: marketBrier - 0.0015, marketBrier, rawBrier }), "OUTPERFORMS_MARKET");
  assert.equal(verdict({ testBrier: rawBrier - 0.003, marketBrier, rawBrier }), "HONESTY_GAIN");
  assert.equal(verdict({ testBrier: rawBrier - 0.001, marketBrier, rawBrier }), "REJECT");
});

// ── incremental-signal regression ──────────────────────────────────────────────

test("the logistic fit recovers a market-only model when the model feature is off", () => {
  const rows = [];
  for (let i = 0; i < 2000; i += 1) {
    const q = 0.3 + 0.4 * ((i % 100) / 100);
    rows.push({ date: "2026-06-01", p: 0.5, q, y: (i * 7) % 100 < q * 100 ? 1 : 0 });
  }
  const m = fitLogistic(rows, false, { iterations: 1500 });
  assert.equal(m.b2, 0, "market-only fit must not use the model coefficient");
  assert.ok(m.b1 > 0.3, "market logit must carry positive weight on market-driven data");
});

// ── end-to-end determinism ─────────────────────────────────────────────────────

test("runExperiments is deterministic for a fixed input", () => {
  const rows = [];
  for (let d = 1; d <= 20; d += 1) {
    for (let i = 0; i < 30; i += 1) {
      const q = 0.35 + 0.3 * ((i % 10) / 10);
      rows.push({ date: `2026-06-${String(d).padStart(2, "0")}`, market: "batter_hits", p: Math.min(0.95, q + 0.1), q, y: (i + d) % 2 });
    }
  }
  const a = runExperiments(rows);
  const b = runExperiments(rows);
  assert.deepEqual(
    a.results.map((r) => [r.id, r.testBrier, r.verdict]),
    b.results.map((r) => [r.id, r.testBrier, r.verdict]),
  );
});
