/**
 * NFL model v1 — chronological replay evaluation (Program 167 · Release E). PRIVATE RESEARCH.
 *
 * PROTOCOL, declared before evaluation (the Sprint-047 rule):
 *   TRAIN  = seasons 2023–2024 (walk-forward; fits marginSlope, σ_margin, μ_total, σ_total)
 *   TEST   = season 2025 (walk-forward continues folding; the heads stay FROZEN from train)
 *   Preseason (phase 1) is outside fit AND outside coverage — ABSTAINED by policy, reported.
 *   No threshold, parameter, or slice is tuned on 2025.
 *
 * Baselines on the identical test set: coin (0.5), naive-home (train home-win rate), Elo-only
 * (identical to v1's win head BY CONSTRUCTION — reported as such, no false novelty).
 *
 * Writes: data/internal/research/nfl/reports/model-v1-evaluation.json
 *         data/internal/research/nfl/model-card-v1.json
 * Usage:  node scripts/nfl/evaluate-nfl-model-v1.mjs --now <iso>   (clock is a parameter)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { walkForwardObservations, fitNflV1, NFL_MODEL_ID, NFL_MODEL_VERSION } from "../../src/lib/sports/nfl/model-v1.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("usage: evaluate-nfl-model-v1.mjs --now <iso> — the clock is always a parameter"); process.exit(1); }

const corpus = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/nfl/corpus-v1.json"), "utf8"));
const rows = corpus.rows ?? [];

const TRAIN_SEASONS = [2023, 2024];
const TEST_SEASON = 2025;

const trainRows = rows.filter((r) => TRAIN_SEASONS.includes(r.season));
const fit = fitNflV1(trainRows);

// Walk-forward over the FULL corpus once; score only test-season, non-preseason observations.
// The state at each test game therefore includes everything before it (train + earlier test),
// while the distribution heads remain frozen from train — exactly the declared protocol.
const allObs = walkForwardObservations(rows);
const testObs = allObs.filter((o) => o.season === TEST_SEASON);
const preseasonTest = rows.filter((r) => r.season === TEST_SEASON && (r.seasonType ?? r.phase) === 1);

if (testObs.length < 200) { console.error(`test season has ${testObs.length} scored observations — refusing to report on a thin slice as if it were proof`); process.exit(2); }

const logLoss = (obs, pOf) => -obs.reduce((s, o) => {
  const p = Math.min(1 - 1e-12, Math.max(1e-12, pOf(o)));
  const y = o.margin > 0 ? 1 : 0; // ties scored as home-loss for two-way heads; counted separately below
  return s + (y === 1 ? Math.log(p) : Math.log(1 - p));
}, 0) / obs.length;
const brier = (obs, pOf) => obs.reduce((s, o) => s + ((o.margin > 0 ? 1 : 0) - pOf(o)) ** 2, 0) / obs.length;

const calibration = (obs, pOf, bins = 10) => {
  const rowsOut = [];
  let ece = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins, hi = (b + 1) / bins;
    const inBin = obs.filter((o) => { const p = pOf(o); return p >= lo && (b === bins - 1 ? p <= hi : p < hi); });
    if (!inBin.length) { rowsOut.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n: 0 }); continue; }
    const meanP = inBin.reduce((s, o) => s + pOf(o), 0) / inBin.length;
    const rate = inBin.filter((o) => o.margin > 0).length / inBin.length;
    ece += (inBin.length / obs.length) * Math.abs(meanP - rate);
    rowsOut.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n: inBin.length, meanPredicted: Number(meanP.toFixed(4)), observedHomeRate: Number(rate.toFixed(4)) });
  }
  return { bins: rowsOut, ece: Number(ece.toFixed(4)) };
};

const marginMAE = testObs.reduce((s, o) => s + Math.abs(o.margin - fit.params.marginSlope * o.eloDiff), 0) / testObs.length;
const totalMAE = testObs.reduce((s, o) => s + Math.abs(o.total - fit.params.muTotal), 0) / testObs.length;

const modelP = (o) => o.pHome;
const coinP = () => 0.5;
const naiveHomeP = () => fit.trainHomeWinRate;

const bySlice = (label, obs) => ({
  slice: label,
  n: obs.length,
  ties: obs.filter((o) => o.tie).length,
  logLoss: Number(logLoss(obs, modelP).toFixed(4)),
  brier: Number(brier(obs, modelP).toFixed(4)),
});

const report = {
  schemaVersion: 1,
  artifact: "nfl-model-v1-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  modelId: NFL_MODEL_ID,
  modelVersion: NFL_MODEL_VERSION,
  protocol: {
    train: { seasons: TRAIN_SEASONS, observations: fit.trainObservations, declaredBeforeEvaluation: true },
    test: { season: TEST_SEASON, observations: testObs.length },
    preseasonPolicy: "phase-1 games are outside fit and outside coverage — ABSTAINED, counted below, accuracy UNPROVEN by design",
    tieHandling: "two-way heads score ties as non-home-win; tie counts reported per slice (7 corpus-wide)",
  },
  fitParams: fit.params,
  coverage: {
    testGamesTotal: testObs.length + preseasonTest.length,
    predicted: testObs.length,
    abstainedPreseason: preseasonTest.length,
    coverageRate: Number((testObs.length / (testObs.length + preseasonTest.length)).toFixed(4)),
  },
  metrics: {
    model: {
      logLoss: Number(logLoss(testObs, modelP).toFixed(4)),
      brier: Number(brier(testObs, modelP).toFixed(4)),
      calibration: calibration(testObs, modelP),
      marginMAE: Number(marginMAE.toFixed(3)),
      totalMAE: Number(totalMAE.toFixed(3)),
    },
    baselines: {
      coin: { logLoss: Number(logLoss(testObs, coinP).toFixed(4)), brier: Number(brier(testObs, coinP).toFixed(4)) },
      naiveHome: { p: fit.trainHomeWinRate, logLoss: Number(logLoss(testObs, naiveHomeP).toFixed(4)), brier: Number(brier(testObs, naiveHomeP).toFixed(4)) },
      eloOnly: { note: "identical to the model's win head by construction — v1 adds distribution heads, not a new win model" },
    },
  },
  slices: [
    bySlice("regular (phase 2)", testObs.filter((o) => o.phase === 2)),
    bySlice("postseason (phase 3)", testObs.filter((o) => o.phase === 3)),
    { slice: "preseason (phase 1)", n: preseasonTest.length, state: "ABSTAINED_BY_POLICY", accuracy: "UNPROVEN — no prediction exists to score" },
  ],
  honesty: [
    "the win head IS the P151 Elo baseline — no novelty is claimed for it",
    "the total head is league climatology; team-level totals are a stated v1 gap",
    "no market data touches fit or predict — independence is structural",
    "no profit or market-beating claim is made or implied anywhere",
  ],
};

const reportPath = path.join(APP, "..", "data/internal/research/nfl/reports/model-v1-evaluation.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 1) + "\n");

const card = {
  schemaVersion: 1,
  artifact: "nfl-model-card",
  dataClass: "PRIVATE_RESEARCH",
  modelId: NFL_MODEL_ID,
  version: NFL_MODEL_VERSION,
  generatedAt: NOW,
  objective: "pre-event win probability plus margin/total distributions for NFL games, as a private research forecast compared (never blended) with no-vig market probabilities",
  method: "ANALYTICAL_NORMAL_HEADS_OVER_CUTOFF_ELO — closed-form normals; no Monte Carlo, no RNG, deterministic by construction; quantiles are exact normal quantiles",
  features: ["cutoff-versioned Elo ratings (K=20, HA=48, mean 1505, 1/3 season regression; preseason never fits)", "nothing else — no injuries, weather, market, or roster features in v1 (each is either an explicit shadow-run input state or a stated limitation)"],
  featureCutoff: "strength state at the assembly clock; every training row strictly precedes the declared train/test boundary",
  population: { corpus: "1,001 finals 2023–2025 (7 ties preserved)", train: "2023–2024", test: "2025" },
  metrics: { see: "reports/model-v1-evaluation.json", headline: { testLogLoss: report.metrics.model.logLoss, coin: report.metrics.baselines.coin.logLoss, ece: report.metrics.model.calibration.ece, marginMAE: report.metrics.model.marginMAE, totalMAE: report.metrics.model.totalMAE } },
  limitations: [
    "PRESEASON: abstains entirely — starter participation, roster churn, depth-chart uncertainty make the regular-season fit unfounded; a separate evidence-backed preseason update would be its own versioned model",
    "totals are league climatology (no team scoring signal)",
    "no injury/weather/rest adjustment in v1 — those are shadow-run INPUT states, surfaced beside the forecast, never silently imputed",
    "margin/total normality is an approximation; key-number mass (3, 7) is not modeled",
  ],
  abstention: { preseason: "always", unresolvedIdentity: "always" },
  independenceFromMarket: "structural — no odds parameter exists in fit or predict; odds qualify shadow freshness and provide no-vig comparison only",
  rightsAndProvenance: "corpus from ESPN public scoreboard snapshots with attribution (see corpus sourceManifest); educational, paper-only use",
  publicActivation: "OFF",
};
fs.writeFileSync(path.join(APP, "..", "data/internal/research/nfl/model-card-v1.json"), JSON.stringify(card, null, 1) + "\n");

console.log(`train obs ${fit.trainObservations} · test obs ${testObs.length} (+${preseasonTest.length} preseason abstained)`);
console.log(`model logLoss ${report.metrics.model.logLoss} vs coin ${report.metrics.baselines.coin.logLoss} vs naive-home ${report.metrics.baselines.naiveHome.logLoss}`);
console.log(`ECE ${report.metrics.model.calibration.ece} · margin MAE ${report.metrics.model.marginMAE} · total MAE ${report.metrics.model.totalMAE}`);
console.log(`wrote ${path.relative(path.join(APP, ".."), reportPath)} + model-card-v1.json`);
