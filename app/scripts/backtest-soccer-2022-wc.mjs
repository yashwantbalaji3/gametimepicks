#!/usr/bin/env node
/**
 * Validate the internal FIFA-Poisson soccer engine against the FULL 2022 World Cup (64 matches).
 *
 * Data (trusted internal artifacts, committed):
 *   - data/internal/world-cup/reference/wc-2022-results.json  (API-Football v3, league=1 season=2022)
 *   - data/internal/world-cup/reference/fifa-points-2022.json (FIFA ranking 6 Oct 2022 — PRE-tournament)
 *
 * Leakage control (strict):
 *   - Strength input is the Oct-2022 FIFA ranking, published BEFORE the tournament — identical for every match,
 *     fit from none of these outcomes. No per-match learning.
 *   - Matches are graded on the 90-MINUTE fulltime score (score.fulltime), because the engine predicts
 *     regulation only (extra time / penalties excluded). This is the honest like-for-like comparison.
 *
 * Market baseline: 2022 closing odds are NOT available on the API-Football free plan (probed: results 0). So the
 * baselines here are uniform (1/3) and "always the FIFA favorite". The market comparison is DISCLOSED as
 * unavailable, not faked.
 *
 * Writes (INTERNAL ONLY): data/internal/world-cup/projection-engine/backtests/2022-wc.json
 * Usage: node app/scripts/backtest-soccer-2022-wc.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectMatch, brier1x2, rps1x2 } from "../src/lib/world-cup/internal-soccer-projection-engine.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const ref = (p) => JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/world-cup/reference", p), "utf8"));

const results = ref("wc-2022-results.json");
const fifaRef = ref("fifa-points-2022.json").points;
const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
const fifa = new Map(Object.entries(fifaRef).map(([k, v]) => [norm(k), v]));

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const logLoss = (p, outcome) => {
  const pa = outcome === "home" ? p.homeWin : outcome === "draw" ? p.draw : p.awayWin;
  return -Math.log(clamp(pa, 1e-9, 1));
};

const rows = [];
let missing = 0;
for (const m of results.matches) {
  const hf = fifa.get(norm(m.home));
  const af = fifa.get(norm(m.away));
  if (hf == null || af == null) { missing++; continue; }
  // 90-minute score (regulation) — fall back to final only if fulltime split is absent.
  const hg = m.ft && m.ft.home != null ? m.ft.home : m.homeGoals;
  const ag = m.ft && m.ft.away != null ? m.ft.away : m.awayGoals;
  if (hg == null || ag == null) { missing++; continue; }
  const actual = hg > ag ? "home" : hg === ag ? "draw" : "away";
  const proj = projectMatch({ homeFifaPoints: hf, awayFifaPoints: af });
  const p = proj.matchResult90;
  const pick = p.homeWin >= p.draw && p.homeWin >= p.awayWin ? "home" : p.awayWin >= p.draw ? "away" : "draw";
  rows.push({
    home: m.home, away: m.away, score90: `${hg}-${ag}`, actual, pick,
    p: { homeWin: +p.homeWin.toFixed(4), draw: +p.draw.toFixed(4), awayWin: +p.awayWin.toFixed(4) },
    expTotal: proj.totalGoals.expected, actualTotal: hg + ag,
    bttsPred: proj.btts.yes, bttsActual: hg >= 1 && ag >= 1,
    fifaFav: hf >= af ? "home" : "away",
  });
}

const n = rows.length;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const UNIFORM = { homeWin: 1 / 3, draw: 1 / 3, awayWin: 1 / 3 };

// Core scoring metrics
const model = {
  brier: +mean(rows.map((r) => brier1x2(r.p, r.actual))).toFixed(4),
  rps: +mean(rows.map((r) => rps1x2(r.p, r.actual) / 2)).toFixed(4),
  logLoss: +mean(rows.map((r) => logLoss(r.p, r.actual))).toFixed(4),
  topPickAccuracy: +mean(rows.map((r) => (r.pick === r.actual ? 1 : 0))).toFixed(3),
};
const uniform = {
  brier: +mean(rows.map((r) => brier1x2(UNIFORM, r.actual))).toFixed(4),
  rps: +mean(rows.map((r) => rps1x2(UNIFORM, r.actual) / 2)).toFixed(4),
  logLoss: +mean(rows.map((r) => logLoss(UNIFORM, r.actual))).toFixed(4),
};
const fifaFav = { topPickAccuracy: +mean(rows.map((r) => (r.fifaFav === r.actual ? 1 : 0))).toFixed(3) };

// Draw calibration: mean predicted draw prob vs realized draw rate
const drawCalibration = {
  meanPredicted: +mean(rows.map((r) => r.p.draw)).toFixed(3),
  actualRate: +mean(rows.map((r) => (r.actual === "draw" ? 1 : 0))).toFixed(3),
};
// Favorite calibration: among matches with a clear model favorite (>=45%), how often the favorite (by prob) wins
const favRows = rows.filter((r) => Math.max(r.p.homeWin, r.p.awayWin) >= 0.45);
const favoriteCalibration = {
  matches: favRows.length,
  meanPredictedFavProb: +mean(favRows.map((r) => Math.max(r.p.homeWin, r.p.awayWin))).toFixed(3),
  favWinRate: +mean(favRows.map((r) => { const fav = r.p.homeWin >= r.p.awayWin ? "home" : "away"; return fav === r.actual ? 1 : 0; })).toFixed(3),
};
// Total goals error (90-min)
const totalGoals = {
  meanAbsError: +mean(rows.map((r) => Math.abs(r.expTotal - r.actualTotal))).toFixed(3),
  meanBias: +mean(rows.map((r) => r.expTotal - r.actualTotal)).toFixed(3),
  modelMeanExpected: +mean(rows.map((r) => r.expTotal)).toFixed(3),
  actualMean: +mean(rows.map((r) => r.actualTotal)).toFixed(3),
};
// BTTS accuracy (predict yes if p>0.5)
const btts = {
  accuracy: +mean(rows.map((r) => ((r.bttsPred > 0.5) === r.bttsActual ? 1 : 0))).toFixed(3),
  meanPredicted: +mean(rows.map((r) => r.bttsPred)).toFixed(3),
  actualRate: +mean(rows.map((r) => (r.bttsActual ? 1 : 0))).toFixed(3),
};
// Calibration buckets over all 3*n outcome predictions (reliability diagram)
const preds = [];
for (const r of rows) {
  preds.push({ p: r.p.homeWin, y: r.actual === "home" ? 1 : 0 });
  preds.push({ p: r.p.draw, y: r.actual === "draw" ? 1 : 0 });
  preds.push({ p: r.p.awayWin, y: r.actual === "away" ? 1 : 0 });
}
const buckets = [];
for (let b = 0; b < 10; b++) {
  const lo = b / 10, hi = (b + 1) / 10;
  const inb = preds.filter((x) => x.p >= lo && (b === 9 ? x.p <= hi : x.p < hi));
  buckets.push({ range: `${lo.toFixed(1)}-${hi.toFixed(1)}`, count: inb.length, meanPredicted: inb.length ? +mean(inb.map((x) => x.p)).toFixed(3) : null, empirical: inb.length ? +mean(inb.map((x) => x.y)).toFixed(3) : null });
}

const beatsUniform = model.brier < uniform.brier && model.rps < uniform.rps && model.logLoss < uniform.logLoss;
const competesOrBeatsFifaFav = model.topPickAccuracy >= fifaFav.topPickAccuracy;

// --- Market baseline: The Odds API historical closing 1X2 (de-vigged consensus), if fetched ---
const baselinePath = path.join(REPO, "data/internal/world-cup/reference/wc-2022-closing-odds-baseline.json");
let marketBaseline = { available: false, reason: "closing-odds baseline not found — run app/scripts/fetch-wc-2022-closing-odds.mjs" };
let marketComparison = null;
if (fs.existsSync(baselinePath)) {
  const base = JSON.parse(fs.readFileSync(baselinePath, "utf8")).matches || [];
  const mkt = new Map(base.map((b) => [norm(b.home) + "|" + norm(b.away), b.closingDeVig]));
  const paired = rows.map((r) => ({ r, m: mkt.get(norm(r.home) + "|" + norm(r.away)) })).filter((x) => x.m);
  if (paired.length) {
    const toP = (m) => ({ homeWin: m.home, draw: m.draw, awayWin: m.away });
    const bundle = (probOf, pickOf) => ({
      brier: +mean(paired.map((x) => brier1x2(probOf(x), x.r.actual))).toFixed(4),
      rps: +mean(paired.map((x) => rps1x2(probOf(x), x.r.actual) / 2)).toFixed(4),
      logLoss: +mean(paired.map((x) => logLoss(probOf(x), x.r.actual))).toFixed(4),
      topPick: +mean(paired.map((x) => (pickOf(x) === x.r.actual ? 1 : 0))).toFixed(3),
    });
    const argmax = (p) => (p.homeWin >= p.draw && p.homeWin >= p.awayWin ? "home" : p.awayWin >= p.draw ? "away" : "draw");
    const marketM = bundle((x) => toP(x.m), (x) => argmax(toP(x.m)));
    const modelM = bundle((x) => x.r.p, (x) => x.r.pick);
    marketBaseline = { available: true, source: "The Odds API /historical closing 1X2, de-vigged consensus (~14 US books)", coverage: `${paired.length}/${rows.length}` };
    marketComparison = {
      coverage: paired.length, market: marketM, model: modelM,
      delta: { brier: +(modelM.brier - marketM.brier).toFixed(4), rps: +(modelM.rps - marketM.rps).toFixed(4), logLoss: +(modelM.logLoss - marketM.logLoss).toFixed(4) },
      modelBeatsMarket: modelM.brier < marketM.brier && modelM.logLoss < marketM.logLoss,
      note: "Lower is better. Positive delta = model WORSE than the closing market.",
    };
  }
}

const artifact = {
  version: "internal-soccer-projection-backtest-2022wc-v1",
  asOf: "2026-07-14",
  public: false,
  internal: true,
  webServed: false,
  officialMoneyRecordAffected: false,
  engine: "bivariate_poisson_fifa_supremacy",
  dataset: "2022 FIFA World Cup — all 64 matches (API-Football league=1 season=2022), graded on 90-minute fulltime score",
  strengthSource: "FIFA ranking points, 6 Oct 2022 (pre-tournament)",
  leakageNote: "FIFA ranking is pre-tournament and identical across matches; no parameter is fit on these outcomes; 90-min scores used only in evaluation. Extra time / penalties excluded (2 knockouts had ET goals; graded at 90').",
  marketBaseline,
  sampleSize: n,
  backtestStatus: n >= 40 ? "internal_only" : "insufficient_sample",
  metrics: { model, baselineUniform: uniform, baselineFifaFavorite: fifaFav, drawCalibration, favoriteCalibration, totalGoals, btts, calibrationBuckets: buckets },
  marketComparison,
  verdict: { beatsUniform, competesOrBeatsFifaFavorite: competesOrBeatsFifaFav, beatsMarket: marketComparison ? marketComparison.modelBeatsMarket : null, publicReady: false, note: "Beats uniform is table stakes. The bar is the CLOSING MARKET (marketComparison). Model stays internal unless it beats/matches the market AND the founder approves." },
  matches: rows,
};

const outDir = path.join(REPO, "data/internal/world-cup/projection-engine/backtests");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "2022-wc.json"), JSON.stringify(artifact, null, 2));

console.log(`✓ 2022 WC backtest — N=${n} (${missing} skipped), status=${artifact.backtestStatus}`);
console.log(`  MODEL    Brier ${model.brier} · RPS ${model.rps} · logLoss ${model.logLoss} · top-pick ${(model.topPickAccuracy * 100).toFixed(1)}%`);
console.log(`  UNIFORM  Brier ${uniform.brier} · RPS ${uniform.rps} · logLoss ${uniform.logLoss}`);
console.log(`  FIFA-fav top-pick ${(fifaFav.topPickAccuracy * 100).toFixed(1)}%`);
console.log(`  draw: pred ${drawCalibration.meanPredicted} vs actual ${drawCalibration.actualRate} | fav(>=45%): ${favoriteCalibration.matches} matches, pred ${favoriteCalibration.meanPredictedFavProb} win ${favoriteCalibration.favWinRate}`);
console.log(`  totals: MAE ${totalGoals.meanAbsError} bias ${totalGoals.meanBias} (model ${totalGoals.modelMeanExpected} vs actual ${totalGoals.actualMean}) | BTTS acc ${(btts.accuracy * 100).toFixed(0)}%`);
console.log(`  beatsUniform=${beatsUniform} competes/beats FIFA-fav=${competesOrBeatsFifaFav} | publicReady=false`);
if (marketComparison) {
  const c = marketComparison;
  console.log(`  MARKET   Brier ${c.market.brier} · RPS ${c.market.rps} · logLoss ${c.market.logLoss} · top-pick ${(c.market.topPick * 100).toFixed(1)}%  (${c.coverage} matches)`);
  console.log(`  MODEL(paired) Brier ${c.model.brier} · logLoss ${c.model.logLoss} · top-pick ${(c.model.topPick * 100).toFixed(1)}%`);
  console.log(`  Δ model−market: Brier ${c.delta.brier} · logLoss ${c.delta.logLoss}  → model beats market: ${c.modelBeatsMarket}`);
}
