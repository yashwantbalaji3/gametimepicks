/**
 * UFC model v1 — chronological replay with calibration and slices (Program 167 · Release F).
 * PRIVATE RESEARCH. The arithmetic is the committed baseline's (K=32/1500, decisive-only,
 * SPARSE<3, IDLE>540d) via the SAME lib the live shadow path uses — this report adds what the
 * baseline report lacked: calibration bins/ECE, favorite/underdog slices, and the abstention-
 * reason breakdown. Coverage semantics preserved (the ~25.6% headline is the denominator story).
 *
 * Warmup: observations before the corpus midpoint boundary (2024-08-03T19:00Z, the committed
 * baseline's boundary) fold state but are not scored — identical to the baseline protocol.
 *
 * Writes: data/internal/research/ufc/reports/model-v1-evaluation.json
 *         data/internal/research/ufc/model-card-v2.json
 * Usage:  node scripts/ufc/evaluate-ufc-model-v1.mjs --now <iso>
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { walkForwardUfcObservations, fitUfcV1, UFC_MODEL_ID, UFC_MODEL_VERSION, UFC_ELO_PARAMS } from "../../src/lib/sports/ufc/model-v1.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, f = null) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : f; };
const NOW = arg("--now");
if (!NOW || !Number.isFinite(Date.parse(NOW))) { console.error("usage: evaluate-ufc-model-v1.mjs --now <iso>"); process.exit(1); }

const corpus = JSON.parse(fs.readFileSync(path.join(APP, "..", "data/internal/research/ufc/corpus-v1.json"), "utf8"));
const WARMUP_BOUNDARY = "2024-08-03T19:00Z"; // the committed baseline's boundary — preserved verbatim

const obs = walkForwardUfcObservations(corpus.rows);
const scoredWindow = obs.filter((o) => o.dateUtc >= WARMUP_BOUNDARY);
const covered = scoredWindow.filter((o) => o.abstainRule === null);
const abstained = scoredWindow.filter((o) => o.abstainRule !== null);

const logLoss = (xs, pOf) => -xs.reduce((s, o) => { const p = Math.min(1 - 1e-12, Math.max(1e-12, pOf(o))); return s + (o.redWon ? Math.log(p) : Math.log(1 - p)); }, 0) / xs.length;
const brier = (xs, pOf) => xs.reduce((s, o) => s + ((o.redWon ? 1 : 0) - pOf(o)) ** 2, 0) / xs.length;
const accuracy = (xs) => xs.filter((o) => (o.pRed >= 0.5) === o.redWon).length / xs.length;

const calibration = (xs, bins = 10) => {
  const rows = [];
  let ece = 0;
  for (let b = 0; b < bins; b++) {
    const lo = b / bins, hi = (b + 1) / bins;
    const inBin = xs.filter((o) => o.pRed >= lo && (b === bins - 1 ? o.pRed <= hi : o.pRed < hi));
    if (!inBin.length) { rows.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n: 0 }); continue; }
    const meanP = inBin.reduce((s, o) => s + o.pRed, 0) / inBin.length;
    const rate = inBin.filter((o) => o.redWon).length / inBin.length;
    ece += (inBin.length / xs.length) * Math.abs(meanP - rate);
    rows.push({ bin: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n: inBin.length, meanPredicted: Number(meanP.toFixed(4)), observedRedRate: Number(rate.toFixed(4)) });
  }
  return { bins: rows, ece: Number(ece.toFixed(4)) };
};

// favorite/underdog: favorite = the higher pre-bout Elo corner; a favorite pick is pRed>=.5 iff favoriteIsRed
const favoriteWon = (o) => (o.favoriteIsRed ? o.redWon : !o.redWon);
const favRate = covered.filter(favoriteWon).length / covered.length;

const byWeightClass = {};
for (const o of covered) {
  const wc = o.weightClass ?? "Unknown";
  (byWeightClass[wc] ??= []).push(o);
}
const weightSlices = Object.fromEntries(
  Object.entries(byWeightClass).sort()
    .map(([wc, xs]) => [wc, xs.length >= 20
      ? { n: xs.length, logLoss: Number(logLoss(xs, (o) => o.pRed).toFixed(4)), accuracy: Number(accuracy(xs).toFixed(4)) }
      : { n: xs.length, note: "sample too small to report" }]),
);

const abstentionBreakdown = {};
for (const o of abstained) abstentionBreakdown[o.abstainRule] = (abstentionBreakdown[o.abstainRule] ?? 0) + 1;

// Parity proof: folding the full corpus through fitUfcV1 must produce the same final state the
// walk-forward reached — the live path and this report share one arithmetic.
const fit = fitUfcV1(corpus.rows);

const report = {
  schemaVersion: 1,
  artifact: "ufc-model-v1-evaluation",
  dataClass: "PRIVATE_RESEARCH",
  generatedAt: NOW,
  modelId: UFC_MODEL_ID,
  modelVersion: UFC_MODEL_VERSION,
  protocol: {
    corpus: { totalRows: corpus.rows.length, decisiveFolded: fit.foldedBouts },
    warmupBoundary: WARMUP_BOUNDARY,
    scoredWindow: scoredWindow.length,
    note: "warmup folds state, never scores — the committed baseline's protocol, preserved",
  },
  coverage: {
    eligible: scoredWindow.length,
    covered: covered.length,
    abstained: abstained.length,
    coverageRate: Number((covered.length / scoredWindow.length).toFixed(4)),
    abstentionBreakdown,
  },
  metrics: {
    model: {
      n: covered.length,
      logLoss: Number(logLoss(covered, (o) => o.pRed).toFixed(4)),
      brier: Number(brier(covered, (o) => o.pRed).toFixed(4)),
      accuracy: Number(accuracy(covered).toFixed(4)),
      calibration: calibration(covered),
    },
    baselines: {
      coin: { logLoss: Number(logLoss(covered, () => 0.5).toFixed(4)) },
      redRatePrior: (() => { const r = covered.filter((o) => o.redWon).length / covered.length; return { p: Number(r.toFixed(4)), logLoss: Number(logLoss(covered, () => r).toFixed(4)) }; })(),
    },
  },
  slices: {
    favorite: { rate: Number(favRate.toFixed(4)), note: "share of covered bouts won by the higher pre-bout Elo corner" },
    byWeightClass: weightSlices,
  },
  honesty: [
    "uncovered bouts are ABSTENTIONS, never wrong picks — coverage shapes every headline number",
    "method/round/prop outputs do not exist (corpus is winner-only)",
    "no market data touches fit or predict; comparison happens beside the forecast in shadow runs",
    "no profit or market-beating claim is made or implied",
  ],
};

const reportPath = path.join(APP, "..", "data/internal/research/ufc/reports/model-v1-evaluation.json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 1) + "\n");

const card = {
  schemaVersion: 1,
  artifact: "ufc-model-card",
  dataClass: "PRIVATE_RESEARCH",
  modelId: UFC_MODEL_ID,
  version: 2,
  generatedAt: NOW,
  objective: "private pre-event WINNER probability for UFC bouts with first-class abstention; research comparison against no-vig two-way markets only after an authorized snapshot exists",
  method: `abstaining fighter Elo (K=${UFC_ELO_PARAMS.K}, start ${UFC_ELO_PARAMS.START}, decisive-only updates, no corner advantage) — the committed baseline promoted to the live adapter; deterministic, no RNG`,
  abstention: {
    IDENTITY: "fighter resolves by provider id, else UNIQUE normalized corpus name; zero or multiple matches abstain",
    SPARSE: `either fighter < ${UFC_ELO_PARAMS.SPARSE_FLOOR} prior decisive corpus bouts`,
    IDLE: `either fighter idle > ${UFC_ELO_PARAMS.IDLE_DAYS} days at bout time`,
    CARD_UNCERTAIN: "shadow-level: lineage instability across the newest two captures, staleness, or single-observation bouts — weigh-in/replacement facts have no authorized source (matrix MISSING), so instability always abstains",
  },
  population: { corpus: `${corpus.rows.length} finals (${fit.foldedBouts} decisive folded), ${corpus.drawOrNc ?? "12"} draw/NC excluded from updates`, warmup: WARMUP_BOUNDARY },
  metrics: { see: "reports/model-v1-evaluation.json", headline: { n: report.metrics.model.n, logLoss: report.metrics.model.logLoss, coin: report.metrics.baselines.coin.logLoss, coverage: report.coverage.coverageRate, ece: report.metrics.model.calibration.ece } },
  limitations: [
    "winner-only: method/round/props UNSUPPORTED by corpus shape",
    "coverage ~quarter of bouts by design — SPARSE/IDLE rules preserved from the baseline; the denominator story is part of every claim",
    "no weigh-in, reach, camp, or injury features — each is either an abstention trigger (card uncertainty) or absent, never imputed",
    "draw/no-contest settle as quarantine states in the settlement contract, never as wins",
  ],
  independenceFromMarket: "structural — no odds parameter exists in fit or predict",
  rightsAndProvenance: "corpus from ESPN public MMA scoreboard snapshots with attribution (see corpus sourceManifest); educational, paper-only",
  publicActivation: "OFF",
};
fs.writeFileSync(path.join(APP, "..", "data/internal/research/ufc/model-card-v2.json"), JSON.stringify(card, null, 1) + "\n");

console.log(`scored window ${scoredWindow.length} · covered ${covered.length} (${(report.coverage.coverageRate * 100).toFixed(1)}%) · abstained ${abstained.length} ${JSON.stringify(abstentionBreakdown)}`);
console.log(`model logLoss ${report.metrics.model.logLoss} vs coin ${report.metrics.baselines.coin.logLoss} vs red-prior ${report.metrics.baselines.redRatePrior.logLoss} · acc ${report.metrics.model.accuracy} · ECE ${report.metrics.model.calibration.ece}`);
console.log(`favorite rate ${report.slices.favorite.rate} · wrote reports/model-v1-evaluation.json + model-card-v2.json`);
