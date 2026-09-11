#!/usr/bin/env node
/**
 * MLB full-game validation: internal market-anchored sim vs the de-vigged CLOSING MARKET vs settled final scores.
 *
 * Data (internal, committed):
 *   - data/internal/mlb/reference/mlb-closing-odds.json   (The Odds API historical closing h2h+totals+spreads,
 *     de-vigged, joined to final scores — the market baseline over every settled game we could price)
 *   - data/internal/mlb/full-game-sim/<date>.json         (the internal sim — only 07-09 has both sim + finals)
 *
 * The market baseline is computed over ALL priced settled games; the SIM comparison is PAIRED on the games that
 * have a sim artifact (join by gamePk). Reports Brier, log loss, winner accuracy, total-runs MAE, margin MAE,
 * run-line cover accuracy, over/under accuracy, calibration buckets, and beats/matches/mirrors.
 *
 * Writes (INTERNAL, public:false): data/internal/mlb/full-game-sim-backtests/2026-market-vs-sim.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..", "..");
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const r4 = (x) => +x.toFixed(4);

const odds = JSON.parse(fs.readFileSync(path.join(REPO, "data/internal/mlb/reference/mlb-closing-odds.json"), "utf8")).games;

// Load sim artifacts by gamePk, for both the market-anchored baseline and the pitcher-strength v1 experiment.
function loadSims(dir) {
  const map = new Map();
  const abs = path.join(REPO, dir);
  for (const f of fs.existsSync(abs) ? fs.readdirSync(abs).filter((x) => /\d{4}-\d{2}-\d{2}\.json$/.test(x)) : []) {
    const j = JSON.parse(fs.readFileSync(path.join(abs, f), "utf8"));
    for (const g of j.games || []) map.set(g.gamePk, g);
  }
  return map;
}
const simByPk = loadSims("data/internal/mlb/full-game-sim");
const pitcherByPk = loadSims("data/internal/mlb/full-game-sim-pitcher-v1");
const bullpenByPk = loadSims("data/internal/mlb/full-game-sim-bullpen-v1");

// Build graded rows: actual outcome + market prediction + (optional) sim prediction.
const rows = odds.map((g) => {
  const margin = g.homeRuns - g.awayRuns; // home - away
  const total = g.homeRuns + g.awayRuns;
  const homeWon = margin > 0 ? 1 : 0; // MLB has no ties
  const c = g.closing;
  const homeCover = c.homeRunLine != null ? (margin + c.homeRunLine > 0 ? 1 : 0) : null; // home covers its spread
  const actualOver = c.totalLine != null ? (total > c.totalLine ? 1 : total < c.totalLine ? 0 : null) : null;
  const pred = (s) => s ? {
    homeWinProb: s.winProbability?.home ?? null,
    totalMean: s.projectedScore?.totalMean ?? null,
    marginMean: s.projectedScore?.marginMean ?? null,
    overProb: s.marketCoverage?.total?.overProbability ?? null,
    // run-line: sim gives favorite + coverProbability; translate to home-cover prob.
    homeCoverProb: s.marketCoverage?.runLine ? (s.marketCoverage.runLine.favorite === "home" ? s.marketCoverage.runLine.coverProbability : 1 - s.marketCoverage.runLine.coverProbability) : null,
  } : null;
  return {
    date: g.date, gamePk: g.gamePk, margin, total, homeWon, homeCover, actualOver,
    market: { homeWinProb: c.homeWinProb, totalLine: c.totalLine, overProb: c.overProb, homeCoverProb: c.homeCoverProb },
    sim: pred(simByPk.get(g.gamePk)),
    pitcher: pred(pitcherByPk.get(g.gamePk)),
    bullpen: pred(bullpenByPk.get(g.gamePk)),
  };
});

// Metric bundle for a probability source over a set of rows.
function bundle(rws, pick) {
  const ml = rws.filter((r) => pick(r).homeWinProb != null);
  const brier = mean(ml.map((r) => (pick(r).homeWinProb - r.homeWon) ** 2));
  const logLoss = mean(ml.map((r) => -(r.homeWon * Math.log(clamp(pick(r).homeWinProb, 1e-9, 1)) + (1 - r.homeWon) * Math.log(clamp(1 - pick(r).homeWinProb, 1e-9, 1)))));
  const winnerAcc = mean(ml.map((r) => ((pick(r).homeWinProb > 0.5 ? 1 : 0) === r.homeWon ? 1 : 0)));
  // total-runs MAE: market uses the LINE as its point projection; sim uses totalMean.
  const totRows = rws.filter((r) => (pick(r).totalMean ?? pick(r).totalLine) != null);
  const totalMAE = mean(totRows.map((r) => Math.abs((pick(r).totalMean ?? pick(r).totalLine) - r.total)));
  // over/under accuracy
  const ouRows = rws.filter((r) => pick(r).overProb != null && r.actualOver != null);
  const ouAcc = mean(ouRows.map((r) => ((pick(r).overProb > 0.5 ? 1 : 0) === r.actualOver ? 1 : 0)));
  const ouBrier = mean(ouRows.map((r) => (pick(r).overProb - r.actualOver) ** 2));
  // run-line cover accuracy
  const rlRows = rws.filter((r) => pick(r).homeCoverProb != null && r.homeCover != null);
  const rlAcc = mean(rlRows.map((r) => ((pick(r).homeCoverProb > 0.5 ? 1 : 0) === r.homeCover ? 1 : 0)));
  const rlBrier = mean(rlRows.map((r) => (pick(r).homeCoverProb - r.homeCover) ** 2));
  return {
    n: ml.length,
    moneyline: { brier: r4(brier), logLoss: r4(logLoss), winnerAccuracy: r4(winnerAcc) },
    totalRunsMAE: r4(totalMAE),
    overUnder: { n: ouRows.length, accuracy: r4(ouAcc), brier: r4(ouBrier) },
    runLine: { n: rlRows.length, coverAccuracy: r4(rlAcc), brier: r4(rlBrier) },
  };
}

// Calibration buckets (market moneyline, full sample).
const buckets = [];
for (let b = 0; b < 10; b++) {
  const lo = b / 10, hi = (b + 1) / 10;
  const inb = rows.filter((r) => r.market.homeWinProb != null && r.market.homeWinProb >= lo && (b === 9 ? r.market.homeWinProb <= hi : r.market.homeWinProb < hi));
  buckets.push({ range: `${lo.toFixed(1)}-${hi.toFixed(1)}`, n: inb.length, meanPredicted: inb.length ? r4(mean(inb.map((r) => r.market.homeWinProb))) : null, empirical: inb.length ? r4(mean(inb.map((r) => r.homeWon))) : null });
}

const marketFull = bundle(rows, (r) => r.market);
const paired = rows.filter((r) => r.sim && r.sim.homeWinProb != null);
const simPaired = bundle(paired, (r) => r.sim);
const marketPaired = bundle(paired, (r) => r.market);
const simMarginMAE = paired.length ? r4(mean(paired.map((r) => Math.abs((r.sim.marginMean ?? 0) - r.margin)))) : null;

// Feature #1 — pitcher-strength v1, paired against the market on the games it covers.
const pPaired = rows.filter((r) => r.pitcher && r.pitcher.homeWinProb != null);
const pitcherPaired = bundle(pPaired, (r) => r.pitcher);
const marketVsPitcher = bundle(pPaired, (r) => r.market);
const simVsPitcher = bundle(pPaired.filter((r) => r.sim), (r) => r.sim);
const pitcherMarginMAE = pPaired.length ? r4(mean(pPaired.map((r) => Math.abs((r.pitcher.marginMean ?? 0) - r.margin)))) : null;
const pdBrier = r4(pitcherPaired.moneyline.brier - marketVsPitcher.moneyline.brier);
const pdLogLoss = r4(pitcherPaired.moneyline.logLoss - marketVsPitcher.moneyline.logLoss);
// PASS bar: pitcher-v1 must beat the CLOSING MARKET on BOTH Brier AND log loss.
const pitcherBeatsMarket = pdBrier < 0 && pdLogLoss < 0;
const pitcherVerdict = pitcherBeatsMarket ? "beats" : (Math.abs(pdBrier) < 0.005 && Math.abs(pdLogLoss) < 0.005) ? "mirrors" : "loses_to";

// Feature #2 — bullpen-fatigue v1, paired against the market on the games it covers.
const bPaired = rows.filter((r) => r.bullpen && r.bullpen.homeWinProb != null);
const bullpenPaired = bundle(bPaired, (r) => r.bullpen);
const marketVsBullpen = bundle(bPaired, (r) => r.market);
const bullpenMarginMAE = bPaired.length ? r4(mean(bPaired.map((r) => Math.abs((r.bullpen.marginMean ?? 0) - r.margin)))) : null;
const bdBrier = r4(bullpenPaired.moneyline.brier - marketVsBullpen.moneyline.brier);
const bdLogLoss = r4(bullpenPaired.moneyline.logLoss - marketVsBullpen.moneyline.logLoss);
const bullpenBeatsMarket = bdBrier < 0 && bdLogLoss < 0;
const bullpenVerdict = bullpenBeatsMarket ? "beats" : (Math.abs(bdBrier) < 0.005 && Math.abs(bdLogLoss) < 0.005) ? "mirrors" : "loses_to";

// Verdict on the paired sample: does the sim BEAT, MATCH, or merely MIRROR the market?
const dBrier = simPaired.moneyline.brier - marketPaired.moneyline.brier; // <0 sim better
const mirror = Math.abs(dBrier) < 0.005; // within noise → mirrors the market it is anchored to
const verdict = mirror ? "mirrors" : dBrier < 0 ? "beats" : "loses_to";

const artifact = {
  version: "mlb-full-game-vs-market-v1", asOf: "2026-07-14",
  public: false, internal: true, webServed: false, officialMoneyRecordAffected: false, activeProductCard: false,
  engine: "market_anchored_simulation",
  dataset: `Market baseline over ${rows.length} settled games (${new Set(rows.map((r) => r.date)).size} dates), The Odds API historical closing odds; SIM paired on ${paired.length} games with a sim artifact (join by gamePk).`,
  leakageNote: "Closing odds snapshotted strictly before first pitch; final scores from StatsAPI linescores; the sim is market-anchored (winProb ≈ market by construction).",
  marketBaseline: marketFull,
  simVsMarketPaired: { n: paired.length, sim: simPaired, market: marketPaired, simMarginMAE, deltaMoneylineBrier: r4(dBrier) },
  pitcherStrengthV1: {
    n: pPaired.length, dates: new Set(pPaired.map((r) => r.date)).size,
    pitcher: pitcherPaired, market: marketVsPitcher, marketAnchoredSim: simVsPitcher, pitcherMarginMAE,
    deltaVsMarket: { brier: pdBrier, logLoss: pdLogLoss },
    beatsMarketOnBrierAndLogLoss: pitcherBeatsMarket,
    verdict: pitcherVerdict,
    passBar: "Adopt ONLY if it beats the closing market on BOTH Brier AND log loss.",
    adopted: false,
    note: pitcherBeatsMarket
      ? `Pitcher-strength v1 BEATS the market on Brier (${pdBrier}) AND log loss (${pdLogLoss}) over ${pPaired.length} games — a PROMISING internal signal, NOT public-ready (needs a wider out-of-sample window + founder approval).`
      : `Pitcher-strength v1 does NOT beat the market on both metrics (ΔBrier ${pdBrier}, ΔlogLoss ${pdLogLoss}) → NOT adopted. Stop this feature; move to bullpen fatigue / park+weather. Internal-only.`,
  },
  bullpenFatigueV1: {
    n: bPaired.length, dates: new Set(bPaired.map((r) => r.date)).size,
    bullpen: bullpenPaired, market: marketVsBullpen, bullpenMarginMAE,
    deltaVsMarket: { brier: bdBrier, logLoss: bdLogLoss },
    beatsMarketOnBrierAndLogLoss: bullpenBeatsMarket,
    verdict: bullpenVerdict,
    passBar: "Adopt ONLY if it beats the closing market on BOTH Brier AND log loss.",
    adopted: false, publicReady: false,
    note: bullpenBeatsMarket
      ? `Bullpen-fatigue v1 BEATS the market on Brier (${bdBrier}) AND log loss (${bdLogLoss}) over ${bPaired.length} games — a PROMISING internal signal, NOT public-ready (needs a wider out-of-sample window + founder approval).`
      : `Bullpen-fatigue v1 does NOT beat the market on both metrics (ΔBrier ${bdBrier}, ΔlogLoss ${bdLogLoss}) → NOT adopted. With pitcher v1 also failing, PAUSE MLB full-game feature chasing. Internal-only.`,
  },
  calibrationBuckets: buckets,
  verdict: {
    result: verdict,
    publicReady: false,
    sampleNote: paired.length >= 60 ? `Real sample: ${paired.length} games across ${new Set(paired.map((r) => r.date)).size} dates.` : `Small sample: ${paired.length} games on ${new Set(paired.map((r) => r.date)).size} date(s).`,
    note: `The sim ${verdict === "mirrors" ? "MIRRORS" : verdict} the market on ${paired.length} paired games (ΔBrier ${r4(dBrier)}). Market-anchored → it re-derives the book's probabilities and CANNOT beat them; the near-zero ΔBrier confirms this at scale. NOT public-ready; no public win-prob / projected runs / distributions. Beating the market needs independent features (see MLB_INDEPENDENT_MODEL_FEATURE_PLAN.md), not re-anchoring.`,
  },
};

fs.mkdirSync(path.join(REPO, "data/internal/mlb/full-game-sim-backtests"), { recursive: true });
fs.writeFileSync(path.join(REPO, "data/internal/mlb/full-game-sim-backtests/2026-market-vs-sim.json"), JSON.stringify(artifact, null, 2));

console.log(`✓ MLB full-game vs market — market baseline N=${rows.length}, sim paired N=${paired.length}`);
console.log(`  MARKET (all ${marketFull.n}): ML Brier ${marketFull.moneyline.brier} · logLoss ${marketFull.moneyline.logLoss} · winner ${(marketFull.moneyline.winnerAccuracy * 100).toFixed(1)}% · totalMAE ${marketFull.totalRunsMAE} · O/U ${(marketFull.overUnder.accuracy * 100).toFixed(0)}% · RL ${(marketFull.runLine.coverAccuracy * 100).toFixed(0)}%`);
console.log(`  --- paired (${paired.length} games, ${new Set(paired.map((r) => r.date)).size} date) ---`);
console.log(`  SIM   : ML Brier ${simPaired.moneyline.brier} · logLoss ${simPaired.moneyline.logLoss} · winner ${(simPaired.moneyline.winnerAccuracy * 100).toFixed(1)}% · totalMAE ${simPaired.totalRunsMAE} · marginMAE ${simMarginMAE} · O/U ${(simPaired.overUnder.accuracy * 100).toFixed(0)}% · RL ${(simPaired.runLine.coverAccuracy * 100).toFixed(0)}%`);
console.log(`  MARKET: ML Brier ${marketPaired.moneyline.brier} · logLoss ${marketPaired.moneyline.logLoss} · winner ${(marketPaired.moneyline.winnerAccuracy * 100).toFixed(1)}% · totalMAE ${marketPaired.totalRunsMAE}`);
console.log(`  VERDICT: sim ${verdict} the market (ΔBrier ${r4(dBrier)}) · publicReady=false`);
console.log(`  === PITCHER-STRENGTH v1 (${pPaired.length} games, ${new Set(pPaired.map((r) => r.date)).size} dates) ===`);
console.log(`  PITCHER: ML Brier ${pitcherPaired.moneyline.brier} · logLoss ${pitcherPaired.moneyline.logLoss} · winner ${(pitcherPaired.moneyline.winnerAccuracy * 100).toFixed(1)}% · totalMAE ${pitcherPaired.totalRunsMAE} · marginMAE ${pitcherMarginMAE} · O/U ${(pitcherPaired.overUnder.accuracy * 100).toFixed(0)}% · RL ${(pitcherPaired.runLine.coverAccuracy * 100).toFixed(0)}%`);
console.log(`  MARKET : ML Brier ${marketVsPitcher.moneyline.brier} · logLoss ${marketVsPitcher.moneyline.logLoss} · winner ${(marketVsPitcher.moneyline.winnerAccuracy * 100).toFixed(1)}%`);
console.log(`  Δ pitcher−market: Brier ${pdBrier} · logLoss ${pdLogLoss}  → beats market on BOTH: ${pitcherBeatsMarket} · verdict ${pitcherVerdict} · adopted=false`);
console.log(`  === BULLPEN-FATIGUE v1 (${bPaired.length} games, ${new Set(bPaired.map((r) => r.date)).size} dates) ===`);
console.log(`  BULLPEN: ML Brier ${bullpenPaired.moneyline.brier} · logLoss ${bullpenPaired.moneyline.logLoss} · winner ${(bullpenPaired.moneyline.winnerAccuracy * 100).toFixed(1)}% · totalMAE ${bullpenPaired.totalRunsMAE} · marginMAE ${bullpenMarginMAE} · O/U ${(bullpenPaired.overUnder.accuracy * 100).toFixed(0)}% · RL ${(bullpenPaired.runLine.coverAccuracy * 100).toFixed(0)}%`);
console.log(`  MARKET : ML Brier ${marketVsBullpen.moneyline.brier} · logLoss ${marketVsBullpen.moneyline.logLoss} · winner ${(marketVsBullpen.moneyline.winnerAccuracy * 100).toFixed(1)}%`);
console.log(`  Δ bullpen−market: Brier ${bdBrier} · logLoss ${bdLogLoss}  → beats market on BOTH: ${bullpenBeatsMarket} · verdict ${bullpenVerdict} · adopted=false`);
