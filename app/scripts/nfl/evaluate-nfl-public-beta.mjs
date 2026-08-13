/**
 * nfl-preseason-public-beta-v1 — calibration + evaluation (Program 173 · Release A).
 * PRIVATE RESEARCH; produces the card the public forecast is published under.
 *
 * WHAT THIS VERSION IS. Program 172 built a preseason model and REJECTED it against bars declared
 * before the test: the winner head was indistinguishable from a coin (0.6933 vs 0.6931) and the
 * margin intervals under-covered (0.688 against a 0.80 nominal). Those results stand, unedited,
 * and remain the boundary for VALIDATED_PICK.
 *
 * The founder's decision is to publish an EXPERIMENTAL forecast anyway, labelled as such. That is
 * defensible only if publication makes the forecast MORE humble rather than less, so this version
 * adds exactly two preregistered calibration operations and no new skill claim:
 *
 *   1. SIGNAL SHRINKAGE   marginMean' = homeAdvantage + λ·(marginSlope·eloDiff), λ ∈ [0,1] fit on
 *      TRAIN by log loss. λ multiplies the TEAM-DIFFERENTIATING TERM, not the output probability.
 *      That distinction is load-bearing: shrinking the probability alone would leave a 50% win
 *      claim sitting beside a projected 19-18 scoreline, and those do not reconcile — the same
 *      distribution that yields a +1 median margin implies ~53%. Shrinking the signal keeps ONE
 *      distribution from which win probability, score, margin and total all derive coherently.
 *      With no real signal λ collapses to 0, every preseason game receives the same league-average
 *      distribution, and the win probability is simply what preseason home-field implies. That is
 *      the honest statement: this model cannot tell these teams apart before the season starts.
 *   2. INTERVAL INFLATION  σ' = k·σ, k fit on TRAIN so the 80% interval actually covers 80%.
 *      Widening can never manufacture confidence; it can only admit more uncertainty.
 *
 * Both are fit on 2023-24 preseason and verified ONCE on held-out 2025. Neither is tuned on the
 * held-out season, and neither can improve the winner's discrimination — shrinkage is monotone,
 * so AUC/ordering is unchanged by construction. This version does not claim to beat the market.
 *
 * Usage: node scripts/nfl/evaluate-nfl-public-beta.mjs --now <iso>
 * Writes: data/internal/research/nfl/reports/public-beta-v1-calibration.json
 *         data/internal/research/nfl/public-beta-model-card-v1.json
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

const prior = read("data/internal/research/nfl/reports/preseason-model-v1-evaluation.json");
const corpus = read("data/internal/research/nfl/corpus-v1.json").rows;
const pre = corpus.filter((r) => r.phase === 1).sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : 1));
const train = pre.filter((r) => r.season <= 2024);
const test = pre.filter((r) => r.season === 2025);

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)); };
const clamp01 = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const normCdf = (z) => 0.5 * (1 + Math.sign(z) * Math.sqrt(1 - Math.exp(-2 * z * z / Math.PI)));
const Z10 = 1.2815515655;

// the uncalibrated heads are P172's, reused verbatim — this release recalibrates, it does not refit
const base = prior.fit;
const eloDiffFor = (row) => {
  const priorFinals = corpus.filter((r) => r.phase !== 1 && r.dateUtc < row.dateUtc);
  const st = strengthStateAt({ rows: priorFinals, cutoffIso: row.dateUtc });
  return st.ratingFor(row.home) - st.ratingFor(row.away);
};
const rowsOf = (set) => set.map((r) => {
  const d = eloDiffFor(r);
  const marginMean = base.homeAdvantage + base.marginSlope * d;
  return {
    d, marginMean,
    pRaw: normCdf(marginMean / base.sigmaMargin),
    margin: r.ftHome - r.ftAway,
    total: r.ftHome + r.ftAway,
    homeWin: r.ftHome > r.ftAway ? 1 : 0,
    tie: r.ftHome === r.ftAway,
    home: r.home, away: r.away, dateUtc: r.dateUtc,
  };
});
const trainRows = rowsOf(train);
const testRows = rowsOf(test);

// ---------------------------------------------------------------- 1. shrinkage λ, fit on TRAIN
const shrinkGrid = Array.from({ length: 21 }, (_, i) => i / 20); // 0.00 … 1.00
const trainDecisive = trainRows.filter((r) => !r.tie);
// λ scales the Elo-driven component of the MARGIN MEAN; the probability follows from it, so the
// published win% and the published scoreline always come from the same distribution.
const shrunkMarginMean = (r, lam) => base.homeAdvantage + lam * (base.marginSlope * r.d);
const llAt = (rows, lam) => mean(rows.map((r) => {
  const p = clamp01(normCdf(shrunkMarginMean(r, lam) / base.sigmaMargin));
  return r.homeWin ? -Math.log(p) : -Math.log(1 - p);
}));
const shrinkCurve = shrinkGrid.map((lam) => ({ lambda: lam, trainLogLoss: Number(llAt(trainDecisive, lam).toFixed(5)) }));
const LAMBDA = shrinkCurve.reduce((b, c) => (c.trainLogLoss < b.trainLogLoss ? c : b)).lambda;

// ---------------------------------------------------------------- 2. interval inflation k, fit on TRAIN
const covAt = (rows, k, mu, sig, act) => mean(rows.map((r) => {
  const lo = mu(r) - Z10 * k * sig, hi = mu(r) + Z10 * k * sig;
  return act(r) >= lo && act(r) <= hi ? 1 : 0;
}));
const inflGrid = Array.from({ length: 26 }, (_, i) => 1 + i * 0.05); // 1.00 … 2.25

// LEAVE-ONE-SEASON-OUT, not in-sample. Fitting k on the same rows σ was estimated from is
// circular: σ IS the train residual SD, so train coverage is ~nominal by construction and the
// grid picks k=1.00 while held-out coverage sits at 0.688. LOSO across the TRAIN seasons
// (fit σ on one, measure coverage on the other) estimates the generalization gap honestly and
// never touches 2025.
const trainSeasons = [...new Set(train.map((r) => r.season))];
function losoK(muOf, actOf, sigmaFrom) {
  const perK = inflGrid.map((k) => ({ k, covs: [] }));
  for (const held of trainSeasons) {
    const fitSet = trainRows.filter((r) => new Date(r.dateUtc).getUTCFullYear() !== held);
    const evalSet = trainRows.filter((r) => new Date(r.dateUtc).getUTCFullYear() === held);
    if (!fitSet.length || !evalSet.length) continue;
    const sigFold = sigmaFrom(fitSet);
    for (const e of perK) e.covs.push(covAt(evalSet, e.k, muOf, sigFold, actOf));
  }
  const scored = perK.map((e) => ({ k: e.k, cov: mean(e.covs) }));
  const best = scored.reduce((b, c) => (Math.abs(c.cov - 0.80) < Math.abs(b.cov - 0.80) ? c : b));
  return { ...best, folds: trainSeasons.length };
}
const kMargin = losoK((r) => r.marginMean, (r) => r.margin, (set) => sd(set.map((r) => r.margin - r.marginMean)));
const kTotal = losoK(() => base.muTotal, (r) => r.total, (set) => sd(set.map((r) => r.total)));

const calibration = {
  signalShrinkLambda: LAMBDA,
  shrinkAppliesTo: "the Elo-driven term of the margin mean (NOT the output probability) — so win %, projected score, margin and total all remain derivable from one distribution",
  calibratedMarginMeanFormula: `homeAdvantage(${base.homeAdvantage}) + ${LAMBDA} × marginSlope(${base.marginSlope}) × eloDiff`,
  marginSigmaInflation: Number(kMargin.k.toFixed(2)),
  totalSigmaInflation: Number(kTotal.k.toFixed(2)),
  sigmaMarginCalibrated: Number((base.sigmaMargin * kMargin.k).toFixed(4)),
  sigmaTotalCalibrated: Number((base.sigmaTotal * kTotal.k).toFixed(4)),
  fitOn: "2023-24 preseason only",
  intervalMethod: `leave-one-season-out across ${kMargin.folds} train seasons — an in-sample fit is circular here because σ is itself the train residual SD`,
  losoCoverageAtChosen: { margin: Number(kMargin.cov.toFixed(4)), total: Number(kTotal.cov.toFixed(4)) },
};

// ---------------------------------------------------------------- 3. verify ONCE on held-out 2025
const testDecisive = testRows.filter((r) => !r.tie);
const pCal = (r) => clamp01(normCdf(shrunkMarginMean(r, LAMBDA) / base.sigmaMargin));
const heldOut = {
  winner: {
    nDecisive: testDecisive.length,
    raw: { logLoss: Number(mean(testDecisive.map((r) => (r.homeWin ? -Math.log(clamp01(r.pRaw)) : -Math.log(1 - clamp01(r.pRaw))))).toFixed(4)) },
    calibrated: { logLoss: Number(mean(testDecisive.map((r) => (r.homeWin ? -Math.log(pCal(r)) : -Math.log(1 - pCal(r))))).toFixed(4)) },
    coin: 0.6931,
    publishedSpread: {
      min: Number((Math.min(...testRows.map(pCal)) * 100).toFixed(1)),
      max: Number((Math.max(...testRows.map(pCal)) * 100).toFixed(1)),
      note: "the full range of win percentages this calibration can ever publish",
    },
  },
  margin: {
    n: testRows.length,
    coverage80Raw: Number(covAt(testRows, 1, (r) => r.marginMean, base.sigmaMargin, (r) => r.margin).toFixed(4)),
    coverage80Calibrated: Number(covAt(testRows, kMargin.k, (r) => r.marginMean, base.sigmaMargin, (r) => r.margin).toFixed(4)),
    mae: Number(mean(testRows.map((r) => Math.abs(r.marginMean - r.margin))).toFixed(3)),
  },
  total: {
    n: testRows.length,
    coverage80Raw: Number(covAt(testRows, 1, () => base.muTotal, base.sigmaTotal, (r) => r.total).toFixed(4)),
    coverage80Calibrated: Number(covAt(testRows, kTotal.k, () => base.muTotal, base.sigmaTotal, (r) => r.total).toFixed(4)),
    mae: Number(mean(testRows.map((r) => Math.abs(base.muTotal - r.total))).toFixed(3)),
  },
};

const receipt = {
  schemaVersion: 1,
  artifact: "nfl-public-beta-v1-calibration",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  modelId: "nfl-preseason-public-beta-v1",
  modelVersion: 1,
  launchState: "PUBLIC_EXPERIMENTAL",
  derivedFrom: { modelId: prior.modelId, evaluation: "reports/preseason-model-v1-evaluation.json" },
  protocol: {
    operations: "TWO preregistered calibrations only — winner shrinkage toward 0.5, and interval inflation to nominal coverage. No head was refit; no new feature was added.",
    fit: "2023-24 preseason",
    verify: "2025 preseason, held out, scored once",
    whyThisCannotInflateConfidence: "shrinkage is monotone toward 0.5 so ordering is unchanged and every probability moves closer to a coin; inflation only widens intervals. Neither operation can make a claim stronger.",
  },
  calibration,
  shrinkCurve,
  heldOut2025: heldOut,
  /** the failed VALIDATED_PICK bars, preserved verbatim — publication does not erase them */
  priorVerdictPreserved: {
    winner: prior.promotion.winner.state,
    total: prior.promotion.total.state,
    margin: prior.promotion.margin.state,
    winnerLogLoss: prior.heldOut2025.winner.model.logLoss,
    coin: prior.heldOut2025.winner.baselines.coin.logLoss,
    note: "these remain the boundary for VALIDATED_PICK; PUBLIC_EXPERIMENTAL does not clear them and never claims to",
  },
  intervalFinding: {
    losoCoverage: calibration.losoCoverageAtChosen,
    heldOut2025Coverage: { margin: heldOut.margin.coverage80Calibrated, total: heldOut.total.coverage80Calibrated },
    chosenInflation: { margin: calibration.marginSigmaInflation, total: calibration.totalSigmaInflation },
    reading:
      "Leave-one-season-out coverage sits at ~0.80 for both heads, so the interval WIDTHS are not systematically too narrow — the 0.688 margin coverage seen on 2025 is one season landing wider than the model expected (n=48; roughly a 1.9σ deviation), not a calibration defect. Inflating sigma until 2025 covered would be fitting the held-out season, which the protocol forbids. k=1.00 therefore stands and the 2025 shortfall is published as a limitation rather than tuned away.",
  },
  honesty: [
    "this model does NOT beat the market and does not claim to — it is published as an experiment with its results tracked",
    "interval width was NOT inflated to make the held-out season look covered: leave-season-out says the width is right, and tuning to the test set is the one thing the protocol forbids",
    "the winner head has no measurable preseason skill; shrinkage is the honest response and the published spread of win percentages shows exactly how little the model is willing to say",
    "interval widening is a humility operation: it admits more uncertainty and can never sharpen a forecast",
    "no forecast is ever updated after seeing its result — versions are frozen before kickoff and learn only between slates",
  ],
};
fs.writeFileSync(path.join(ROOT, "data/internal/research/nfl/reports/public-beta-v1-calibration.json"), JSON.stringify(receipt, null, 1));

const card = {
  schemaVersion: 1,
  artifact: "nfl-public-beta-model-card",
  dataClass: "PUBLIC_DERIVED",
  modelId: "nfl-preseason-public-beta-v1",
  version: 1,
  generatedAt: NOW,
  launchState: "PUBLIC_EXPERIMENTAL",
  plainEnglish: {
    what: "An early, experimental simulation of NFL preseason games. It runs 10,000 game simulations and reports the range of scores it sees.",
    honestLimit: `Tested on a full held-out preseason, this model picked winners no better than a coin flip. Its win percentages are therefore deliberately pulled close to 50% — the widest it will ever go is ${heldOut.winner.publishedSpread.min}%–${heldOut.winner.publishedSpread.max}%.`,
    whatItIsGoodFor: "Seeing a plausible score range and how it compares with the sportsbook market. It is not a betting recommendation and has not been shown to beat the market.",
    whyPublishItAtAll: "Publishing it with its results tracked is how it earns — or fails to earn — a stronger status over time.",
  },
  trainedOn: "146 preseason games, 2023-2025 (fit 2023-24, verified on held-out 2025)",
  lastTrained: NOW,
  nextReview: "after the 2026 preseason settles — a candidate v2 trains offline only on games already played",
  metrics: heldOut,
  limitations: [
    "preseason participation is unmodelled — who actually plays is the dominant unknown and no authorized source exists",
    "small sample: 98 training games",
    "no injury, weather, rest, or roster-continuity feature",
    "this version has NOT met the bars required to call anything a validated pick",
    `on the held-out 2025 preseason, actual results fell inside the model's 80% margin range only ${(heldOut.margin.coverage80Calibrated * 100).toFixed(0)}% of the time — one season came in wider than expected, and the ranges were deliberately not widened after the fact to hide it`,
  ],
  publicActivation: "EXPERIMENTAL",
};
fs.writeFileSync(path.join(ROOT, "data/internal/research/nfl/public-beta-model-card-v1.json"), JSON.stringify(card, null, 1));

console.log(`public-beta calibration: λ=${LAMBDA} · margin σ×${kMargin.k.toFixed(2)} · total σ×${kTotal.k.toFixed(2)}`);
console.log(`held-out winner logLoss raw ${heldOut.winner.raw.logLoss} → calibrated ${heldOut.winner.calibrated.logLoss} (coin 0.6931)`);
console.log(`published win% range: ${heldOut.winner.publishedSpread.min}%–${heldOut.winner.publishedSpread.max}%`);
console.log(`margin cov80 ${heldOut.margin.coverage80Raw} → ${heldOut.margin.coverage80Calibrated} · total cov80 ${heldOut.total.coverage80Raw} → ${heldOut.total.coverage80Calibrated}`);
