#!/usr/bin/env node
/**
 * UFC three-head fight model — WINNER, METHOD OF VICTORY, and ENDING ROUND — walk-forward evaluated.
 *
 * Supersedes the distance-only model. An earlier pass concluded method of victory was unmodellable;
 * that was true of the corpus it looked at (the ESPN play-by-play subset holds 329 decisions, 154
 * submissions and zero KOs) but wrong as a general claim. The fight-level corpus this script uses
 * carries a real method distribution — 4,113 decisions, 2,899 KO/TKOs, 1,717 submissions — so all
 * three heads are modellable, and each is judged on its own bar.
 *
 * ── The label-order trap ────────────────────────────────────────────────────────────────────────
 * OUTCOME is "W/L" in 5,567 rows and "L/W" in 3,122: the source lists the WINNER FIRST about 64% of
 * the time. A model fed fighters in listed order would score ~64% by learning the bookkeeping
 * convention and nothing about fighting. So corners are canonicalised ALPHABETICALLY, independent of
 * the result, which forces the winner label to sit near 50% by construction. The script asserts that
 * before it trains — if the balance drifts, the ordering leaked and the run aborts.
 *
 * ── Leakage ────────────────────────────────────────────────────────────────────────────────────
 * Every feature is accumulated by replaying fights in date order; a fight sees only what happened
 * strictly before it. Nothing reads a career-to-date aggregate, which would include the bout itself.
 */
import fs from "node:fs";
import path from "node:path";
import { loadCorpus, METHODS, WIN_F, CLS_F, fitBinary, predBinary, fitSoftmax, predSoftmax } from "./lib/fight-model.mjs";

const APP = process.cwd();
const RAW = path.join(APP, "..", "data", "internal", "research", "ufc", "raw", "stats");
const OUT = path.join(APP, "public", "data", "ufc");

if (!fs.existsSync(path.join(RAW, "ufc_fight_results.csv"))) {
  console.log("ufc fight model: fight-level corpus absent — nothing to evaluate");
  process.exit(0);
}

// Corpus, corner canonicalisation and features all come from the SHARED module the card builder
// uses, so the thing validated here and the thing published there cannot drift apart.
const corpus = loadCorpus(RAW);
const { fights, excluded, rowsOut, baseMethod, aWinRate } = corpus;

console.log(`dataset: ${fights.length} decisive fights · ${fights[0].date.toISOString().slice(0, 10)} → ${fights.at(-1).date.toISOString().slice(0, 10)}`);
console.log(`excluded: ${JSON.stringify(excluded)}`);
console.log(`corner balance after canonicalisation: A wins ${(aWinRate * 100).toFixed(1)}% (listing order would have been ~64%)`);
if (Math.abs(aWinRate - 0.5) > 0.03) {
  console.error(`ABORT: corner assignment is ${(aWinRate * 100).toFixed(1)}% — the ordering leaks the result and any winner score would be an artifact.`);
  process.exit(1);
}
console.log(`method base rates: ${METHODS.map((m) => `${m} ${((baseMethod[m] / fights.length) * 100).toFixed(1)}%`).join(" · ")}`);

// ── Walk-forward ───────────────────────────────────────────────────────────────────────────────
const FOLDS = 8;
const start = Math.floor(rowsOut.length * 0.35);
const step = Math.floor((rowsOut.length - start) / FOLDS);
const MIN_SEEN = 2;

const res = {
  winner: { m: 0, b: 0, n: 0, correct: 0, preds: [] },
  method: { m: 0, b: 0, n: 0, correct: 0, byClass: {} },
  round: { m: 0, b: 0, n: 0, correct: 0 },
};
const ROUND_CLASSES = [1, 2, 3]; // 3 = "reached round 3 or beyond" — 4 and 5 are only 4.4% of fights

for (let fold = 0; fold < FOLDS; fold++) {
  const cut = start + fold * step;
  const end = fold === FOLDS - 1 ? rowsOut.length : cut + step;
  const trainRows = rowsOut.slice(0, cut);
  const testRows = rowsOut.slice(cut, end).filter((r) => r.seen >= MIN_SEEN);
  if (!testRows.length) continue;

  const winTrain = trainRows.map((r) => ({ feat: r.feat, y: r.f.aWon }));
  const winModel = fitBinary(winTrain, WIN_F);
  const winBase = 0.5; // canonical corners make the honest no-information answer exactly 0.5

  const mTrain = trainRows.map((r) => ({ feat: r.feat, k: METHODS.indexOf(r.f.method) }));
  const mModel = fitSoftmax(mTrain, CLS_F, 3);
  const mBase = METHODS.map((k) => trainRows.filter((r) => r.f.method === k).length / trainRows.length);

  const rIdx = (r) => Math.min(r.f.round, 3) - 1;
  const rTrain = trainRows.map((r) => ({ feat: r.feat, k: rIdx(r) }));
  const rModel = fitSoftmax(rTrain, CLS_F, 3);
  const rBase = ROUND_CLASSES.map((_, k) => trainRows.filter((r) => rIdx(r) === k).length / trainRows.length);

  const ll = (p) => -Math.log(Math.max(1e-9, p));
  for (const r of testRows) {
    // winner
    const p = predBinary(winModel, r.feat);
    res.winner.m += ll(r.f.aWon ? p : 1 - p);
    res.winner.b += ll(winBase);
    res.winner.correct += (p >= 0.5 ? 1 : 0) === r.f.aWon ? 1 : 0;
    res.winner.preds.push({ p: r.f.aWon ? p : 1 - p, y: 1, raw: p, actual: r.f.aWon });
    res.winner.n++;
    // method
    const pm = predSoftmax(mModel, r.feat);
    const ki = METHODS.indexOf(r.f.method);
    res.method.m += ll(pm[ki]); res.method.b += ll(mBase[ki]);
    res.method.correct += pm.indexOf(Math.max(...pm)) === ki ? 1 : 0;
    const bc = res.method.byClass[r.f.method] ?? { n: 0, p: 0 };
    bc.n++; bc.p += pm[ki]; res.method.byClass[r.f.method] = bc;
    res.method.n++;
    // ending round
    const pr = predSoftmax(rModel, r.feat);
    const kr = rIdx(r);
    res.round.m += ll(pr[kr]); res.round.b += ll(rBase[kr]);
    res.round.correct += pr.indexOf(Math.max(...pr)) === kr ? 1 : 0;
    res.round.n++;
  }
}

const report = (name, r, baseAcc) => {
  const m = r.m / r.n, b = r.b / r.n;
  console.log(`\n${name}: ${r.n} held-out fights`);
  console.log(`  log loss  model ${m.toFixed(4)}   baseline ${b.toFixed(4)}   gain ${(b - m).toFixed(4)}`);
  console.log(`  accuracy  model ${((r.correct / r.n) * 100).toFixed(1)}%   baseline ${(baseAcc * 100).toFixed(1)}%`);
  return { logLoss: m, baselineLogLoss: b, gain: b - m, accuracy: r.correct / r.n, baselineAccuracy: baseAcc, n: r.n };
};

const winStats = report("WINNER", res.winner, 0.5);
const methodBaseAcc = Math.max(...METHODS.map((k) => baseMethod[k])) / fights.length;
const methodStats = report("METHOD (KO / SUB / DEC)", res.method, methodBaseAcc);
const roundCounts = [1, 2, 3].map((_, k) => rowsOut.filter((r) => Math.min(r.f.round, 3) - 1 === k).length);
const roundStats = report("ENDING ROUND (1 / 2 / 3+)", res.round, Math.max(...roundCounts) / rowsOut.length);

console.log("\nmethod calibration (mean predicted probability of the class that occurred):");
for (const k of METHODS) {
  const bc = res.method.byClass[k];
  if (bc) console.log(`  ${k}: n=${String(bc.n).padStart(4)}  mean p(correct class) ${(bc.p / bc.n).toFixed(3)}  (base ${(baseMethod[k] / fights.length).toFixed(3)})`);
}

// Winner calibration in standard errors — the same statistically-valid test the distance model uses.
console.log("\nwinner calibration (predicted → observed):");
let maxZ = 0;
for (const [lo, hi] of [[0, 0.4], [0.4, 0.45], [0.45, 0.55], [0.55, 0.6], [0.6, 1]]) {
  const g = res.winner.preds.filter((x) => x.raw >= lo && x.raw < hi);
  if (g.length < 30) { console.log(`  ${lo}–${hi}: n=${g.length} (below 30, excluded)`); continue; }
  const exp = g.reduce((s, x) => s + x.raw, 0) / g.length;
  const obs = g.reduce((s, x) => s + x.actual, 0) / g.length;
  const se = Math.sqrt((exp * (1 - exp)) / g.length);
  const z = (obs - exp) / se;
  maxZ = Math.max(maxZ, Math.abs(z));
  console.log(`  ${lo}–${hi}: n=${String(g.length).padStart(4)}  predicted ${(exp * 100).toFixed(1)}%  observed ${(obs * 100).toFixed(1)}%  (${Math.abs(z).toFixed(1)} SE)`);
}

// ── Bars, fixed before the numbers were seen ───────────────────────────────────────────────────
const BARS = { winnerGain: 0.005, winnerAccuracy: 0.52, methodGain: 0.005, roundGain: 0.005, calibrationZ: 2 };
const verdicts = {
  winner: winStats.gain > BARS.winnerGain && winStats.accuracy > BARS.winnerAccuracy && maxZ <= BARS.calibrationZ ? "PASS" : "FAIL",
  method: methodStats.gain > BARS.methodGain ? "PASS" : "FAIL",
  round: roundStats.gain > BARS.roundGain ? "PASS" : "FAIL",
};
console.log(`\nBARS  winner: gain > ${BARS.winnerGain}, accuracy > ${BARS.winnerAccuracy * 100}%, |z| <= ${BARS.calibrationZ}  ·  method/round: gain > ${BARS.methodGain}`);
for (const [k, v] of Object.entries(verdicts)) console.log(`  ${k.toUpperCase()}: ${v}`);

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "fight-model-evaluation.json"), JSON.stringify({
  generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  corpus: { source: "scrape_ufc_stats (GPL-3.0)", fights: fights.length, from: fights[0].date.toISOString().slice(0, 10), to: fights.at(-1).date.toISOString().slice(0, 10), excluded },
  cornerCanonicalisation: { rule: "alphabetical, independent of outcome", aWinRate, listedOrderWinRate: 0.641 },
  baseRates: { method: Object.fromEntries(METHODS.map((k) => [k, baseMethod[k] / fights.length])) },
  heads: { winner: { ...winStats, maxCalibrationZ: maxZ }, method: methodStats, round: roundStats },
  bars: BARS,
  verdicts,
}, null, 1) + "\n");
console.log("\nwrote public/data/ufc/fight-model-evaluation.json");
