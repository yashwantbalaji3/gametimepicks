/**
 * SPRINT 057 — preregistered model-improvement experiments.
 *
 * Sprint 056 established two facts about the MLB prop model on 21,633 settled, de-vigged,
 * market-paired rows: it is ~9pp overconfident in aggregate, and its error GROWS with distance
 * from even money (5.86pp near 50% vs 26.84pp far) — the signature of understated simulation
 * variance rather than a constant bias. This script asks the follow-up question the right way:
 * which correction, fitted only on the past, actually helps on a future window it never saw?
 *
 * THE RULES (same discipline as audit-model-edge):
 *   · every experiment is declared UP FRONT in EXPERIMENTS, with its hypothesis and decision
 *     criterion written down before any of them was scored;
 *   · all parameters are fitted on the TRAIN window only and judged on the TEST window;
 *   · the market baseline is de-vigged (loadRows already divides by the overround);
 *   · negative results are reported in full, not dropped.
 *
 * None of this modifies the production model. It produces evidence for a decision, not a deploy.
 *
 * Read-only. Usage: npx tsx scripts/model-experiments.mjs [--json f] [--self-test]
 */
import fs from "node:fs";

import { loadRows, fitPlattParams, plattFromParams } from "./model-learning-audit.mjs";

const clip = (p, eps = 1e-6) => Math.min(1 - eps, Math.max(eps, p));
const mean = (xs) => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : null);
const brier = (rows, pick) => (rows.length ? rows.reduce((a, r) => a + (pick(r) - r.y) ** 2, 0) / rows.length : null);
const logLoss = (rows, pick) =>
  rows.length
    ? rows.reduce((a, r) => {
        const p = clip(pick(r));
        return a - (r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
      }, 0) / rows.length
    : null;
const logit = (p) => Math.log(clip(p) / (1 - clip(p)));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// ── normal distribution ─────────────────────────────────────────────────────────

/** Standard normal CDF (Abramowitz–Stegun 26.2.17, |err| < 7.5e-8). */
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const poly = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - poly : poly;
}

/** Inverse standard normal CDF (Acklam's rational approximation, |rel err| < 1.15e-9). */
export function normInv(p) {
  const pp = clip(p, 1e-12);
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  if (pp < plow) {
    const q = Math.sqrt(-2 * Math.log(pp));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (pp <= 1 - plow) {
    const q = pp - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - pp));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

// ── probability transforms ──────────────────────────────────────────────────────

/**
 * Variance expansion in z-space. If the simulation reports p = Φ(z) but its σ is understated by a
 * factor k, the honest probability is Φ(z/k): the correction shrinks EXTREME probabilities far more
 * than near-even ones, which is exactly the error signature Sprint 056 measured. A linear shrink
 * cannot reproduce that shape — comparing the two is the point of running both.
 */
export const varianceExpand = (k) => (p) => normCdf(normInv(clip(p)) / k);

/** Linear shrink toward the coin flip: p' = 0.5 + λ(p − 0.5). The "constant offset" alternative. */
export const linearShrink = (lambda) => (p) => 0.5 + lambda * (clip(p) - 0.5);

/** Convex blend of a model probability with the de-vigged market probability. */
export const blend = (w) => (p, q) => w * clip(p) + (1 - w) * clip(q);

// ── fitting (train window only) ─────────────────────────────────────────────────

function gridFit(train, candidates, makePick) {
  let best = null;
  for (const v of candidates) {
    const pick = makePick(v);
    const score = brier(train, pick);
    if (best === null || score < best.score) best = { value: v, score };
  }
  return best.value;
}

const K_GRID = Array.from({ length: 61 }, (_, i) => 1 + i * 0.05); // 1.00 … 4.00
const L_GRID = Array.from({ length: 51 }, (_, i) => i * 0.02); // 0.00 … 1.00
const W_GRID = Array.from({ length: 51 }, (_, i) => i * 0.02); // 0.00 … 1.00

/** Minimum train rows before a market gets its own variance factor instead of the global one. */
const MIN_MARKET_TRAIN_ROWS = 500;

/**
 * Two-feature logistic regression y ~ b0 + b1·logit(q) [+ b2·logit(p)], the standard test of whether
 * the model carries ANY information the market does not already price. Same plain gradient descent
 * as fitPlattParams, so there is no new numerics to trust.
 */
export function fitLogistic(train, useModel, { iterations = 4000, lr = 0.1 } = {}) {
  const xq = train.map((r) => logit(r.q));
  const xp = train.map((r) => logit(r.p));
  let b0 = 0;
  let b1 = 1;
  let b2 = 0;
  for (let it = 0; it < iterations; it += 1) {
    let g0 = 0;
    let g1 = 0;
    let g2 = 0;
    for (let i = 0; i < train.length; i += 1) {
      const z = b0 + b1 * xq[i] + (useModel ? b2 * xp[i] : 0);
      const e = sigmoid(z) - train[i].y;
      g0 += e;
      g1 += e * xq[i];
      if (useModel) g2 += e * xp[i];
    }
    b0 -= (lr * g0) / train.length;
    b1 -= (lr * g1) / train.length;
    if (useModel) b2 -= (lr * g2) / train.length;
  }
  const predict = (r) => sigmoid(b0 + b1 * logit(r.q) + (useModel ? b2 * logit(r.p) : 0));
  return { b0, b1, b2, predict };
}

// ── temporal split ──────────────────────────────────────────────────────────────

/** Same 70% temporal split as the calibration backtest; a shuffled split would leak slates. */
export function temporalSplit(rows, fraction = 0.7) {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const target = Math.floor(rows.length * fraction);
  let seen = 0;
  let split = dates[dates.length - 1];
  for (const d of dates) {
    seen += rows.filter((r) => r.date === d).length;
    if (seen >= target) { split = d; break; }
  }
  return { train: rows.filter((r) => r.date < split), test: rows.filter((r) => r.date >= split), split };
}

// ── preregistered experiments ───────────────────────────────────────────────────

/**
 * Declared before any was scored. Adding one after seeing results, or dropping one that embarrasses
 * the model, turns this back into data dredging. Each returns { params, predict } from fit(train).
 */
export const EXPERIMENTS = [
  {
    id: "variance-global",
    label: "global variance expansion Φ(z/k)",
    hypothesis: "Simulation σ is understated by a roughly constant factor; one global k fixes the tails more than the middle.",
    fit(train) {
      const k = gridFit(train, K_GRID, (k) => (r) => varianceExpand(k)(r.p));
      return { params: { k }, predict: (r) => varianceExpand(k)(r.p) };
    },
  },
  {
    id: "variance-per-market",
    label: "per-market variance expansion",
    hypothesis: "Overconfidence differs by market (6.7pp hits vs 15.1pp strikeouts), so σ understatement is market-specific.",
    fit(train) {
      const global = gridFit(train, K_GRID, (k) => (r) => varianceExpand(k)(r.p));
      const byMarket = {};
      for (const m of [...new Set(train.map((r) => r.market))]) {
        const sub = train.filter((r) => r.market === m);
        byMarket[m] = sub.length >= MIN_MARKET_TRAIN_ROWS ? gridFit(sub, K_GRID, (k) => (r) => varianceExpand(k)(r.p)) : global;
      }
      return {
        params: { global, byMarket },
        predict: (r) => varianceExpand(byMarket[r.market] ?? global)(r.p),
      };
    },
  },
  {
    id: "shrink-linear",
    label: "linear shrink toward 50%",
    hypothesis: "Null alternative: overconfidence is a flat offset. If z-space expansion wins held-out, the problem is variance, not bias.",
    fit(train) {
      const lambda = gridFit(train, L_GRID, (l) => (r) => linearShrink(l)(r.p));
      return { params: { lambda }, predict: (r) => linearShrink(lambda)(r.p) };
    },
  },
  {
    id: "platt",
    label: "Platt scaling (Sprint 047/048 baseline)",
    hypothesis: "Reproduces the adopted calibrator inside this framework so every experiment is judged on identical rows.",
    fit(train) {
      const params = fitPlattParams(train);
      const f = plattFromParams(params);
      return { params: { a: params.a, b: params.b }, predict: (r) => f(r.p) };
    },
  },
  {
    id: "variance-then-platt",
    label: "variance expansion, then Platt",
    hypothesis: "Interaction test: expansion fixes the tail shape, Platt mops up any remaining affine miscalibration.",
    fit(train) {
      const k = gridFit(train, K_GRID, (k) => (r) => varianceExpand(k)(r.p));
      const ve = varianceExpand(k);
      const params = fitPlattParams(train.map((r) => ({ ...r, p: ve(r.p) })));
      const f = plattFromParams(params);
      return { params: { k, a: params.a, b: params.b }, predict: (r) => f(ve(r.p)) };
    },
  },
  {
    id: "blend-raw",
    label: "blend raw model with market",
    hypothesis: "If the raw model carries signal the market lacks, the fitted weight w is materially above 0; if w ≈ 0 the model adds nothing.",
    fit(train) {
      const w = gridFit(train, W_GRID, (w) => (r) => blend(w)(r.p, r.q));
      return { params: { w }, predict: (r) => blend(w)(r.p, r.q) };
    },
  },
  {
    id: "blend-corrected",
    label: "blend variance-corrected model with market",
    hypothesis: "Overconfidence may mask real signal: correcting variance first should raise the useful blend weight if signal exists.",
    fit(train) {
      const k = gridFit(train, K_GRID, (k) => (r) => varianceExpand(k)(r.p));
      const ve = varianceExpand(k);
      const w = gridFit(train, W_GRID, (w) => (r) => blend(w)(ve(r.p), r.q));
      return { params: { k, w }, predict: (r) => blend(w)(ve(r.p), r.q) };
    },
  },
  {
    id: "incremental-signal",
    label: "logistic: market + model vs market alone",
    hypothesis: "The decisive strategic question: does adding logit(p) to a market-only logistic model improve held-out log loss at all?",
    fit(train) {
      const marketOnly = fitLogistic(train, false);
      const withModel = fitLogistic(train, true);
      return {
        params: { marketOnly: { b0: marketOnly.b0, b1: marketOnly.b1 }, withModel: { b0: withModel.b0, b1: withModel.b1, b2: withModel.b2 } },
        predict: (r) => withModel.predict(r),
        baselinePredict: (r) => marketOnly.predict(r),
      };
    },
  },
];

// ── preregistered decision criteria ─────────────────────────────────────────────

/**
 * Margins declared up front:
 *   OUTPERFORMS_MARKET  test Brier at least 0.0010 below the de-vigged market — the only verdict
 *                       that would justify a prediction-engine direction;
 *   MATCHES_MARKET      within ±0.0010 of the market (a blend that just returns the market lands
 *                       here by construction — that is a finding about the model, not a win);
 *   HONESTY_GAIN        at least 0.0020 below the RAW model but not better than the market —
 *                       worth adopting for stated-probability honesty only;
 *   REJECT              everything else.
 */
export function verdict({ testBrier, marketBrier, rawBrier }) {
  if (testBrier <= marketBrier - 0.001) return "OUTPERFORMS_MARKET";
  if (Math.abs(testBrier - marketBrier) < 0.001) return "MATCHES_MARKET";
  if (testBrier <= rawBrier - 0.002) return "HONESTY_GAIN";
  return "REJECT";
}

// ── run ─────────────────────────────────────────────────────────────────────────

export function runExperiments(rows) {
  const { train, test, split } = temporalSplit(rows);
  const rawBrier = brier(test, (r) => r.p);
  const marketBrier = brier(test, (r) => r.q);
  const baselines = {
    split,
    trainRows: train.length,
    testRows: test.length,
    raw: { brier: rawBrier, logLoss: logLoss(test, (r) => r.p), meanPredicted: mean(test.map((r) => r.p)) },
    market: { brier: marketBrier, logLoss: logLoss(test, (r) => r.q), meanPredicted: mean(test.map((r) => r.q)) },
    observed: mean(test.map((r) => r.y)),
  };

  const results = EXPERIMENTS.map((e) => {
    const fitted = e.fit(train);
    const testBrier = brier(test, fitted.predict);
    const out = {
      id: e.id,
      label: e.label,
      hypothesis: e.hypothesis,
      params: fitted.params,
      testBrier,
      testLogLoss: logLoss(test, fitted.predict),
      meanPredicted: mean(test.map(fitted.predict)),
      verdict: verdict({ testBrier, marketBrier, rawBrier }),
    };
    // The incremental-signal experiment is judged on its own axis: with-model minus market-only.
    if (fitted.baselinePredict) {
      out.marketOnlyLogLoss = logLoss(test, fitted.baselinePredict);
      out.logLossDelta = out.marketOnlyLogLoss - out.testLogLoss; // positive → model adds information
      out.incrementalSignal = out.logLossDelta > 0.001;
    }
    return out;
  });

  return { baselines, results };
}

// ── self-test ───────────────────────────────────────────────────────────────────

/** Deterministic PRNG (mulberry32) so the self-test never flakes. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticDates(n, perDay) {
  const dates = [];
  for (let i = 0; i < n; i += 1) {
    const d = `2026-06-${String(Math.floor(i / perDay) + 1).padStart(2, "0")}`;
    dates.push(d);
  }
  return dates;
}

export function selfTest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // Transform sanity.
  ok(Math.abs(varianceExpand(1)(0.7) - 0.7) < 1e-6, "k=1 variance expansion must be the identity");
  ok(varianceExpand(2)(0.8) < 0.8 && varianceExpand(2)(0.8) > 0.5, "k>1 must pull a high p toward 0.5");
  ok(varianceExpand(2)(0.2) > 0.2 && varianceExpand(2)(0.2) < 0.5, "k>1 must pull a low p toward 0.5");
  ok(Math.abs(linearShrink(0)(0.9) - 0.5) < 1e-9 && Math.abs(linearShrink(1)(0.9) - 0.9) < 1e-9, "shrink endpoints");
  ok(Math.abs(normCdf(normInv(0.73)) - 0.73) < 1e-4, "normInv/normCdf must round-trip");

  // Experiments must be preregistered, unique, and hypothesised.
  ok(EXPERIMENTS.length >= 6, "too few preregistered experiments");
  ok(new Set(EXPERIMENTS.map((e) => e.id)).size === EXPERIMENTS.length, "experiment ids must be unique");
  ok(EXPERIMENTS.every((e) => typeof e.hypothesis === "string" && e.hypothesis.length > 20), "every experiment needs a written hypothesis");

  // Case 1 — a synthetic model whose σ is understated 2× : variance expansion must recover k≈2 and
  // repair the Brier gap out-of-sample.
  {
    const r = rng(57);
    const n = 12000;
    const dates = syntheticDates(n, 400);
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      const zTrue = (r() + r() + r() + r() - 2) * Math.sqrt(3); // approx N(0,1)
      const pTrue = clip(normCdf(zTrue * 0.8));
      const pModel = clip(normCdf(zTrue * 0.8 * 2)); // z doubled → overconfident with kTrue = 2
      rows.push({ date: dates[i], market: "batter_hits", p: pModel, q: pTrue, y: r() < pTrue ? 1 : 0 });
    }
    const { baselines, results } = runExperiments(rows);
    const ve = results.find((x) => x.id === "variance-global");
    ok(ve.params.k > 1.6 && ve.params.k < 2.5, `variance expansion must recover k≈2 (got ${ve.params.k})`);
    ok(ve.testBrier < baselines.raw.brier - 0.005, "variance expansion must repair an overconfident model held-out");
    const sh = results.find((x) => x.id === "shrink-linear");
    ok(ve.testBrier <= sh.testBrier + 1e-4, "on a variance-shaped defect, z-space expansion must not lose to linear shrink");
  }

  // Case 2 — a model that is market plus zero-mean noise: nothing may claim OUTPERFORMS_MARKET, and
  // the blend must discover the model deserves little weight.
  {
    const r = rng(58);
    const n = 12000;
    const dates = syntheticDates(n, 400);
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      const q = clip(0.5 + (r() - 0.5) * 0.5);
      const pModel = clip(q + (r() - 0.5) * 0.12);
      rows.push({ date: dates[i], market: "batter_hits", p: pModel, q, y: r() < q ? 1 : 0 });
    }
    const { results } = runExperiments(rows);
    ok(results.every((x) => x.verdict !== "OUTPERFORMS_MARKET"), "a no-signal model must never be reported as out-predicting the market");
    const bl = results.find((x) => x.id === "blend-raw");
    ok(bl.params.w <= 0.4, `a noise model must not earn a large blend weight (got ${bl.params.w})`);
    const inc = results.find((x) => x.id === "incremental-signal");
    ok(!inc.incrementalSignal, "a noise model must not register incremental signal");
  }

  // Case 3 — a model that genuinely knows something the market does not: the incremental-signal
  // experiment must detect it.
  {
    const r = rng(59);
    const n = 12000;
    const dates = syntheticDates(n, 400);
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      const q = clip(0.5 + (r() - 0.5) * 0.3);
      const s = r() < 0.5 ? 0.1 : -0.1; // information the market has not priced
      const pTrue = clip(q + s);
      rows.push({ date: dates[i], market: "batter_hits", p: pTrue, q, y: r() < pTrue ? 1 : 0 });
    }
    const { results } = runExperiments(rows);
    const inc = results.find((x) => x.id === "incremental-signal");
    ok(inc.incrementalSignal === true, "a genuinely informative model must register incremental signal");
    const bl = results.find((x) => x.id === "blend-raw");
    ok(bl.params.w >= 0.5, `an informative model must earn a large blend weight (got ${bl.params.w})`);
  }

  return fails;
}

// ── main ────────────────────────────────────────────────────────────────────────

const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

function main() {
  if (process.argv.includes("--self-test")) {
    const f = selfTest();
    if (f.length) { console.error(`SELF-TEST FAILED:\n  ${f.join("\n  ")}`); process.exit(1); }
    console.log("self-test ok — recovers a synthetic variance defect, refuses a noise model, detects real incremental signal");
    return;
  }

  const rows = loadRows();
  if (!rows.length) { console.error("no settled rows found — run from app/ with boards + ledger present"); process.exit(1); }
  const report = runExperiments(rows);
  const { baselines, results } = report;

  const f4 = (x) => (x === null || x === undefined ? "—" : x.toFixed(4));
  const pct = (x) => (x === null || x === undefined ? "—" : `${(100 * x).toFixed(2)}%`);

  console.log(`=== model experiments · ${rows.length} rows, split ${baselines.split} (train ${baselines.trainRows} / test ${baselines.testRows}) ===`);
  console.log(`  baselines (test window): raw model Brier ${f4(baselines.raw.brier)} · de-vigged market ${f4(baselines.market.brier)} · observed ${pct(baselines.observed)}\n`);
  console.log(`  experiment                              testBrier  logLoss   meanPred  verdict`);
  for (const r of results) {
    console.log(`  ${r.label.padEnd(40).slice(0, 40)}  ${f4(r.testBrier)}    ${f4(r.testLogLoss)}   ${pct(r.meanPredicted).padStart(7)}  ${r.verdict}`);
  }
  const inc = results.find((r) => r.id === "incremental-signal");
  if (inc) {
    console.log(`\n  incremental signal: market-only log loss ${f4(inc.marketOnlyLogLoss)} vs +model ${f4(inc.testLogLoss)} (delta ${f4(inc.logLossDelta)}) → ${inc.incrementalSignal ? "the model ADDS information beyond the market" : "the model adds NO information beyond the market"}`);
    console.log(`  fitted coefficient on logit(model): ${inc.params.withModel.b2.toFixed(4)}`);
  }
  const params = results.filter((r) => r.params?.k || r.params?.w !== undefined || r.params?.lambda !== undefined);
  console.log(`\n  fitted parameters (train window only):`);
  for (const r of params) console.log(`    ${r.id}: ${JSON.stringify(r.params)}`);

  const best = [...results].sort((a, b) => a.testBrier - b.testBrier)[0];
  console.log(`\n  best held-out scorer: ${best.id} (Brier ${f4(best.testBrier)}) vs market ${f4(baselines.market.brier)}`);

  const json = arg("--json");
  if (json) { fs.writeFileSync(json, JSON.stringify(report, null, 2)); console.log(`  wrote ${json}`); }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
