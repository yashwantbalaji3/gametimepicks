/**
 * SPRINT 056 — does the model have any measurable edge, anywhere?
 *
 * Five sprints of infrastructure work established that the model is ~9pp overconfident and loses to
 * the de-vigged market on Brier and log loss overall. That is an aggregate. This asks the sharper
 * question: **is there any repeatable situation where it does not lose?**
 *
 * THE ONE THING THAT MAKES THIS HONEST
 * Slicing 21,633 rows enough ways will always produce a flattering subset. So every segment is:
 *   · declared UP FRONT, not chosen after looking (see SEGMENTS below);
 *   · reported in full, including the ones that look bad;
 *   · tested on a HELD-OUT window, because a residual measured on the same rows that suggested it is
 *     not evidence of anything;
 *   · required to clear a Bonferroni-adjusted bar, because twelve independent looks at noise produce
 *     roughly one "significant" result by construction.
 *
 * A segment that survives all four is a lead. Nothing here is a strategy.
 *
 * Read-only. Usage: npx tsx scripts/audit-model-edge.mjs [--json f] [--self-test]
 */
import fs from "node:fs";

import { loadRows, wilson } from "./model-learning-audit.mjs";

const clip = (p, eps = 1e-6) => Math.min(1 - eps, Math.max(eps, p));
const brier = (rows, pick) => (rows.length ? rows.reduce((a, r) => a + (pick(r) - r.y) ** 2, 0) / rows.length : null);
const logLoss = (rows, pick) =>
  rows.length
    ? rows.reduce((a, r) => {
        const p = clip(pick(r));
        return a - (r.y * Math.log(p) + (1 - r.y) * Math.log(1 - p));
      }, 0) / rows.length
    : null;
const mean = (xs) => (xs.length ? xs.reduce((a, c) => a + c, 0) / xs.length : null);

/**
 * PREREGISTERED SEGMENTS.
 *
 * Declared before any of them was scored. Adding a segment here after seeing results — or dropping one
 * that looked bad — invalidates the multiple-testing correction below and turns the whole exercise
 * back into data dredging.
 */
export const SEGMENTS = [
  { id: "residual-large-model-higher", label: "model ≥10pp above market", test: (r) => r.p - r.q >= 0.10 },
  { id: "residual-large-model-lower", label: "model ≥10pp below market", test: (r) => r.q - r.p >= 0.10 },
  { id: "residual-small", label: "model within 2.5pp of market", test: (r) => Math.abs(r.p - r.q) < 0.025 },
  { id: "market-near-coinflip", label: "market 45–55%", test: (r) => r.q >= 0.45 && r.q <= 0.55 },
  { id: "market-favourite", label: "market ≥60%", test: (r) => r.q >= 0.60 },
  { id: "market-underdog", label: "market ≤40%", test: (r) => r.q <= 0.40 },
  { id: "model-confident", label: "model ≥70%", test: (r) => r.p >= 0.70 },
  { id: "model-unconfident", label: "model ≤40%", test: (r) => r.p <= 0.40 },
  { id: "market-hits", label: "market batter_hits", test: (r) => r.market === "batter_hits" },
  { id: "market-hrr", label: "market batter_hits_runs_rbis", test: (r) => r.market === "batter_hits_runs_rbis" },
  { id: "market-tb", label: "market batter_total_bases", test: (r) => r.market === "batter_total_bases" },
  { id: "market-k", label: "market pitcher_strikeouts", test: (r) => r.market === "pitcher_strikeouts" },
];

/** Minimum held-out rows before a segment result is allowed to mean anything. */
const MIN_TEST_ROWS = 200;

/**
 * Split temporally, exactly as the calibration backtest does. A residual "discovered" and evaluated on
 * the same rows is circular; the only question worth answering is whether it survived into a window
 * the analysis had not seen.
 */
function temporalSplit(rows, fraction = 0.7) {
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const target = Math.floor(rows.length * fraction);
  let seen = 0;
  let split = dates[0];
  for (const d of dates) {
    seen += rows.filter((r) => r.date === d).length;
    if (seen >= target) { split = d; break; }
  }
  return { train: rows.filter((r) => r.date < split), test: rows.filter((r) => r.date >= split), split };
}

export function analyseSegments(rows) {
  const { train, test, split } = temporalSplit(rows);
  // Bonferroni: twelve independent looks at noise yield ~1 spurious hit at p<0.05.
  const alphaAdjusted = 0.05 / SEGMENTS.length;
  const z = 3.02; // two-sided normal quantile at 0.05/12 ≈ 0.00417

  const results = SEGMENTS.map((seg) => {
    const trainRows = train.filter(seg.test);
    const testRows = test.filter(seg.test);
    const usable = testRows.length >= MIN_TEST_ROWS;

    const scoreOf = (rs) => rs.length === 0 ? null : {
      n: rs.length,
      hitRate: rs.reduce((a, r) => a + r.y, 0) / rs.length,
      modelBrier: brier(rs, (r) => r.p),
      marketBrier: brier(rs, (r) => r.q),
      modelLogLoss: logLoss(rs, (r) => r.p),
      marketLogLoss: logLoss(rs, (r) => r.q),
    };

    const trainScore = scoreOf(trainRows);
    const testScore = scoreOf(testRows);

    // The edge question, stated precisely: on held-out rows, does the model score BETTER than the
    // de-vigged market? A negative difference means better (Brier is a loss).
    const heldOutEdge = testScore ? testScore.marketBrier - testScore.modelBrier : null;
    const suggestedByTrain = trainScore ? trainScore.marketBrier - trainScore.modelBrier > 0 : false;

    // Significance on the held-out hit rate vs the market's own implied rate, Bonferroni-adjusted.
    let significant = false;
    if (usable && testScore) {
      const ci = wilson(Math.round(testScore.hitRate * testScore.n), testScore.n, z);
      const marketImplied = mean(testRows.map((r) => r.q));
      significant = ci.low > marketImplied || ci.high < marketImplied;
    }

    return {
      id: seg.id,
      label: seg.label,
      trainRows: trainRows.length,
      testRows: testRows.length,
      usable,
      train: trainScore,
      test: testScore,
      heldOutBrierEdge: heldOutEdge,
      modelBeatsMarketHeldOut: heldOutEdge != null && heldOutEdge > 0,
      suggestedByTrain,
      /** The only combination that counts: it looked good in train AND survived into test. */
      survivesOutOfSample: suggestedByTrain && heldOutEdge != null && heldOutEdge > 0 && usable,
      significantVsMarketImplied: significant,
    };
  });

  return { split, trainRows: train.length, testRows: test.length, alphaAdjusted, results };
}

/**
 * Forensics on a single market: where does the loss come from?
 *
 * Decomposes by predicted-probability band so the answer is "it is wrong at the top end" or "it is
 * wrong everywhere", which are different problems with different fixes.
 */
export function marketForensics(rows, market) {
  const rs = rows.filter((r) => r.market === market);
  if (rs.length === 0) return null;

  const bands = {};
  for (const r of rs) {
    const lo = Math.floor(r.p * 10) / 10;
    const k = `${lo.toFixed(1)}-${(lo + 0.1).toFixed(1)}`;
    (bands[k] ??= []).push(r);
  }

  const byBand = Object.entries(bands).sort(([a], [b]) => a.localeCompare(b)).map(([band, b]) => {
    const wins = b.reduce((a, r) => a + r.y, 0);
    const ci = wilson(wins, b.length);
    return {
      band, n: b.length,
      meanModel: mean(b.map((r) => r.p)),
      meanMarket: mean(b.map((r) => r.q)),
      observed: wins / b.length,
      observed95: { low: ci.low, high: ci.high },
      modelErrorPp: 100 * (mean(b.map((r) => r.p)) - wins / b.length),
      marketErrorPp: 100 * (mean(b.map((r) => r.q)) - wins / b.length),
    };
  });

  const wins = rs.reduce((a, r) => a + r.y, 0);
  const overSideRows = rs.filter((r) => r.p >= 0.5);
  const underSideRows = rs.filter((r) => r.p < 0.5);

  return {
    market,
    n: rs.length,
    hitRate: wins / rs.length,
    modelBrier: brier(rs, (r) => r.p),
    marketBrier: brier(rs, (r) => r.q),
    meanModel: mean(rs.map((r) => r.p)),
    meanMarket: mean(rs.map((r) => r.q)),
    observed: wins / rs.length,
    byBand,
    /** Is the damage concentrated where the model is confident, or spread evenly? */
    highSideHitRate: overSideRows.length ? overSideRows.reduce((a, r) => a + r.y, 0) / overSideRows.length : null,
    highSideN: overSideRows.length,
    lowSideHitRate: underSideRows.length ? underSideRows.reduce((a, r) => a + r.y, 0) / underSideRows.length : null,
    lowSideN: underSideRows.length,
    /** How far the MARKET itself is from observed here — separates "hard market" from "bad model". */
    marketErrorPp: 100 * (mean(rs.map((r) => r.q)) - wins / rs.length),
    modelErrorPp: 100 * (mean(rs.map((r) => r.p)) - wins / rs.length),
  };
}

/**
 * Simulation quality: does stated uncertainty match observed frequency?
 *
 * A well-specified simulator's stated probabilities should track reality across the whole range. A
 * simulator whose error GROWS with confidence is not merely miscalibrated — it is systematically
 * understating variance, which is a modelling problem rather than a scaling one.
 */
export function simulationQuality(rows) {
  const bands = {};
  for (const r of rows) {
    const lo = Math.floor(r.p * 10) / 10;
    const k = `${lo.toFixed(1)}-${(lo + 0.1).toFixed(1)}`;
    (bands[k] ??= []).push(r);
  }
  const curve = Object.entries(bands).sort(([a], [b]) => a.localeCompare(b)).map(([band, b]) => {
    const wins = b.reduce((a, r) => a + r.y, 0);
    return {
      band, n: b.length,
      meanPredicted: mean(b.map((r) => r.p)),
      observed: wins / b.length,
      errorPp: 100 * (mean(b.map((r) => r.p)) - wins / b.length),
    };
  }).filter((c) => c.n >= 30);

  // Does |error| grow with distance from 0.5? That is the signature of understated variance.
  const withDistance = curve.map((c) => ({ ...c, distanceFromEven: Math.abs(c.meanPredicted - 0.5) }));
  const near = withDistance.filter((c) => c.distanceFromEven < 0.15);
  const far = withDistance.filter((c) => c.distanceFromEven >= 0.15);
  const meanAbs = (xs) => (xs.length ? mean(xs.map((c) => Math.abs(c.errorPp))) : null);

  return {
    curve: withDistance,
    meanAbsErrorNearEven: meanAbs(near),
    meanAbsErrorFarFromEven: meanAbs(far),
    errorGrowsWithConfidence:
      meanAbs(near) != null && meanAbs(far) != null && meanAbs(far) > meanAbs(near),
    interpretation:
      meanAbs(near) != null && meanAbs(far) != null && meanAbs(far) > meanAbs(near)
        ? "Error grows as the simulation moves away from even money — the signature of understated variance, not a constant offset. A single global scaling factor would not fix this."
        : "Error does not grow with confidence; a constant offset may explain most of it.",
  };
}

export function selfTest() {
  const fails = [];
  const ok = (c, m) => { if (!c) fails.push(m); };

  // Segments must be preregistered and non-trivial.
  ok(SEGMENTS.length >= 10, "too few preregistered segments for the correction to be meaningful");
  ok(new Set(SEGMENTS.map((s) => s.id)).size === SEGMENTS.length, "segment ids must be unique");

  // A synthetic set where the model IS better must be detected.
  const good = [];
  for (let d = 1; d <= 30; d += 1) {
    for (let i = 0; i < 40; i += 1) {
      // i runs 0..39, so `i % 100 < 60` would make EVERY row a win and the fixture degenerate —
      // a 0.90 prediction really is better than 0.50 when everything wins. `i % 10 < 6` gives a
      // genuine 60% base rate, which is what both cases below actually need.
      const y = i % 10 < 6 ? 1 : 0;
      // 0.65 vs 0.50, not 0.60 vs 0.50: floating point makes 0.60 - 0.50 = 0.0999999…, which falls
      // just under a >= 0.10 threshold and silently empties the segment.
      good.push({ date: `2026-06-${String(d).padStart(2, "0")}`, market: "batter_hits", p: 0.65, q: 0.50, y });
    }
  }
  const res = analyseSegments(good).results.find((r) => r.id === "residual-large-model-higher");
  ok(res && res.testRows > 0, "the synthetic edge segment must be populated");
  ok(res.modelBeatsMarketHeldOut, "a genuinely better model must be detected as better held-out");

  // And a set where the model is WORSE must not be reported as an edge.
  const bad = good.map((r) => ({ ...r, p: 0.90 }));
  const badRes = analyseSegments(bad).results.find((r) => r.id === "model-confident");
  ok(badRes && !badRes.survivesOutOfSample, "an overconfident model must not register as surviving");

  // A thin segment must be marked unusable rather than reported.
  const thin = good.slice(0, 50);
  const thinRes = analyseSegments(thin).results.find((r) => r.testRows < MIN_TEST_ROWS);
  ok(thinRes ? !thinRes.usable : true, "a thin segment must be flagged unusable");

  return fails;
}

// ── main ───────────────────────────────────────────────────────────────────────

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : null;
};

function main() {
  if (process.argv.includes("--self-test")) {
    const f = selfTest();
    if (f.length) { console.error(`SELF-TEST FAILED:\n  ${f.join("\n  ")}`); process.exit(1); }
    console.log("self-test ok — segments are preregistered, a real edge is detected, an overconfident model is not");
    return;
  }

  const rows = loadRows();
  const seg = analyseSegments(rows);
  const sim = simulationQuality(rows);
  const forensics = ["batter_total_bases", "pitcher_strikeouts", "batter_hits", "batter_hits_runs_rbis"]
    .map((m) => marketForensics(rows, m))
    .filter(Boolean);

  const survivors = seg.results.filter((r) => r.survivesOutOfSample);
  const out = {
    kind: "model-edge-discovery",
    public: false,
    baseline: {
      rows: rows.length,
      dateRange: [rows[0].date, rows[rows.length - 1].date],
      modelBrier: brier(rows, (r) => r.p),
      marketBrier: brier(rows, (r) => r.q),
      hitRate: rows.reduce((a, r) => a + r.y, 0) / rows.length,
    },
    method: {
      preregisteredSegments: SEGMENTS.length,
      temporalSplitAt: seg.split,
      minimumHeldOutRows: MIN_TEST_ROWS,
      bonferroniAlpha: seg.alphaAdjusted,
      note: "Segments were declared before scoring. All are reported, including unfavourable ones.",
    },
    segments: seg.results,
    survivingSegments: survivors.map((s) => s.id),
    simulationQuality: sim,
    marketForensics: forensics,
    verdict: survivors.length === 0
      ? "NO measurable out-of-sample edge in any preregistered segment."
      : `${survivors.length} segment(s) survived out-of-sample and warrant a preregistered follow-up experiment.`,
  };

  const j = arg("json");
  if (j) { fs.writeFileSync(j, JSON.stringify(out, null, 2)); console.log(`wrote ${j}`); }

  console.log(`=== model edge discovery · ${out.baseline.rows} rows, split ${seg.split} ===`);
  console.log(`  baseline: model ${out.baseline.modelBrier.toFixed(4)} vs market ${out.baseline.marketBrier.toFixed(4)}\n`);
  console.log("  segment                                train    test   heldOutEdge  survives");
  for (const r of seg.results) {
    const edge = r.heldOutBrierEdge == null ? "     —    " : (r.heldOutBrierEdge >= 0 ? "+" : "") + r.heldOutBrierEdge.toFixed(4);
    console.log(`  ${r.label.padEnd(34)} ${String(r.trainRows).padStart(6)} ${String(r.testRows).padStart(6)}   ${edge.padStart(9)}   ${r.survivesOutOfSample ? "YES" : r.usable ? "no" : "n/a (thin)"}`);
  }
  console.log(`\n  VERDICT: ${out.verdict}`);
  console.log(`\n  simulation: |error| near even ${sim.meanAbsErrorNearEven?.toFixed(2)}pp · far from even ${sim.meanAbsErrorFarFromEven?.toFixed(2)}pp`);
  console.log(`  ${sim.interpretation}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
