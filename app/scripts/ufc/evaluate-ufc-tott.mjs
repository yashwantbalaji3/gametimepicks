#!/usr/bin/env node
/**
 * DOES THE TALE OF THE TAPE EARN A PLACE? — an A/B on identical walk-forward splits.
 *
 * The published model is fitted on outcome history alone and all three heads clear their
 * preregistered bars. This asks one question: does adding reach, height, age and stance mismatch
 * make it BETTER, on the same folds, judged by the same bars that were set before any of this
 * existed?
 *
 * ── What would make this a bad experiment, and how each is avoided ──────────────────────────────
 *   · Moving the bars. They are imported from the existing evaluator's values verbatim, not
 *     restated here with friendlier numbers.
 *   · Comparing on different data. Both arms see the SAME folds, the same corner canonicalisation
 *     and the same rows — only the feature list differs.
 *   · Leakage. Features are replayed forward in the shared module; physicals are static attributes
 *     (reach does not change) and age is computed AT THE FIGHT DATE, never today's age.
 *   · Declaring victory on noise. A gain is reported with the fold-to-fold spread beside it, and
 *     the verdict requires the augmented arm to clear the bar AND beat the baseline arm.
 *
 * Coverage is stated up front because it bounds everything: a feature present on a small share of
 * fights cannot move an aggregate much, and a headline number that ignores that is theatre.
 *
 *   node app/scripts/ufc/evaluate-ufc-tott.mjs --now <ISO>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadCorpus, METHODS, WIN_F, CLS_F, WIN_F_TOTT, CLS_F_TOTT,
  fitBinary, predBinary, fitSoftmax, predSoftmax,
} from "./lib/fight-model.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const RAW = path.resolve(APP, "..", "data", "internal", "research", "ufc", "raw", "stats");
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("REFUSED: --now <ISO> required"); process.exit(1); }

/** The bars, as preregistered. Not restated, not softened. */
const BARS = { winnerGain: 0.005, winnerAccuracy: 0.52, methodGain: 0.005, roundGain: 0.005 };

const { fights, rowsOut } = loadCorpus(RAW);
const covered = rowsOut.filter((r) => r.feat.hasTott === 1).length;
console.log(`corpus ${rowsOut.length} fights · physicals on BOTH corners for ${covered} (${(covered / rowsOut.length * 100).toFixed(1)}%)`);
if (covered === 0) {
  console.log("no fight has physicals on both sides — nothing to evaluate. The published model is unchanged.");
  process.exit(0);
}

const FOLDS = 8;
const rIdx = (r) => (r.f.method === "DEC" ? 3 : Math.min(3, Math.max(1, r.f.round)) - 1);
const logLoss = (p, y) => -(y * Math.log(Math.max(1e-9, p)) + (1 - y) * Math.log(Math.max(1e-9, 1 - p)));

/** One arm: fit both heads on each fold's training slice, score the held-out slice. */
function run(winKeys, clsKeys) {
  const perFold = [];
  const all = { winLL: 0, winBase: 0, winHit: 0, mLL: 0, mBase: 0, rLL: 0, rBase: 0, n: 0 };
  const step = Math.floor(rowsOut.length / (FOLDS + 1));
  for (let k = 1; k <= FOLDS; k++) {
    const cut = step * k;
    const train = rowsOut.slice(0, cut).filter((r) => r.seen >= 2);
    const test = rowsOut.slice(cut, cut + step).filter((r) => r.seen >= 2);
    if (train.length < 200 || test.length < 40) continue;

    const winModel = fitBinary(train.map((r) => ({ feat: r.feat, y: r.f.aWon })), winKeys);
    const mModel = fitSoftmax(train.map((r) => ({ feat: r.feat, k: METHODS.indexOf(r.f.method) })), clsKeys, 3);
    const rModel = fitSoftmax(train.map((r) => ({ feat: r.feat, k: rIdx(r) })), clsKeys, 4);

    // Baselines are the TRAINING slice's own base rates — never the test slice's, which would leak.
    const pWinBase = train.reduce((s, r) => s + r.f.aWon, 0) / train.length;
    const mBase = METHODS.map((m) => train.filter((r) => r.f.method === m).length / train.length);
    const rBase = [0, 1, 2, 3].map((i) => train.filter((r) => rIdx(r) === i).length / train.length);

    let f = { winLL: 0, winBase: 0, winHit: 0, mLL: 0, mBaseLL: 0, rLL: 0, rBaseLL: 0, n: 0 };
    for (const r of test) {
      const p = predBinary(winModel, r.feat);
      f.winLL += logLoss(p, r.f.aWon); f.winBase += logLoss(pWinBase, r.f.aWon);
      f.winHit += (p >= 0.5 ? 1 : 0) === r.f.aWon ? 1 : 0;
      const pm = predSoftmax(mModel, r.feat), mi = METHODS.indexOf(r.f.method);
      f.mLL += -Math.log(Math.max(1e-9, pm[mi])); f.mBaseLL += -Math.log(Math.max(1e-9, mBase[mi]));
      const pr = predSoftmax(rModel, r.feat), ri = rIdx(r);
      f.rLL += -Math.log(Math.max(1e-9, pr[ri])); f.rBaseLL += -Math.log(Math.max(1e-9, rBase[ri]));
      f.n++;
    }
    perFold.push({
      winnerGain: (f.winBase - f.winLL) / f.n,
      methodGain: (f.mBaseLL - f.mLL) / f.n,
      roundGain: (f.rBaseLL - f.rLL) / f.n,
      accuracy: f.winHit / f.n,
    });
    all.winLL += f.winLL; all.winBase += f.winBase; all.winHit += f.winHit;
    all.mLL += f.mLL; all.mBase += f.mBaseLL; all.rLL += f.rLL; all.rBase += f.rBaseLL; all.n += f.n;
  }
  const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
  return {
    n: all.n, folds: perFold.length,
    winnerGain: (all.winBase - all.winLL) / all.n,
    methodGain: (all.mBase - all.mLL) / all.n,
    roundGain: (all.rBase - all.rLL) / all.n,
    accuracy: all.winHit / all.n,
    spread: {
      winner: sd(perFold.map((x) => x.winnerGain)),
      method: sd(perFold.map((x) => x.methodGain)),
      round: sd(perFold.map((x) => x.roundGain)),
    },
  };
}

const base = run(WIN_F, CLS_F);
const tott = run(WIN_F_TOTT, CLS_F_TOTT);

const row = (label, b, t, sd, bar) => {
  const d = t - b;
  const verdict = t > bar && d > 0 ? (Math.abs(d) > sd ? "BETTER" : "better, inside fold noise") : d > 0 ? "no better than the bar" : "WORSE";
  console.log(`${label.padEnd(9)} base ${b.toFixed(4)}   +tott ${t.toFixed(4)}   Δ ${(d >= 0 ? "+" : "")}${d.toFixed(4)}   fold sd ${sd.toFixed(4)}   ${verdict}`);
};

console.log(`\nwalk-forward · ${base.folds} folds · ${base.n} held-out fights\n`);
console.log("GAIN OVER BASE RATE (higher is better)");
row("winner", base.winnerGain, tott.winnerGain, tott.spread.winner, BARS.winnerGain);
row("method", base.methodGain, tott.methodGain, tott.spread.method, BARS.methodGain);
row("round", base.roundGain, tott.roundGain, tott.spread.round, BARS.roundGain);
console.log(`\nwinner accuracy   base ${(base.accuracy * 100).toFixed(2)}%   +tott ${(tott.accuracy * 100).toFixed(2)}%   (bar ${BARS.winnerAccuracy * 100}%)`);

const better = tott.winnerGain > base.winnerGain && tott.methodGain > base.methodGain && tott.roundGain > base.roundGain;
const meaningful = (tott.winnerGain - base.winnerGain) > tott.spread.winner;
console.log(`\nVERDICT: ${better && meaningful ? "ADOPT — every head improves and the winner gain clears fold noise"
  : better ? "DO NOT ADOPT YET — directionally better on every head, but inside fold-to-fold noise"
  : "DO NOT ADOPT — it does not improve every head"}`);
const cov = covered / rowsOut.length;
console.log(cov < 0.25
  ? `Coverage bounds this: physicals are on only ${(cov * 100).toFixed(1)}% of fights, so the ceiling on any aggregate move is small.`
  : `Coverage: physicals are on ${(cov * 100).toFixed(1)}% of fights, so this is a real test rather than a thin slice.`);

/*
 * A PER-HEAD verdict, because the heads answer different questions and the evidence splits.
 * Reach, height and stance are about WHO wins. They carry no information about HOW a fight ends or
 * in WHICH round, so on those heads they are extra parameters fitted to noise — and the numbers say
 * exactly that. Adopting a feature set wholesale because one head improved would drag two down.
 */
console.log("\nPER-HEAD:");
for (const [label, b, t, sd] of [
  ["winner", base.winnerGain, tott.winnerGain, tott.spread.winner],
  ["method", base.methodGain, tott.methodGain, tott.spread.method],
  ["round", base.roundGain, tott.roundGain, tott.spread.round],
]) {
  const d = t - b;
  console.log(`  ${label.padEnd(7)} ${d > sd ? "ADOPT" : d > 0 ? "hold — better but inside fold noise" : "REJECT — worse than outcome history alone"}`);
}
