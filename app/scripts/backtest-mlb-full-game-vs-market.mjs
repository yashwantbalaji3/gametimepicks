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

// Load every available sim artifact, index by gamePk.
const simByPk = new Map();
const simDir = path.join(REPO, "data/internal/mlb/full-game-sim");
for (const f of fs.existsSync(simDir) ? fs.readdirSync(simDir).filter((x) => /\d{4}-\d{2}-\d{2}\.json$/.test(x)) : []) {
  const j = JSON.parse(fs.readFileSync(path.join(simDir, f), "utf8"));
  for (const g of j.games || []) simByPk.set(g.gamePk, g);
}

// Build graded rows: actual outcome + market prediction + (optional) sim prediction.
const rows = odds.map((g) => {
  const margin = g.homeRuns - g.awayRuns; // home - away
  const total = g.homeRuns + g.awayRuns;
  const homeWon = margin > 0 ? 1 : 0; // MLB has no ties
  const c = g.closing;
  const homeCover = c.homeRunLine != null ? (margin + c.homeRunLine > 0 ? 1 : 0) : null; // home covers its spread
  const actualOver = c.totalLine != null ? (total > c.totalLine ? 1 : total < c.totalLine ? 0 : null) : null;
  const sim = simByPk.get(g.gamePk);
  return {
    date: g.date, gamePk: g.gamePk, margin, total, homeWon, homeCover, actualOver,
    market: { homeWinProb: c.homeWinProb, totalLine: c.totalLine, overProb: c.overProb, homeCoverProb: c.homeCoverProb },
    sim: sim ? {
      homeWinProb: sim.winProbability?.home ?? null,
      totalMean: sim.projectedScore?.totalMean ?? null,
      marginMean: sim.projectedScore?.marginMean ?? null,
      overProb: sim.marketCoverage?.total?.overProbability ?? null,
      // run-line: sim gives favorite + coverProbability; translate to home-cover prob.
      homeCoverProb: sim.marketCoverage?.runLine ? (sim.marketCoverage.runLine.favorite === "home" ? sim.marketCoverage.runLine.coverProbability : 1 - sim.marketCoverage.runLine.coverProbability) : null,
    } : null,
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
  calibrationBuckets: buckets,
  verdict: {
    result: verdict,
    publicReady: false,
    note: `The sim ${verdict === "mirrors" ? "MIRRORS" : verdict} the market on the paired sample (ΔBrier ${r4(dBrier)}). It is market-anchored, so mirroring is expected. Sample is ${paired.length} games on ${new Set(paired.map((r) => r.date)).size} date(s) — far too small to validate. NOT public-ready; no public win-prob / projected runs / distributions.`,
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
