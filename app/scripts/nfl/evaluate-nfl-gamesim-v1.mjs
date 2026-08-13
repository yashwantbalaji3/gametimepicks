/**
 * NFL game-sim v1 evaluation (Program 169 · Release C). PRIVATE RESEARCH.
 *
 * Two questions, answered separately:
 *  1. REGULAR variant consistency — the simulated win probability must agree with the analytic
 *     v1 win head within convergence tolerance (the sim adds a JOINT SCORE distribution, not a
 *     new win model; agreement is the proof nothing drifted). Score marginals: MAE + CRPS-style
 *     interval coverage on held-out 2025 regular season vs the naive league-average baseline.
 *  2. PRESEASON_CONSERVATIVE shrink — fit the margin-shrink factor on 2023-24 preseason games
 *     ONLY (grid over {0.2, 0.35, 0.5, 0.7, 1.0}), test on 2025 preseason. The committed
 *     PRESEASON_VARIANT.marginShrink must equal the train-chosen factor.
 *
 * Writes: data/internal/research/nfl/reports/gamesim-v1-evaluation.json
 * Usage:  node scripts/nfl/evaluate-nfl-gamesim-v1.mjs --now <iso>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { fitNflV1, walkForwardObservations } from "../../src/lib/sports/nfl/model-v1.mjs";
import { strengthStateAt, ELO_PARAMS } from "../../src/lib/sports/nfl/strength-state.mjs";
import { simulateNflGame, PRESEASON_VARIANT, NFL_GAMESIM_ID } from "../../src/lib/sports/nfl/game-sim.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("usage: evaluate-nfl-gamesim-v1.mjs --now <iso>"); process.exit(1); }

const corpus = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/nfl/corpus-v1.json"), "utf8"));
const rows = corpus.rows;
const fit = fitNflV1(rows.filter((r) => [2023, 2024].includes(r.season)));

// ── 1 · REGULAR consistency + score marginals on held-out 2025 regular season ──────────────────
const obs2025 = walkForwardObservations(rows).filter((o) => o.season === 2025 && o.phase === 2);
const logistic = (d) => 1 / (1 + 10 ** (-d / 400));

// consistency probe: 12 evenly-spaced games, sim vs analytic
let maxGap = 0;
let maxHeadDivergence = 0;
for (let i = 0; i < obs2025.length; i += Math.max(1, Math.floor(obs2025.length / 12))) {
  const o = obs2025[i];
  const g = rows.find((r) => r.providerEventId === o.eventKey) ?? rows.find((r) => `${r.away}@${r.home}:${r.dateUtc}` === o.eventKey);
  if (!g) continue;
  const state = strengthStateAt({ rows, cutoffIso: g.dateUtc });
  const sim = simulateNflGame({ fit, strengthState: state, event: { ...g, seasonType: 2 }, artifactDate: "2026-08-13", runs: 20_000 });
  const analytic = logistic(state.ratingFor(typeof g.home === "string" ? g.home : g.home?.abbr) + ELO_PARAMS.HOME_ADVANTAGE - state.ratingFor(typeof g.away === "string" ? g.away : g.away?.abbr));
  const winNoTie = sim.winProbability.home / (sim.winProbability.home + sim.winProbability.away);
  maxGap = Math.max(maxGap, Math.abs(winNoTie - analytic));
  maxHeadDivergence = Math.max(maxHeadDivergence, sim.scoreImpliedWinDiagnostic.headAgreementGap);
}

// score marginals: predicted mean home/away score vs actual, whole 2025 regular season (analytic — no sim needed)
let maeModel = 0, maeNaive = 0, cover80 = 0;
const naiveHome = (fit.params.muTotal + fit.params.marginSlope * 0) / 2; // league-average score
for (const o of obs2025) {
  const g = rows.find((r) => r.providerEventId === o.eventKey);
  if (!g) continue;
  const mM = fit.params.marginSlope * o.eloDiff;
  const predHome = (fit.params.muTotal + mM) / 2;
  const predAway = (fit.params.muTotal - mM) / 2;
  maeModel += (Math.abs(g.ftHome - predHome) + Math.abs(g.ftAway - predAway)) / 2;
  maeNaive += (Math.abs(g.ftHome - naiveHome) + Math.abs(g.ftAway - naiveHome)) / 2;
  // 80% interval from the joint normal marginal: score sd ≈ sqrt(σm²+σt²)/2
  const sd = Math.sqrt(fit.params.sigmaMargin ** 2 + fit.params.sigmaTotal ** 2) / 2;
  const inH = g.ftHome >= predHome - 1.2815 * sd && g.ftHome <= predHome + 1.2815 * sd;
  const inA = g.ftAway >= predAway - 1.2815 * sd && g.ftAway <= predAway + 1.2815 * sd;
  cover80 += (inH ? 0.5 : 0) + (inA ? 0.5 : 0);
}
maeModel /= obs2025.length; maeNaive /= obs2025.length; cover80 /= obs2025.length;

// ── 2 · Preseason shrink: fit on 23-24 preseason, test on 2025 preseason ───────────────────────
const preObs = (season) => {
  // walk-forward state BEFORE each preseason game, using ALL prior finals (regular fits the state;
  // preseason games themselves never fold — same rule as the model)
  const out = [];
  for (const g of rows.filter((r) => (r.seasonType ?? r.phase) === 1 && (season ? r.season === season : true))) {
    if (g.ftHome === g.ftAway) continue; // ties carry no two-way signal for the shrink fit
    const state = strengthStateAt({ rows, cutoffIso: g.dateUtc });
    const home = typeof g.home === "string" ? g.home : g.home?.abbr;
    const away = typeof g.away === "string" ? g.away : g.away?.abbr;
    out.push({ d: state.ratingFor(home) + ELO_PARAMS.HOME_ADVANTAGE - state.ratingFor(away), homeWon: g.ftHome > g.ftAway, season: g.season });
  }
  return out;
};
const trainPre = [...preObs(2023), ...preObs(2024)];
const testPre = preObs(2025);
const logLossAt = (obs, shrink) => -obs.reduce((s, o) => {
  const p = Math.min(1 - 1e-12, Math.max(1e-12, logistic(o.d * shrink)));
  return s + (o.homeWon ? Math.log(p) : Math.log(1 - p));
}, 0) / obs.length;
const GRID = [0.2, 0.35, 0.5, 0.7, 1.0];
const trainCurve = GRID.map((k) => ({ shrink: k, trainLogLoss: Number(logLossAt(trainPre, k).toFixed(4)) }));
const chosen = trainCurve.reduce((best, x) => (x.trainLogLoss < best.trainLogLoss ? x : best));
const testAtChosen = Number(logLossAt(testPre, chosen.shrink).toFixed(4));
const testAtFull = Number(logLossAt(testPre, 1.0).toFixed(4));

const report = {
  schemaVersion: 1,
  artifact: "nfl-gamesim-v1-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  simId: NFL_GAMESIM_ID,
  regularConsistency: {
    probedGames: 12,
    maxSimVsAnalyticGap: Number(maxGap.toFixed(4)),
    bound: 0.015,
    pass: maxGap <= 0.015,
    note: "the sim's REPORTED win head must BE the analytic head — a gap beyond tie-decomposition noise is drift",
    knownHeadDivergence: { maxScoreImpliedVsReported: Number(maxHeadDivergence.toFixed(4)), note: "margin-probit vs elo-logistic disagreement — a property of the two fitted heads, shipped as a visible diagnostic on every artifact (this release's own eval found it)" },
  },
  scoreMarginals2025Regular: {
    n: obs2025.length,
    teamScoreMAE: Number(maeModel.toFixed(3)),
    naiveLeagueAvgMAE: Number(maeNaive.toFixed(3)),
    interval80Coverage: Number(cover80.toFixed(4)),
    note: "coverage near 0.80 = honest widths; the naive gap is the margin head's contribution to scores",
  },
  preseasonShrink: {
    protocol: "fit on 2023-24 preseason decisive games only; grid over " + JSON.stringify(GRID) + "; tested once on 2025 preseason",
    train: { n: trainPre.length, curve: trainCurve, chosenShrink: chosen.shrink },
    test: { n: testPre.length, logLossAtChosen: testAtChosen, logLossAtFullSignal: testAtFull, coin: 0.6931 },
    committedVariant: PRESEASON_VARIANT,
    committedMatchesChosen: PRESEASON_VARIANT.marginShrink === chosen.shrink,
  },
  honesty: [
    "the preseason variant is RESEARCH_ONLY: it widens and shrinks a regular-season fit; it does not model participation — player markets stay gated regardless",
    "sigmaWiden 1.25 is a stated conservatism choice (unfit) — it widens intervals and cannot sharpen any claim",
    "no market data touches the simulation; comparison happens beside it",
  ],
};
const outPath = path.join(APP, "..", "data/internal/research/nfl/reports/gamesim-v1-evaluation.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 1) + "\n");
console.log(`regular consistency: maxGap ${report.regularConsistency.maxSimVsAnalyticGap} (bound .015) → ${report.regularConsistency.pass ? "PASS" : "FAIL"}`);
console.log(`2025 regular scores: MAE ${report.scoreMarginals2025Regular.teamScoreMAE} vs naive ${report.scoreMarginals2025Regular.naiveLeagueAvgMAE} · 80% coverage ${report.scoreMarginals2025Regular.interval80Coverage}`);
console.log(`preseason shrink: train chose ${chosen.shrink} (curve ${trainCurve.map((x) => `${x.shrink}:${x.trainLogLoss}`).join(" ")})`);
console.log(`preseason test 2025 (n=${testPre.length}): logLoss ${testAtChosen} at chosen vs ${testAtFull} at full signal vs coin 0.6931`);
console.log(`committed variant matches train choice: ${report.preseasonShrink.committedMatchesChosen}`);
