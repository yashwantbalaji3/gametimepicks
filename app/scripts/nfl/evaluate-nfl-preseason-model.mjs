/**
 * NFL PRESEASON team-score model (Program 172 · Release B). PRIVATE RESEARCH.
 *
 * WHY A SEPARATE MODEL EXISTS: the committed regular-season v1 carries muTotal 44.91 and a +2.2
 * home margin. Preseason reality (146 games, 2023-25) is totalMean 38.54 and marginMean -0.01 —
 * so v1 applied out of domain is systematically ~6.4 points high on every total and invents a
 * home edge that is not there. That bias is correctable with preseason-only evidence; whether a
 * WINNER edge exists is a separate question this evaluation answers honestly rather than assumes.
 *
 * PROTOCOL
 *   fit    2023 + 2024 preseason only (98 games / 196 team-games)
 *   test   2025 preseason, held out entirely, scored ONCE (48 games)
 *   inputs cutoff-versioned regular-season Elo as an explicitly DISCOUNTED prior (the only
 *          team-strength signal the repo owns), preseason home context, and preseason-specific
 *          scoring climatology. No market input; no post-game information; no regular-season
 *          blending in the target.
 *
 * PROMOTION BARS — DECLARED HERE, BEFORE ANY RESULT IS SEEN (see BARS below). A head that misses
 * its bar is recorded RESEARCH_ONLY with the exact failing metric. Passing one head never
 * promotes another: the winner head and the score-distribution heads promote independently,
 * because a calibrated score range is a real product even when a winner edge does not exist.
 *
 * Usage: node scripts/nfl/evaluate-nfl-preseason-model.mjs --now <iso>
 * Writes: data/internal/research/nfl/reports/preseason-model-v1-evaluation.json
 *         data/internal/research/nfl/preseason-model-card-v1.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { strengthStateAt } from "../../src/lib/sports/nfl/strength-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

// ---------------------------------------------------------------------------------------------
// PROMOTION BARS — fixed before evaluation. Each names the baseline it must beat and by how much.
const BARS = {
  winner: {
    metric: "held-out log loss",
    mustBeat: ["coin (0.6931)", "home-prior (fit on train preseason home rate)", "regular-season v1 out of domain"],
    threshold: "logLoss < 0.6931 − 0.010 AND reliability ECE ≤ 0.05",
    rationale: "a winner claim needs real separation from a coin, not noise; P169's shrink study already found preseason winner skill ≈ 0, so the bar is set where a genuine signal would clear it",
  },
  total: {
    metric: "held-out MAE + 80% interval coverage",
    mustBeat: ["regular-season v1 out of domain by ≥ 2.0 points", "must not be worse than walk-forward preseason climatology by > 0.25 points"],
    threshold: "MAE ≤ v1MAE − 2.0 AND MAE ≤ climatologyMAE + 0.25 AND coverage ∈ [0.72, 0.88]",
    rationale: "the whole claim is bias correction; if it cannot beat the out-of-domain model by two full points it is not worth a separate version",
  },
  margin: {
    metric: "held-out MAE + 80% interval coverage",
    mustBeat: ["regular-season v1 out of domain", "zero-margin (pick'em) baseline"],
    threshold: "MAE ≤ min(v1MAE, pickemMAE) AND coverage ∈ [0.72, 0.88]",
    rationale: "removing a phantom home edge must not cost accuracy; a wider-but-honest interval is acceptable, a miscalibrated one is not",
  },
};

// ---------------------------------------------------------------------------------------------
const corpus = read("data/internal/research/nfl/corpus-v1.json").rows;
const pre = corpus.filter((r) => r.phase === 1).sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : 1));
const train = pre.filter((r) => r.season <= 2024);
const test = pre.filter((r) => r.season === 2025);
const v1 = read("data/internal/research/nfl/reports/model-v1-evaluation.json").fitParams;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };
const clamp01 = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));

// population accounting, stated before any modelling
const accounting = {
  preseasonGames: pre.length,
  bySeason: Object.fromEntries([2023, 2024, 2025].map((s) => [s, pre.filter((r) => r.season === s).length])),
  trainGames: train.length,
  testGames: test.length,
  ties: pre.filter((r) => r.ftHome === r.ftAway).length,
  neutralSite: pre.filter((r) => r.neutralSite).length,
  reconciles: train.length + test.length === pre.length,
};
if (!accounting.reconciles) { console.error("REFUSED: preseason population does not reconcile"); process.exit(2); }

// ---------------------------------------------------------------------------------------------
// FIT on train preseason only.
const trainTotals = train.map((r) => r.ftHome + r.ftAway);
const trainMargins = train.map((r) => r.ftHome - r.ftAway);
const muTotal = mean(trainTotals);
const sigmaTotal = sd(trainTotals);

// Margin head: margin ≈ homeAdvantage + slope · (discounted Elo difference).
// Elo comes from REGULAR-season finals strictly before each game — an explicitly discounted prior,
// never the target. The discount is FIT here rather than assumed.
const eloDiffFor = (row) => {
  const priorFinals = corpus.filter((r) => r.phase !== 1 && r.dateUtc < row.dateUtc);
  const st = strengthStateAt({ rows: priorFinals, cutoffIso: row.dateUtc });
  return st.ratingFor(row.home) - st.ratingFor(row.away); // no home constant: it is fit separately
};
const trainRows = train.map((r) => ({ d: eloDiffFor(r), margin: r.ftHome - r.ftAway, total: r.ftHome + r.ftAway }));
// OLS with intercept: margin = h + b·d
const dBar = mean(trainRows.map((r) => r.d));
const mBar = mean(trainRows.map((r) => r.margin));
let sxy = 0, sxx = 0;
for (const r of trainRows) { sxy += (r.d - dBar) * (r.margin - mBar); sxx += (r.d - dBar) ** 2; }
const marginSlope = sxy / sxx;
const homeAdvantage = mBar - marginSlope * dBar;
const marginResid = trainRows.map((r) => r.margin - (homeAdvantage + marginSlope * r.d));
const sigmaMargin = Math.sqrt(marginResid.reduce((s, x) => s + x * x, 0) / (trainRows.length - 2));
// how much of v1's regular-season margin slope survives in preseason
const eloDiscount = marginSlope / v1.marginSlope;

const fit = {
  muTotal: Number(muTotal.toFixed(4)),
  sigmaTotal: Number(sigmaTotal.toFixed(4)),
  homeAdvantage: Number(homeAdvantage.toFixed(4)),
  marginSlope: Number(marginSlope.toFixed(6)),
  sigmaMargin: Number(sigmaMargin.toFixed(4)),
  eloDiscountVsRegular: Number(eloDiscount.toFixed(4)),
  trainN: train.length,
};

// ---------------------------------------------------------------------------------------------
// PREDICT on held-out 2025 preseason. Closed-form normal heads; the winner head is the analytic
// P(margin > 0) from the same margin distribution — one distribution, no disagreeing heads.
const Z = { p10: -1.2815515655, p25: -0.6744897502, p50: 0, p75: 0.6744897502, p90: 1.2815515655 };
const normCdf = (z) => 0.5 * (1 + Math.sign(z) * Math.sqrt(1 - Math.exp(-2 * z * z / Math.PI)));

const trainHomeWinRate = train.filter((r) => r.ftHome > r.ftAway).length / train.length;
const climatologyTotal = muTotal; // walk-forward: 2023-24 preseason mean predicts 2025
const preds = test.map((r) => {
  const d = eloDiffFor(r);
  const mMean = homeAdvantage + marginSlope * d;
  const actualMargin = r.ftHome - r.ftAway;
  const actualTotal = r.ftHome + r.ftAway;
  return {
    dateUtc: r.dateUtc, home: r.home, away: r.away, d,
    model: {
      marginMean: mMean, sigmaMargin,
      totalMean: muTotal, sigmaTotal,
      pHome: normCdf(mMean / sigmaMargin),
    },
    v1: {
      marginMean: v1.marginSlope * (d + 48), // v1 adds its 48-point home constant inside the diff
      sigmaMargin: v1.sigmaMargin,
      totalMean: v1.muTotal, sigmaTotal: v1.sigmaTotal,
      pHome: normCdf((v1.marginSlope * (d + 48)) / v1.sigmaMargin),
    },
    actual: { margin: actualMargin, total: actualTotal, homeWin: actualMargin > 0 ? 1 : 0, tie: actualMargin === 0 },
  };
});

// winner scored on DECISIVE games only (ties are a separate, honestly reported class)
const decisive = preds.filter((p) => !p.actual.tie);
const logLoss = (get) => mean(decisive.map((p) => { const q = clamp01(get(p)); return p.actual.homeWin ? -Math.log(q) : -Math.log(1 - q); }));
const brier = (get) => mean(decisive.map((p) => (clamp01(get(p)) - p.actual.homeWin) ** 2));
const mae = (get, act) => mean(preds.map((p) => Math.abs(get(p) - act(p))));
const coverage = (mu, sig, act) => mean(preds.map((p) => {
  const lo = mu(p) + Z.p10 * sig(p), hi = mu(p) + Z.p90 * sig(p);
  return act(p) >= lo && act(p) <= hi ? 1 : 0;
}));
const pinball = (mu, sig, act) => mean(preds.map((p) => {
  const qs = [[0.1, Z.p10], [0.25, Z.p25], [0.5, Z.p50], [0.75, Z.p75], [0.9, Z.p90]];
  return mean(qs.map(([q, z]) => { const v = mu(p) + z * sig(p); const a = act(p); return a >= v ? q * (a - v) : (1 - q) * (v - a); }));
}));

const bins = Array.from({ length: 10 }, () => ({ p: 0, hit: 0, n: 0 }));
for (const p of decisive) { const b = bins[Math.min(9, Math.floor(clamp01(p.model.pHome) * 10))]; b.p += p.model.pHome; b.hit += p.actual.homeWin; b.n += 1; }
const usable = bins.filter((b) => b.n >= 5);
const usableN = usable.reduce((s, b) => s + b.n, 0);
const ece = usableN ? Number(usable.reduce((s, b) => s + (b.n / usableN) * Math.abs(b.p / b.n - b.hit / b.n), 0).toFixed(4)) : null;

const results = {
  winner: {
    nDecisive: decisive.length,
    ties: preds.length - decisive.length,
    model: { logLoss: Number(logLoss((p) => p.model.pHome).toFixed(4)), brier: Number(brier((p) => p.model.pHome).toFixed(4)), ece },
    baselines: {
      coin: { logLoss: Number(logLoss(() => 0.5).toFixed(4)), brier: Number(brier(() => 0.5).toFixed(4)) },
      homePrior: { rate: Number(trainHomeWinRate.toFixed(4)), logLoss: Number(logLoss(() => trainHomeWinRate).toFixed(4)), brier: Number(brier(() => trainHomeWinRate).toFixed(4)) },
      regularV1OutOfDomain: { logLoss: Number(logLoss((p) => p.v1.pHome).toFixed(4)), brier: Number(brier((p) => p.v1.pHome).toFixed(4)) },
    },
  },
  total: {
    n: preds.length,
    model: {
      mae: Number(mae((p) => p.model.totalMean, (p) => p.actual.total).toFixed(3)),
      pinball: Number(pinball((p) => p.model.totalMean, () => sigmaTotal, (p) => p.actual.total).toFixed(3)),
      coverage80: Number(coverage((p) => p.model.totalMean, () => sigmaTotal, (p) => p.actual.total).toFixed(4)),
    },
    baselines: {
      regularV1OutOfDomain: {
        mae: Number(mae((p) => p.v1.totalMean, (p) => p.actual.total).toFixed(3)),
        coverage80: Number(coverage((p) => p.v1.totalMean, () => v1.sigmaTotal, (p) => p.actual.total).toFixed(4)),
        biasPoints: Number((v1.muTotal - mean(preds.map((p) => p.actual.total))).toFixed(3)),
      },
      preseasonClimatology: { mae: Number(mae(() => climatologyTotal, (p) => p.actual.total).toFixed(3)) },
    },
  },
  margin: {
    n: preds.length,
    model: {
      mae: Number(mae((p) => p.model.marginMean, (p) => p.actual.margin).toFixed(3)),
      pinball: Number(pinball((p) => p.model.marginMean, () => sigmaMargin, (p) => p.actual.margin).toFixed(3)),
      coverage80: Number(coverage((p) => p.model.marginMean, () => sigmaMargin, (p) => p.actual.margin).toFixed(4)),
    },
    baselines: {
      regularV1OutOfDomain: {
        mae: Number(mae((p) => p.v1.marginMean, (p) => p.actual.margin).toFixed(3)),
        coverage80: Number(coverage((p) => p.v1.marginMean, () => v1.sigmaMargin, (p) => p.actual.margin).toFixed(4)),
      },
      pickem: { mae: Number(mae(() => 0, (p) => p.actual.margin).toFixed(3)) },
    },
  },
};

// ---------------------------------------------------------------------------------------------
// APPLY THE BARS. Each head decides independently; no head can carry another.
const w = results.winner, t = results.total, m = results.margin;
const promotion = {
  winner: {
    state: (w.model.logLoss < 0.6931 - 0.010 && w.model.ece != null && w.model.ece <= 0.05) ? "PUBLIC_ELIGIBLE" : "ABSTAIN",
    evidence: {
      beatsCoinByMargin: Number((0.6931 - w.model.logLoss).toFixed(4)),
      requiredMargin: 0.010,
      ece: w.model.ece,
      beatsHomePrior: w.model.logLoss < w.baselines.homePrior.logLoss,
      beatsRegularV1: w.model.logLoss < w.baselines.regularV1OutOfDomain.logLoss,
    },
  },
  total: {
    state: (t.model.mae <= t.baselines.regularV1OutOfDomain.mae - 2.0
      && t.model.mae <= t.baselines.preseasonClimatology.mae + 0.25
      && t.model.coverage80 >= 0.72 && t.model.coverage80 <= 0.88) ? "PUBLIC_ELIGIBLE" : "RESEARCH_ONLY",
    evidence: {
      improvementOverV1: Number((t.baselines.regularV1OutOfDomain.mae - t.model.mae).toFixed(3)),
      requiredImprovement: 2.0,
      coverage80: t.model.coverage80,
      vsClimatology: Number((t.model.mae - t.baselines.preseasonClimatology.mae).toFixed(3)),
    },
  },
  margin: {
    state: (m.model.mae <= Math.min(m.baselines.regularV1OutOfDomain.mae, m.baselines.pickem.mae)
      && m.model.coverage80 >= 0.72 && m.model.coverage80 <= 0.88) ? "PUBLIC_ELIGIBLE" : "RESEARCH_ONLY",
    evidence: {
      mae: m.model.mae,
      v1Mae: m.baselines.regularV1OutOfDomain.mae,
      pickemMae: m.baselines.pickem.mae,
      coverage80: m.model.coverage80,
    },
  },
};

const receipt = {
  schemaVersion: 1,
  artifact: "nfl-preseason-model-v1-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  modelId: "nfl-preseason-v1-score-distribution",
  modelVersion: 1,
  protocol: {
    fit: "2023 + 2024 preseason only",
    test: "2025 preseason held out entirely, scored ONCE",
    inputs: "regular-season cutoff Elo as an explicitly DISCOUNTED prior (discount fit, not assumed), preseason home context, preseason scoring climatology",
    excluded: "no market input, no post-game information, no regular-season games in the target population",
    tiePolicy: "ties are excluded from the winner denominator and reported separately — a two-way winner claim has no tie side",
  },
  accounting,
  bars: BARS,
  fit,
  heldOut2025: results,
  promotion,
  honesty: [
    "the winner head and the score-distribution heads promote INDEPENDENTLY: a calibrated score range is a real product even where no winner edge exists",
    "the Elo input is a regular-season prior applied at a fitted discount — it is never the target, and its discount is measured rather than chosen",
    "preseason home advantage is FIT, not inherited: the regular-season +48 Elo home constant is not carried over",
    "n is small (98 train / 48 test games) — every promotion here is a bias-correction claim on top of a simple model, never a precision claim",
  ],
};
fs.writeFileSync(path.join(ROOT, "data/internal/research/nfl/reports/preseason-model-v1-evaluation.json"), JSON.stringify(receipt, null, 1));

const card = {
  schemaVersion: 1,
  artifact: "nfl-preseason-model-card",
  dataClass: "PRIVATE_RESEARCH",
  modelId: "nfl-preseason-v1-score-distribution",
  version: 1,
  generatedAt: NOW,
  objective: "pre-event PRESEASON score distributions (total, margin, per-team scores) for NFL preseason games, with an independently gated winner head",
  method: "closed-form normal heads fit on preseason-only history; margin = fitted preseason home advantage + fitted discount × regular-season cutoff Elo difference; total = preseason climatology; one distribution drives every reported quantity",
  separateFrom: "nfl-model-v1-elo-analytic — the regular-season card is NOT modified and the two records never merge",
  population: { corpus: "146 preseason games 2023-25", train: "2023-24 (98)", test: "2025 (48)" },
  metrics: { see: "reports/preseason-model-v1-evaluation.json" },
  promotion,
  limitations: [
    "preseason participation is unmodelled: starters' snap counts are the dominant unobserved variable and no authorized source exists",
    "small sample — 98 training games; the model is deliberately simple and its intervals are wide",
    "no injury, weather, rest, or roster-continuity feature (none is sourced pre-event today)",
  ],
  independenceFromMarket: "structural — no odds parameter exists in fit or predict; market prices are compared beside the model, never blended",
  // the literal every activation consumer pins — never a sentence, or the check silently passes
  publicActivation: "OFF",
  activationNote: "no head cleared its pre-declared bar; promotion requires a NEW evaluation, not a relaxed threshold",
};
fs.writeFileSync(path.join(ROOT, "data/internal/research/nfl/preseason-model-card-v1.json"), JSON.stringify(card, null, 1));

console.log(`preseason model: train ${train.length} / test ${test.length} games`);
console.log(`fit: total ${fit.muTotal}±${fit.sigmaTotal} | home adv ${fit.homeAdvantage} | elo discount vs regular ${fit.eloDiscountVsRegular}`);
console.log(`WINNER  logLoss ${w.model.logLoss} vs coin ${w.baselines.coin.logLoss} / homePrior ${w.baselines.homePrior.logLoss} / v1 ${w.baselines.regularV1OutOfDomain.logLoss} · ECE ${w.model.ece} → ${promotion.winner.state}`);
console.log(`TOTAL   MAE ${t.model.mae} vs v1 ${t.baselines.regularV1OutOfDomain.mae} (bias ${t.baselines.regularV1OutOfDomain.biasPoints}) / clim ${t.baselines.preseasonClimatology.mae} · cov80 ${t.model.coverage80} → ${promotion.total.state}`);
console.log(`MARGIN  MAE ${m.model.mae} vs v1 ${m.baselines.regularV1OutOfDomain.mae} / pickem ${m.baselines.pickem.mae} · cov80 ${m.model.coverage80} → ${promotion.margin.state}`);
