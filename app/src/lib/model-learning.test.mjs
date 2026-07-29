/**
 * SPRINT 047 — the model-learning audit's methodology must stay honest.
 *
 * The audit produces numbers a founder will act on: "disable this market", "adopt this calibrator".
 * Those conclusions are only as good as the machinery underneath, and every failure mode here is one
 * that produces a plausible number rather than an error:
 *
 *   · a random train/test split would leak correlated rows from the same slate across the boundary and
 *     make any calibrator look better than it is;
 *   · a vigged market baseline would make the market look worse and the model better;
 *   · a calibrator that always reports an improvement is worthless, and looks identical to one that
 *     works until you test it on data that needs no correction.
 *
 * So these tests pin the methodology, not the current results. The results are expected to move.
 *
 * Run: npx tsx --test src/lib/model-learning.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  calibrationBacktest,
  fitIsotonic,
  fitPlatt,
  loadRows,
  marketRegistry,
  selfTest,
  wilson,
} from "../../scripts/model-learning-audit.mjs";

test("the audit's own self-test passes", () => {
  assert.deepEqual(selfTest(), []);
});

// ── intervals ──────────────────────────────────────────────────────────────────

test("Wilson intervals stay in range and widen as n shrinks", () => {
  for (const [w, n] of [[0, 5], [5, 5], [1, 3], [500, 1000]]) {
    const ci = wilson(w, n);
    assert.ok(ci.low >= 0 && ci.high <= 1, `interval escaped [0,1] for ${w}/${n}`);
    assert.ok(ci.low <= ci.high, "low must not exceed high");
  }
  const wide = wilson(2, 4);
  const tight = wilson(500, 1000);
  assert.ok(wide.high - wide.low > tight.high - tight.low, "small n must produce a wider interval");
});

test("a 0-win and an all-win sample still produce usable intervals", () => {
  // The normal approximation degenerates here; Wilson must not.
  assert.ok(wilson(0, 40).high > 0, "0 wins must not imply a zero-width interval at 0");
  assert.ok(wilson(40, 40).low < 1, "40/40 must not imply certainty");
});

// ── calibrators ────────────────────────────────────────────────────────────────

const overconfident = () => {
  const rows = [];
  for (let i = 0; i < 2000; i += 1) {
    const trueP = 0.35 + (i % 40) / 100;
    rows.push({ p: Math.min(0.97, trueP + 0.12), y: i % 100 < trueP * 100 ? 1 : 0 });
  }
  return rows;
};

test("both calibrators pull a knowingly overconfident set toward its observed rate", () => {
  const rows = overconfident();
  const observed = rows.reduce((a, r) => a + r.y, 0) / rows.length;
  const rawMean = rows.reduce((a, r) => a + r.p, 0) / rows.length;
  for (const fit of [fitPlatt, fitIsotonic]) {
    const cal = fit(rows);
    const calMean = rows.reduce((a, r) => a + cal(r.p), 0) / rows.length;
    assert.ok(
      Math.abs(calMean - observed) < Math.abs(rawMean - observed),
      `${fit.name} must reduce the gap between mean prediction and observed rate`,
    );
  }
});

test("isotonic output is monotone — a calibrator must never reorder predictions", () => {
  const cal = fitIsotonic(overconfident());
  const probes = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
  const mapped = probes.map(cal);
  for (let i = 1; i < mapped.length; i += 1) {
    assert.ok(mapped[i] >= mapped[i - 1] - 1e-9, `not monotone at ${probes[i]}: ${mapped}`);
  }
});

test("calibrators output valid probabilities for out-of-range and extreme inputs", () => {
  for (const fit of [fitPlatt, fitIsotonic]) {
    const cal = fit(overconfident());
    for (const p of [0, 1e-9, 0.5, 1 - 1e-9, 1]) {
      const v = cal(p);
      assert.ok(Number.isFinite(v) && v >= 0 && v <= 1, `${fit.name}(${p}) = ${v}`);
    }
  }
});

test("a calibrator must NOT claim a large gain on already-calibrated data", () => {
  // The failure this guards: a calibrator that always reports an improvement is indistinguishable
  // from a working one until it is shown data that needs no correction.
  const rows = [];
  for (let i = 0; i < 2000; i += 1) {
    const p = 0.3 + (i % 40) / 100;
    rows.push({ p, y: i % 100 < p * 100 ? 1 : 0 });
  }
  const brier = (pick) => rows.reduce((a, r) => a + (pick(r) - r.y) ** 2, 0) / rows.length;
  const cal = fitPlatt(rows);
  assert.ok(brier((r) => cal(r.p)) >= brier((r) => r.p) - 0.01, "no material gain is available here");
});

// ── the split ──────────────────────────────────────────────────────────────────

const sequence = (days = 20, perDay = 30) => {
  const rows = [];
  for (let d = 1; d <= days; d += 1) {
    for (let i = 0; i < perDay; i += 1) {
      rows.push({ date: `2026-06-${String(d).padStart(2, "0")}`, p: 0.6, q: 0.5, y: i % 2, market: "m", confidence: "High" });
    }
  }
  return rows;
};

test("the train/test split is temporal and shares no date", () => {
  const bt = calibrationBacktest(sequence(), 0.7);
  assert.ok(!bt.skipped, bt.skipped);
  assert.ok(bt.trainDates[1] < bt.splitDate, "the last train date must precede the split");
  assert.ok(bt.testDates[0] >= bt.splitDate, "the first test date must not precede the split");
  assert.ok(bt.trainRows > 0 && bt.testRows > 0);
});

test("the backtest refuses to run on too little data rather than reporting a number", () => {
  assert.ok(calibrationBacktest(sequence(2, 10)).skipped, "must skip, not guess, on a tiny sample");
});

test("the backtest reports honestly when the calibrator does not help", () => {
  const bt = calibrationBacktest(sequence(), 0.7);
  assert.equal(typeof bt.improvesOnRawModel, "boolean");
  assert.equal(typeof bt.stillLosesToMarket, "boolean");
  assert.match(bt.recommendation, /ADOPT|DO NOT ADOPT/);
});

// ── registry ───────────────────────────────────────────────────────────────────

test("a market is never DISABLED on a small sample", () => {
  // 10 rows, all losses — the worst possible record, but not evidence.
  const rows = Array.from({ length: 10 }, (_, i) => ({ date: "2026-06-01", market: "tiny", p: 0.8, q: 0.5, y: 0, confidence: "High" }));
  const reg = marketRegistry(rows);
  assert.equal(reg.tiny.status, "MONITOR", "10 losing rows must be MONITOR, never DISABLED");
  assert.match(reg.tiny.rationale, /below the .* minimum/);
});

test("a market IS disabled when a large sample sits entirely below break-even", () => {
  const rows = Array.from({ length: 2000 }, (_, i) => ({
    date: "2026-06-01", market: "bad", p: 0.7, q: 0.5, y: i % 100 < 40 ? 1 : 0, confidence: "High",
  }));
  const reg = marketRegistry(rows);
  assert.equal(reg.bad.status, "DISABLED");
  assert.ok(reg.bad.hitRate95.high < 0.5, "the whole interval must sit below 50% to justify this");
});

test("every registry entry carries a sample size and a rationale", () => {
  const rows = [...Array(600)].map((_, i) => ({ date: "2026-06-01", market: "m", p: 0.55, q: 0.5, y: i % 2, confidence: "High" }));
  for (const v of Object.values(marketRegistry(rows))) {
    assert.ok(v.n > 0 && v.rationale.length > 20, `unusable registry entry: ${JSON.stringify(v)}`);
  }
});

// ── the real corpus ────────────────────────────────────────────────────────────

test("the real corpus loads with a DE-VIGGED market probability", () => {
  const rows = loadRows();
  assert.ok(rows.length > 1000, `expected a substantial corpus, got ${rows.length}`);

  // The whole model-vs-market comparison turns on this: the stored overround must be real (>1), and
  // the probability actually used must be the normalised one, not the raw book number.
  const withOverround = rows.filter((r) => typeof r.overround === "number");
  assert.ok(withOverround.length > 0, "overround must be retained so the de-vig is auditable");
  const meanOverround = withOverround.reduce((a, r) => a + r.overround, 0) / withOverround.length;
  assert.ok(meanOverround > 1.02, `book probabilities should carry a hold, got ${meanOverround}`);
  for (const r of rows.slice(0, 200)) {
    assert.ok(r.q > 0 && r.q < 1, "de-vigged probability out of range");
    assert.ok(r.y === 0 || r.y === 1, "outcome must be binary");
  }
});

test("outcome casing is normalised — a case mismatch must not silently empty the population", () => {
  // The ledger writes "Win"/"Loss"; the calibration export writes "win"/"loss". This caught a real
  // empty-population bug during Sprint 047.
  const rows = loadRows();
  const wins = rows.filter((r) => r.y === 1).length;
  assert.ok(wins > 0 && wins < rows.length, `population looks degenerate: ${wins}/${rows.length}`);
});
