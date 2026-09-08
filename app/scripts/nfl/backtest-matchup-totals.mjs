#!/usr/bin/env node
/**
 * P246 §4B-NFL — matchup-totals-v1-decayed-points, evaluated EXACTLY as preregistered in
 * data/internal/research/nfl/reports/matchup-totals-preregistration.json (committed before
 * this file existed; the commit order is the proof).
 *
 * Candidate: total ~ Normal(a0 + a1·s, sigmaC), s = (R_home + R_away)/2 − meanR_train,
 * R_team = exponentially decayed walk-forward mean of (points scored + points allowed) per
 * game. REG+POST only. Half-life from the frozen grid {4, 8, 16}: fit on 2023, one-step
 * walk-forward NLL on 2024 selects; refit once on 2023–24. Held-out 2025 scored once against
 * a shared prior REFIT on the identical train population.
 *
 * Usage: node scripts/nfl/backtest-matchup-totals.mjs --now <iso>
 * Writes: data/internal/research/nfl/reports/matchup-totals-evaluation.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.join(APP, "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "data/internal/research/nfl/corpus-v1.json"), "utf8"));
const games = corpus.rows
  .filter((r) => r.phase !== 1 && Number.isFinite(r.ftHome) && Number.isFinite(r.ftAway))
  .sort((a, b) => (a.dateUtc < b.dateUtc ? -1 : a.dateUtc > b.dateUtc ? 1 : a.providerEventId < b.providerEventId ? -1 : 1));

const HL_GRID = [4, 8, 16];
const LOG_2PI = Math.log(2 * Math.PI);
const nll = (y, mu, sd) => 0.5 * LOG_2PI + Math.log(sd) + ((y - mu) ** 2) / (2 * sd * sd);

/** Walk-forward decayed (points for + against) rating stream for a half-life. */
function ratingsSequence(hl) {
  const alpha = 1 - Math.exp(Math.log(0.5) / hl);
  const state = new Map(); // team -> rating (per-game combined points)
  const out = []; // per game: {season, total, s-parts before update}
  // League mean initialization: running league mean of combined points so far (seeded at 44).
  let leagueSum = 0;
  let leagueN = 0;
  for (const g of games) {
    const total = g.ftHome + g.ftAway;
    const mean = leagueN ? leagueSum / leagueN : 44;
    const rH = state.get(g.home) ?? mean;
    const rA = state.get(g.away) ?? mean;
    out.push({ season: g.season, total, rH, rA, id: g.providerEventId });
    state.set(g.home, rH + alpha * (total - rH));
    state.set(g.away, rA + alpha * (total - rA));
    leagueSum += total;
    leagueN += 1;
  }
  return out;
}

function ols(rows, meanR) {
  // total = a0 + a1·s
  const n = rows.length;
  const xs = rows.map((r) => (r.rH + r.rA) / 2 - meanR);
  const ys = rows.map((r) => r.total);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); }
  const a1 = sxx > 0 ? sxy / sxx : 0;
  const a0 = my - a1 * mx;
  const resid = ys.map((y, i) => y - (a0 + a1 * xs[i]));
  const sigma = Math.sqrt(resid.reduce((s, r) => s + r * r, 0) / (n - 2));
  const seA1 = sxx > 0 ? sigma / Math.sqrt(sxx) : null;
  return { a0, a1, sigma, seA1 };
}

// ---- half-life selection: fit on 2023, walk-forward NLL on 2024 --------------------------------
const selection = [];
for (const hl of HL_GRID) {
  const seq = ratingsSequence(hl);
  const g23 = seq.filter((r) => r.season === 2023);
  const meanR23 = g23.reduce((s, r) => s + (r.rH + r.rA) / 2, 0) / g23.length;
  const fit23 = ols(g23, meanR23);
  const g24 = seq.filter((r) => r.season === 2024);
  const mean24Nll = g24.reduce((s, r) => s + nll(r.total, fit23.a0 + fit23.a1 * ((r.rH + r.rA) / 2 - meanR23), fit23.sigma), 0) / g24.length;
  selection.push({ hl, mean24Nll: Number(mean24Nll.toFixed(5)) });
}
selection.sort((a, b) => a.mean24Nll - b.mean24Nll || b.hl - a.hl); // tie -> longest
const HL = selection[0].hl;

// ---- refit on 2023-24 with the selected half-life ----------------------------------------------
const seq = ratingsSequence(HL);
const train = seq.filter((r) => r.season <= 2024);
const test = seq.filter((r) => r.season === 2025);
const meanR = train.reduce((s, r) => s + (r.rH + r.rA) / 2, 0) / train.length;
const fit = ols(train, meanR);

// shared prior REFIT on the identical population
const muPrior = train.reduce((s, r) => s + r.total, 0) / train.length;
const sdPrior = Math.sqrt(train.reduce((s, r) => s + (r.total - muPrior) ** 2, 0) / (train.length - 1));

// ---- held-out 2025, scored once ----------------------------------------------------------------
const Z80 = 1.2815515655446004;
let candNll = 0;
let priorNll = 0;
let candMae = 0;
let priorMae = 0;
let cover = 0;
const preds = [];
for (const r of test) {
  const mu = fit.a0 + fit.a1 * ((r.rH + r.rA) / 2 - meanR);
  candNll += nll(r.total, mu, fit.sigma);
  priorNll += nll(r.total, muPrior, sdPrior);
  candMae += Math.abs(r.total - mu);
  priorMae += Math.abs(r.total - muPrior);
  if (r.total >= mu - Z80 * fit.sigma && r.total <= mu + Z80 * fit.sigma) cover += 1;
  preds.push(mu);
}
const n = test.length;
const predMean = preds.reduce((a, b) => a + b, 0) / n;
const predSd = Math.sqrt(preds.reduce((s, p) => s + (p - predMean) ** 2, 0) / (n - 1));

const observed = {
  n,
  candidate: { meanNll: Number((candNll / n).toFixed(5)), mae: Number((candMae / n).toFixed(3)), coverage80: Number((cover / n).toFixed(4)) },
  sharedPriorRefit: { mu: Number(muPrior.toFixed(4)), sigma: Number(sdPrior.toFixed(4)), meanNll: Number((priorNll / n).toFixed(5)), mae: Number((priorMae / n).toFixed(3)) },
};
const bars = {
  meanNll: { pass: observed.candidate.meanNll < observed.sharedPriorRefit.meanNll, required: `< ${observed.sharedPriorRefit.meanNll}`, observed: observed.candidate.meanNll },
  coverage80: { pass: observed.candidate.coverage80 >= 0.72 && observed.candidate.coverage80 <= 0.88, required: "[0.72, 0.88]", observed: observed.candidate.coverage80 },
  mae: { pass: observed.candidate.mae <= observed.sharedPriorRefit.mae * 1.02, required: `<= ${(observed.sharedPriorRefit.mae * 1.02).toFixed(3)}`, observed: observed.candidate.mae },
};
const verdict = Object.values(bars).every((b) => b.pass) ? "ELIGIBLE" : "REJECTED";

const receipt = {
  schemaVersion: 1,
  artifact: "matchup-totals-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  candidate: "matchup-totals-v1-decayed-points",
  preregistration: "data/internal/research/nfl/reports/matchup-totals-preregistration.json",
  population: { trainGames: train.length, testGames: n, phaseFilter: "REG+POST (phase != 1)" },
  halfLifeSelection: { grid: HL_GRID, trace: selection, selected: HL },
  fit: { a0: Number(fit.a0.toFixed(4)), a1: Number(fit.a1.toFixed(5)), sigma: Number(fit.sigma.toFixed(4)), a1StdErr: fit.seA1 == null ? null : Number(fit.seA1.toFixed(5)), meanRatingTrain: Number(meanR.toFixed(4)) },
  heldOut2025: observed,
  diagnostics: {
    predictedMeanSd2025: Number(predSd.toFixed(3)),
    note: "sd of predicted medians across 2025 — how much the head actually differentiates games; a diagnostic, never a bar",
  },
  bars,
  verdict,
  consequence: verdict === "ELIGIBLE"
    ? "Adoption into the public forecast builder is its OWN reviewed step (coherence guards, regime stamps, workflow regeneration); nothing publishes from this receipt alone."
    : "The declared shared prior stands; the /nfl shared-prior disclosure remains exactly as published.",
};

fs.writeFileSync(path.join(ROOT, "data/internal/research/nfl/reports/matchup-totals-evaluation.json"), JSON.stringify(receipt, null, 1));
console.log(`hl=${HL} a1=${receipt.fit.a1}±${receipt.fit.a1StdErr} · cand NLL ${observed.candidate.meanNll} vs prior ${observed.sharedPriorRefit.meanNll} · cov80 ${observed.candidate.coverage80} · mae ${observed.candidate.mae} vs ${observed.sharedPriorRefit.mae} → ${verdict}`);
