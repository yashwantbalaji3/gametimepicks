#!/usr/bin/env node
/**
 * Tune the FIFA-Poisson soccer engine against the 2022 WC harness (64 matches), HONESTLY.
 *
 * Optimizes primarily for LOG LOSS. Because N=64 is tiny, tuning is guarded two ways:
 *   1. 5-fold cross-validation: the best config is selected on the TRAIN folds and scored on the held-out TEST
 *      fold. If the CV test log loss barely beats untuned, the full-sample gain is overfitting.
 *   2. Bootstrap CI (seeded): resample the 64 matches with replacement and measure the (untuned − tuned) log-loss
 *      gain. If the 95% CI includes 0, the improvement is not robust.
 * Deterministic (seeded mulberry32) so the artifact is reproducible. Leakage controls identical to the backtest:
 * pre-tournament FIFA points, 90-min scores, no per-match learning.
 *
 * Writes (INTERNAL ONLY):
 *   data/internal/world-cup/projection-engine/tuning/2022-wc-grid-search.json
 *   data/internal/world-cup/projection-engine/backtests/2022-wc-tuned.json
 * Usage: node app/scripts/tune-soccer-engine-2022-wc.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectMatch, brier1x2, rps1x2 } from "../src/lib/world-cup/internal-soccer-projection-engine.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const ref = (p) => JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/world-cup/reference", p), "utf8"));
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();

const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Pre-resolve every match into (hf, af, actual, total, btts) once.
const fifa = new Map(Object.entries(ref("fifa-points-2022.json").points).map(([k, v]) => [norm(k), v]));
const matches = [];
for (const m of ref("wc-2022-results.json").matches) {
  const hf = fifa.get(norm(m.home)), af = fifa.get(norm(m.away));
  if (hf == null || af == null) continue;
  const hg = m.ft && m.ft.home != null ? m.ft.home : m.homeGoals;
  const ag = m.ft && m.ft.away != null ? m.ft.away : m.awayGoals;
  if (hg == null || ag == null) continue;
  matches.push({ home: m.home, away: m.away, hf, af, actual: hg > ag ? "home" : hg === ag ? "draw" : "away", total: hg + ag, btts: hg >= 1 && ag >= 1, fifaFav: hf >= af ? "home" : "away" });
}
const N = matches.length;
const allIdx = matches.map((_, i) => i);

const logLossOne = (p, outcome) => -Math.log(clamp(outcome === "home" ? p.homeWin : outcome === "draw" ? p.draw : p.awayWin, 1e-9, 1));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

// Evaluate a config over a set of match indices → metric bundle.
function evaluate(cfg, idx) {
  let ll = 0, br = 0, rp = 0, hit = 0, drawPred = 0, drawAct = 0, totAbs = 0, totBias = 0, bttsHit = 0;
  for (const i of idx) {
    const m = matches[i];
    const proj = projectMatch({ homeFifaPoints: m.hf, awayFifaPoints: m.af, supremacyPerFifaPoint: cfg.supremacyPerFifaPoint, baseTotalGoals: cfg.baseTotalGoals, drawInflation: cfg.drawInflation, supremacyCap: cfg.supremacyCap });
    const p = proj.matchResult90;
    ll += logLossOne(p, m.actual); br += brier1x2(p, m.actual); rp += rps1x2(p, m.actual) / 2;
    const pick = p.homeWin >= p.draw && p.homeWin >= p.awayWin ? "home" : p.awayWin >= p.draw ? "away" : "draw";
    if (pick === m.actual) hit++;
    drawPred += p.draw; if (m.actual === "draw") drawAct++;
    totAbs += Math.abs(proj.totalGoals.expected - m.total); totBias += proj.totalGoals.expected - m.total;
    if ((proj.btts.yes > 0.5) === m.btts) bttsHit++;
  }
  const n = idx.length;
  return { logLoss: ll / n, brier: br / n, rps: rp / n, topPick: hit / n, drawPred: drawPred / n, drawActual: drawAct / n, totalMAE: totAbs / n, totalBias: totBias / n, bttsAcc: bttsHit / n };
}

// --- Grid ---
const supremacyGrid = [];
for (let s = 0.0015; s <= 0.00651; s += 0.0005) supremacyGrid.push(+s.toFixed(5));
const baseGrid = [2.4, 2.5, 2.6, 2.7, 2.8, 2.9];
const drawGrid = [1.0, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3];
const grid = [];
for (const sp of supremacyGrid) for (const bg of baseGrid) for (const di of drawGrid) grid.push({ supremacyPerFifaPoint: sp, baseTotalGoals: bg, drawInflation: di, supremacyCap: 2.6 });

const UNTUNED = { supremacyPerFifaPoint: 0.0035, baseTotalGoals: 2.6, drawInflation: 1.0, supremacyCap: 2.6 };
const untunedFull = evaluate(UNTUNED, allIdx);

// Full-sample ranking by log loss.
const ranked = grid.map((cfg) => ({ cfg, m: evaluate(cfg, allIdx) })).sort((a, b) => a.m.logLoss - b.m.logLoss);
const best = ranked[0];

// --- 5-fold CV (seeded shuffle) ---
const rng = mulberry32(20221120);
const shuffled = [...allIdx];
for (let i = shuffled.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
const K = 5;
const folds = Array.from({ length: K }, (_, k) => shuffled.filter((_, i) => i % K === k));
let cvTunedLL = 0, cvUntunedLL = 0;
const cvPicks = [];
for (let k = 0; k < K; k++) {
  const test = folds[k];
  const train = folds.filter((_, x) => x !== k).flat();
  const bestOnTrain = grid.map((cfg) => ({ cfg, ll: evaluate(cfg, train).logLoss })).sort((a, b) => a.ll - b.ll)[0].cfg;
  cvTunedLL += evaluate(bestOnTrain, test).logLoss;
  cvUntunedLL += evaluate(UNTUNED, test).logLoss;
  cvPicks.push({ fold: k, selected: bestOnTrain });
}
cvTunedLL /= K; cvUntunedLL /= K;

// --- Bootstrap CI on (untuned − best) log-loss gain ---
const rng2 = mulberry32(987654321);
const B = 2000;
const diffs = [];
for (let b = 0; b < B; b++) {
  const sample = Array.from({ length: N }, () => Math.floor(rng2() * N));
  diffs.push(evaluate(UNTUNED, sample).logLoss - evaluate(best.cfg, sample).logLoss);
}
diffs.sort((a, b) => a - b);
const ci = { lo: +diffs[Math.floor(0.025 * B)].toFixed(4), median: +diffs[Math.floor(0.5 * B)].toFixed(4), hi: +diffs[Math.floor(0.975 * B)].toFixed(4) };
const robust = ci.lo > 0; // 95% CI for the gain excludes 0

// --- 1-D supremacy-only sweep (base=2.6, draw=1.0 fixed) — the primary parameter, far less overfit-prone ---
const oneDGrid = supremacyGrid.map((sp) => ({ supremacyPerFifaPoint: sp, baseTotalGoals: 2.6, drawInflation: 1.0, supremacyCap: 2.6 }));
const oneDRanked = oneDGrid.map((cfg) => ({ cfg, m: evaluate(cfg, allIdx) })).sort((a, b) => a.m.logLoss - b.m.logLoss);
const oneDBest = oneDRanked[0];
let oneDcvTuned = 0, oneDcvUntuned = 0;
for (let k = 0; k < K; k++) {
  const test = folds[k], train = folds.filter((_, x) => x !== k).flat();
  const bestOnTrain = oneDGrid.map((cfg) => ({ cfg, ll: evaluate(cfg, train).logLoss })).sort((a, b) => a.ll - b.ll)[0].cfg;
  oneDcvTuned += evaluate(bestOnTrain, test).logLoss; oneDcvUntuned += evaluate(UNTUNED, test).logLoss;
}
oneDcvTuned /= K; oneDcvUntuned /= K;
const oneDSweep = oneDRanked.map((r) => ({ supremacy: r.cfg.supremacyPerFifaPoint, logLoss: +r.m.logLoss.toFixed(4), brier: +r.m.brier.toFixed(4), drawPred: +r.m.drawPred.toFixed(3), topPick: +r.m.topPick.toFixed(3) })).sort((a, b) => a.supremacy - b.supremacy);

const round = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, +v.toFixed(4)]));
const gridSearch = {
  version: "soccer-engine-tuning-2022wc-v1", asOf: "2026-07-14", public: false, internalOnly: true, webServed: false, officialMoneyRecordAffected: false,
  objective: "log_loss", sampleSize: N, gridConfigs: grid.length, seed: { cv: 20221120, bootstrap: 987654321 },
  leakageNote: "Pre-tournament Oct-2022 FIFA points, 90-min scores, no per-match learning. CV selects config on train folds only; bootstrap is on the 64-match empirical distribution.",
  untuned: { cfg: UNTUNED, metrics: round(untunedFull) },
  bestFullSample: { cfg: best.cfg, metrics: round(best.m) },
  crossValidation: { folds: K, tunedTestLogLoss: +cvTunedLL.toFixed(4), untunedTestLogLoss: +cvUntunedLL.toFixed(4), cvImprovement: +(cvUntunedLL - cvTunedLL).toFixed(4), selectedPerFold: cvPicks },
  bootstrap: { resamples: B, gainLogLoss_untunedMinusTuned: ci, robust95: robust },
  top5: ranked.slice(0, 5).map((r) => ({ cfg: r.cfg, logLoss: +r.m.logLoss.toFixed(4), brier: +r.m.brier.toFixed(4), topPick: +r.m.topPick.toFixed(3) })),
  supremacyOnlySweep: { note: "1-D sweep of the primary parameter, base=2.6 draw=1.0 fixed.", best: { cfg: oneDBest.cfg, metrics: round(oneDBest.m) }, cv: { tunedTestLogLoss: +oneDcvTuned.toFixed(4), untunedTestLogLoss: +oneDcvUntuned.toFixed(4), improvement: +(oneDcvUntuned - oneDcvTuned).toFixed(4) }, sweep: oneDSweep },
};
const tuneDir = path.join(REPO, "data/internal/world-cup/projection-engine/tuning");
fs.mkdirSync(tuneDir, { recursive: true });
fs.writeFileSync(path.join(tuneDir, "2022-wc-grid-search.json"), JSON.stringify(gridSearch, null, 2));

// Tuned backtest artifact (full metric bundle at the best config, honest verdict).
const bm = best.m;
const fifaFavAcc = mean(matches.map((m) => (m.fifaFav === m.actual ? 1 : 0)));
const tuned = {
  version: "internal-soccer-projection-backtest-2022wc-tuned-v1", asOf: "2026-07-14", public: false, internalOnly: true, webServed: false, officialMoneyRecordAffected: false,
  engine: "bivariate_poisson_fifa_supremacy", tunedConfig: best.cfg, sampleSize: N, backtestStatus: "internal_only",
  leakageNote: gridSearch.leakageNote,
  marketBaseline: { available: false, reason: "2022 closing odds not on the API-Football free plan. See SOCCER_ODDS_HISTORY_PROVIDER_SCOPE.md." },
  metrics: { tuned: round(bm), untuned: round(untunedFull), baselineUniform: { note: "uniform Brier 0.6667, logLoss 1.0986 (see 2022-wc.json)" }, baselineFifaFavorite: { topPick: +fifaFavAcc.toFixed(3) } },
  crossValidation: gridSearch.crossValidation, bootstrap: gridSearch.bootstrap,
  verdict: {
    improvesProperScores: bm.logLoss < untunedFull.logLoss && bm.brier < untunedFull.brier,
    cvConfirmed: cvTunedLL < cvUntunedLL, bootstrapRobust: robust,
    beatsFifaFavoriteTopPick: bm.topPick > fifaFavAcc, publicReady: false,
    note: "Tuned stays INTERNAL. Even a proper-score gain is not public-ready without a MARKET baseline, and top-pick is what matters least. Read CV + bootstrap before believing the full-sample gain.",
  },
};
fs.writeFileSync(path.join(REPO, "data/internal/world-cup/projection-engine/backtests/2022-wc-tuned.json"), JSON.stringify(tuned, null, 2));

console.log(`✓ grid ${grid.length} configs, N=${N}`);
console.log(`  UNTUNED  logLoss ${untunedFull.logLoss.toFixed(4)} · Brier ${untunedFull.brier.toFixed(4)} · top-pick ${(untunedFull.topPick * 100).toFixed(1)}% · draw ${untunedFull.drawPred.toFixed(3)}/${untunedFull.drawActual.toFixed(3)}`);
console.log(`  BEST     ${JSON.stringify(best.cfg)}`);
console.log(`           logLoss ${bm.logLoss.toFixed(4)} · Brier ${bm.brier.toFixed(4)} · top-pick ${(bm.topPick * 100).toFixed(1)}% · draw ${bm.drawPred.toFixed(3)}/${bm.drawActual.toFixed(3)} · totalBias ${bm.totalBias.toFixed(3)}`);
console.log(`  CV(5)    tuned ${cvTunedLL.toFixed(4)} vs untuned ${cvUntunedLL.toFixed(4)}  (improvement ${(cvUntunedLL - cvTunedLL).toFixed(4)})`);
console.log(`  BOOT     gain 95% CI [${ci.lo}, ${ci.hi}] median ${ci.median}  robust=${robust}`);
console.log(`  1-D sup  best ${oneDBest.cfg.supremacyPerFifaPoint} logLoss ${oneDBest.m.logLoss.toFixed(4)} draw ${oneDBest.m.drawPred.toFixed(3)} | CV tuned ${oneDcvTuned.toFixed(4)} vs untuned ${oneDcvUntuned.toFixed(4)} (imp ${(oneDcvUntuned - oneDcvTuned).toFixed(4)})`);
console.log(`  FIFA-fav top-pick ${(fifaFavAcc * 100).toFixed(1)}%  | tuned beats it: ${bm.topPick > fifaFavAcc}`);
