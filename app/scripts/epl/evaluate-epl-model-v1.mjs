/**
 * EPL model v1 — chronological replay with RPS, calibration and totals diagnostics
 * (Program 167 · Release G). PRIVATE RESEARCH.
 *
 * The arithmetic is the committed `poisson` baseline's, via the SAME lib the live shadow path
 * uses (parity with reports/baseline-evaluation-v1.json is asserted in tests). Protocol identical
 * to the baseline: warm-up season 2022-23 folds state and never scores; 2023-24 → 2025-26 score
 * walk-forward with intra-day slates sharing one pregame state (per-date state rebuild).
 *
 * Adds what the baseline report lacked: ranked probability score (the ordered-outcome metric),
 * calibration by OUTCOME (does p(draw)=x mean draws happen x of the time?), and score/total
 * diagnostics (expected-total MAE, over-2.5 reliability).
 *
 * Writes: data/internal/research/epl/reports/model-v1-evaluation.json
 *         data/internal/research/epl/model-card-v1.json
 * Usage:  node scripts/epl/evaluate-epl-model-v1.mjs --now <iso>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitEplStrength, scoreMatrix, EPL_MODEL_ID, EPL_POISSON_PARAMS } from "../../src/lib/sports/epl/strength-state.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("usage: evaluate-epl-model-v1.mjs --now <iso>"); process.exit(1); }

const corpus = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/epl/corpus-v1.json"), "utf8"));
const rows = [...corpus.rows].sort((a, b) => String(a.dateUtc).localeCompare(String(b.dateUtc)));
const WARMUP = "2022-23";

// Walk forward by DATE: one shared pregame state per calendar day (the baseline's rule).
const preds = [];
const dates = [...new Set(rows.map((m) => m.dateUtc.slice(0, 10)))];
for (const day of dates) {
  const dayMatches = rows.filter((m) => m.dateUtc.slice(0, 10) === day);
  if (dayMatches.every((m) => m.season === WARMUP)) continue;
  const state = fitEplStrength({ rows, cutoffIso: `${day}T00:00:00Z` });
  for (const m of dayMatches) {
    if (m.season === WARMUP) continue;
    const mx = scoreMatrix(state, m.home, m.away);
    preds.push({ season: m.season, result: m.result, probs: { H: mx.oneXTwo.home, D: mx.oneXTwo.draw, A: mx.oneXTwo.away }, expTotal: mx.totals.expected, over25: mx.totals.over25, actualTotal: m.ftHome + m.ftAway });
  }
}

const OUTS = ["H", "D", "A"];
const logLoss = (xs, pOf) => -xs.reduce((s, m) => s + Math.log(Math.max(1e-12, pOf(m)[m.result])), 0) / xs.length;
const accuracy = (xs, pOf) => xs.filter((m) => OUTS.reduce((b, o) => (pOf(m)[o] > pOf(m)[b] ? o : b), "H") === m.result).length / xs.length;
// RPS over the ORDERED outcome (H, D, A): mean squared CDF difference, /2.
const rps = (xs, pOf) => xs.reduce((s, m) => {
  const p = pOf(m);
  const cdf = [p.H, p.H + p.D, 1];
  const y = m.result === "H" ? [1, 1, 1] : m.result === "D" ? [0, 1, 1] : [0, 0, 1];
  return s + (cdf.reduce((t, c, i) => t + (c - y[i]) ** 2, 0)) / 2;
}, 0) / xs.length;

const calibrationByOutcome = (xs) => Object.fromEntries(OUTS.map((o) => {
  const bins = [];
  let ece = 0;
  for (let b = 0; b < 10; b++) {
    const lo = b / 10, hi = (b + 1) / 10;
    const inBin = xs.filter((m) => m.probs[o] >= lo && (b === 9 ? m.probs[o] <= hi : m.probs[o] < hi));
    if (!inBin.length) { bins.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n: 0 }); continue; }
    const meanP = inBin.reduce((s, m) => s + m.probs[o], 0) / inBin.length;
    const rate = inBin.filter((m) => m.result === o).length / inBin.length;
    ece += (inBin.length / xs.length) * Math.abs(meanP - rate);
    bins.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n: inBin.length, meanPredicted: Number(meanP.toFixed(4)), observedRate: Number(rate.toFixed(4)) });
  }
  return [o, { bins, ece: Number(ece.toFixed(4)) }];
}));

const totalMAE = preds.reduce((s, m) => s + Math.abs(m.actualTotal - m.expTotal), 0) / preds.length;
const over25Pred = preds.reduce((s, m) => s + m.over25, 0) / preds.length;
const over25Actual = preds.filter((m) => m.actualTotal >= 3).length / preds.length;

// Baselines on the identical population: uniform and additive-smoothed home-frequency.
const uniformP = () => ({ H: 1 / 3, D: 1 / 3, A: 1 / 3 });
const counts = { H: 0, D: 0, A: 0 };
for (const m of rows.filter((m) => m.season === WARMUP)) counts[m.result] += 1;
const nWarm = counts.H + counts.D + counts.A;
const homeFreqP = () => ({ H: (counts.H + 1) / (nWarm + 3), D: (counts.D + 1) / (nWarm + 3), A: (counts.A + 1) / (nWarm + 3) });

const bySeason = Object.fromEntries([...new Set(preds.map((m) => m.season))].sort().map((s) => {
  const xs = preds.filter((m) => m.season === s);
  return [s, { n: xs.length, logLoss: Number(logLoss(xs, (m) => m.probs).toFixed(4)), rps: Number(rps(xs, (m) => m.probs).toFixed(4)), accuracy: Number(accuracy(xs, (m) => m.probs).toFixed(4)) }];
}));

const report = {
  schemaVersion: 1,
  artifact: "epl-model-v1-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  modelId: EPL_MODEL_ID,
  protocol: {
    warmupSeason: WARMUP,
    scored: preds.length,
    rule: "walk-forward by calendar day; intra-day slates share one pregame state; warm-up folds, never scores; no parameter is tuned on any scored season (the arithmetic has no tunable parameters beyond the committed constants)",
    parityTarget: "models.poisson in reports/baseline-evaluation-v1.json — same arithmetic, same protocol",
  },
  params: { ...EPL_POISSON_PARAMS },
  metrics: {
    model: {
      n: preds.length,
      logLoss: Number(logLoss(preds, (m) => m.probs).toFixed(4)),
      rps: Number(rps(preds, (m) => m.probs).toFixed(4)),
      accuracy: Number(accuracy(preds, (m) => m.probs).toFixed(4)),
      calibrationByOutcome: calibrationByOutcome(preds),
    },
    baselines: {
      uniform: { logLoss: Number(logLoss(preds, uniformP).toFixed(4)), rps: Number(rps(preds, uniformP).toFixed(4)) },
      homeFrequency: { p: homeFreqP(), logLoss: Number(logLoss(preds, homeFreqP).toFixed(4)), rps: Number(rps(preds, homeFreqP).toFixed(4)) },
      eloCommitted: { see: "reports/baseline-evaluation-v1.json models.elo (logLoss 0.9991 at n=1140)" },
    },
  },
  totalsDiagnostics: {
    expectedTotalMAE: Number(totalMAE.toFixed(3)),
    over25: { predictedRate: Number(over25Pred.toFixed(4)), actualRate: Number(over25Actual.toFixed(4)) },
  },
  bySeason,
  honesty: [
    "one-league, three-scored-season sample — no production-superiority claim; the draw column's calibration is the metric that matters most for a 1X2 model",
    "cold-start clubs (promotions) enter at league average — their early-season rows are the weakest slice by construction",
    "no market data touches fit or predict; no profit or market-beating claim is made or implied",
  ],
  stoppingRule: "changes (time decay, ridge, Dixon–Coles τ) require a fresh chronological replay with material log-loss improvement on a season the change never saw; absent that, v1 stands",
};

const reportPath = path.join(APP, "..", "data/internal/research/epl/reports/model-v1-evaluation.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 1) + "\n");

const card = {
  schemaVersion: 1,
  artifact: "epl-model-card",
  dataClass: "PRIVATE_RESEARCH",
  modelId: EPL_MODEL_ID,
  version: 1,
  generatedAt: NOW,
  objective: "private pre-event 1X2 + exact-score + total-goals distributions for EPL fixtures; research comparison against three-way no-vig markets only after an authorized snapshot exists",
  method: "home/away-split attack-defence multipliers over league goal means; independent-Poisson exact-score grid 0..10, tail-renormalized; λ floor 0.05; promoted clubs cold-start at 1.0 — the committed baseline promoted verbatim to the live adapter; deterministic, no RNG",
  alternativesConsidered: ["time-decay weighting", "ridge shrinkage toward 1.0", "Dixon–Coles low-score τ"],
  alternativesDisposition: "deferred — each is a NEW model requiring its own replay before touching the live path (see stoppingRule in the evaluation report)",
  lineupPolicy: "NOT_REQUIRED_FOR_TEAM_V1 — team-level forecasting only; no lineup parameter exists; player-aware claims are out of scope for this version",
  population: { corpus: "1,520 matches, 2022-23 → 2025-26; warm-up 2022-23", scored: report.protocol.scored },
  metrics: { see: "reports/model-v1-evaluation.json", headline: { logLoss: report.metrics.model.logLoss, rps: report.metrics.model.rps, accuracy: report.metrics.model.accuracy, drawEce: report.metrics.model.calibrationByOutcome.D.ece, totalMAE: report.totalsDiagnostics.expectedTotalMAE } },
  limitations: [
    "draw probability derives from the Poisson grid, not a dedicated draw parameter — the D-column calibration in the report is the honest check",
    "promoted-club cold start = league average until real 2026-27 results fold in",
    "no lineups, injuries, congestion, or European-schedule features — stated, never imputed",
    "independence assumption between home/away goals (the deferred Dixon–Coles τ is the known correction)",
  ],
  independenceFromMarket: "structural — no odds parameter exists in fit or predict",
  rightsAndProvenance: "corpus from api-football fixtures (see corpus sourceManifest); 2026-27 fixtures from openfootball (public domain); educational, paper-only",
  publicActivation: "OFF",
};
fs.writeFileSync(path.join(APP, "..", "data/internal/research/epl/model-card-v1.json"), JSON.stringify(card, null, 1) + "\n");

console.log(`scored ${preds.length} · logLoss ${report.metrics.model.logLoss} vs uniform ${report.metrics.baselines.uniform.logLoss} / home-freq ${report.metrics.baselines.homeFrequency.logLoss}`);
console.log(`RPS ${report.metrics.model.rps} · acc ${report.metrics.model.accuracy} · draw ECE ${report.metrics.model.calibrationByOutcome.D.ece}`);
console.log(`totals: MAE ${report.totalsDiagnostics.expectedTotalMAE} · over2.5 pred ${report.totalsDiagnostics.over25.predictedRate} vs actual ${report.totalsDiagnostics.over25.actualRate}`);
console.log("wrote reports/model-v1-evaluation.json + model-card-v1.json");
