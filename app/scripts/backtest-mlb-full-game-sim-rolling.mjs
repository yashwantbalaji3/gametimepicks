/**
 * backtest-mlb-full-game-sim-rolling.mjs — a leakage-safe ROLLING forward backtest of the market-anchored
 * full-game simulation vs the market baseline, across every date that has BOTH committed team-market
 * lines AND official final scores. READ-ONLY; internal-only; conservative verdict.
 *
 * Leakage safety: the engine is market-anchored and has NO learned parameters, so grading a date can't
 * leak from it. The harness still processes dates in ascending order and any future learned parameter
 * MUST be fit only from strictly-earlier dates (documented invariant) — today there is nothing to fit.
 *
 * Data reality: committed team-market lines exist for 2026-07-09 only, so the rolling window is one date
 * (its final games) — reported honestly as `insufficient_sample`.
 *
 * Output: data/internal/mlb/rolling-backtests/full-game-sim-<latestDate>.json
 * Usage: npx tsx scripts/backtest-mlb-full-game-sim-rolling.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { getMlbGameCenter } from "../src/lib/mlb-team-markets.ts";
import { parseSchedulePayload } from "../src/lib/mlb/product-settlement/statsapi-linescore.ts";
import { buildExpectedRuns, simulateMlbGame, DEFAULT_SIM_OPTIONS } from "../src/lib/full-game-sim/mlb/index.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const LINES_DIR = path.join(REPO, "data", "internal", "mlb", "team-market-lines");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "rolling-backtests");
const WRITE = process.argv.includes("--write");

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r4 = (x) => (x == null ? null : Number(x.toFixed(4)));

/** Dates with a committed team-market-lines snapshot (the only dates we can anchor a sim on). */
function datesWithLines() {
  if (!fs.existsSync(LINES_DIR)) return [];
  return fs.readdirSync(LINES_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.replace(".json", "")).sort();
}
async function finalsFor(date) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`, { headers: { accept: "application/json" } });
    return parseSchedulePayload(await res.json());
  } catch { return []; }
}
function pkToId(date) {
  const p = path.join(BOARDS, `${date}.json`);
  const m = new Map();
  if (!fs.existsSync(p)) return m;
  for (const l of (JSON.parse(fs.readFileSync(p, "utf8")).leans || [])) if (l.gamePk != null && !m.has(l.gamePk)) m.set(l.gamePk, l.gameId);
  return m;
}

async function main() {
  const dates = datesWithLines();
  const rows = [];
  const perDate = [];
  for (const date of dates) {
    const ids = pkToId(date);
    const finals = await finalsFor(date);
    let graded = 0;
    for (const g of finals) {
      if (!g.isFinal) continue;
      const gc = ids.get(g.gamePk) ? getMlbGameCenter(date, ids.get(g.gamePk)) : null;
      if (!gc?.total) continue;
      const market = { total: gc.total.line, homeWinProb: gc.moneyline?.homeWinProb, awayWinProb: gc.moneyline?.awayWinProb, runLine: gc.runLine ? { line: gc.runLine.line, favorite: gc.runLine.favorite } : undefined };
      const sim = simulateMlbGame(buildExpectedRuns(market, DEFAULT_SIM_OPTIONS.vmr), market, DEFAULT_SIM_OPTIONS);
      const actualHomeWin = g.homeRuns > g.awayRuns ? 1 : 0;
      const actualTotal = g.homeRuns + g.awayRuns;
      rows.push({ date, gamePk: g.gamePk, simHomeWin: sim.winProbability.home, marketHomeWin: market.homeWinProb ?? null, actualHomeWin, simTotal: sim.projectedScore.totalMean, marketLine: market.total, actualTotal, simOverProb: sim.coverage.total?.overProbability ?? null, actualOver: actualTotal > market.total ? 1 : actualTotal < market.total ? 0 : null });
      graded += 1;
    }
    perDate.push({ date, graded });
  }

  const withMl = rows.filter((r) => r.marketHomeWin != null);
  // Calibration buckets on the sim's home-win prob (thirds — coarse because N is tiny).
  const buckets = [[0, 0.4], [0.4, 0.6], [0.6, 1.01]].map(([lo, hi]) => {
    const b = withMl.filter((r) => r.simHomeWin >= lo && r.simHomeWin < hi);
    return { range: `${lo}-${hi}`, n: b.length, predicted: r4(mean(b.map((r) => r.simHomeWin))), realized: r4(mean(b.map((r) => r.actualHomeWin))) };
  }).filter((b) => b.n > 0);

  const metrics = {
    dates: perDate.length, gamesGraded: rows.length,
    moneylineBrier_sim: r4(mean(withMl.map((r) => (r.simHomeWin - r.actualHomeWin) ** 2))),
    moneylineBrier_market: r4(mean(withMl.map((r) => (r.marketHomeWin - r.actualHomeWin) ** 2))),
    projTotalMAE_sim: r4(mean(rows.map((r) => Math.abs(r.simTotal - r.actualTotal)))),
    projTotalMAE_marketLine: r4(mean(rows.map((r) => Math.abs(r.marketLine - r.actualTotal)))),
    winProbCalibration: buckets,
  };

  // Conservative verdict — a tiny, single-date, market-anchored sample cannot justify more than internal.
  const beatsMarketBrier = metrics.moneylineBrier_sim != null && metrics.moneylineBrier_market != null && metrics.moneylineBrier_sim < metrics.moneylineBrier_market - 0.01;
  const verdict = rows.length < 50 ? "insufficient_sample" : beatsMarketBrier ? "experimental_improvement_unproven" : "market_tracking_only";

  const out = {
    sport: "MLB", asOf: dates[dates.length - 1] ?? null, public: false, internal: true, kind: "full-game-sim-rolling-backtest",
    officialMoneyRecordAffected: false, exposureCreated: 0, activationStatus: "internal_only",
    modelVersion: DEFAULT_SIM_OPTIONS.modelVersion, seed: DEFAULT_SIM_OPTIONS.seed,
    leakageNote: "Engine is market-anchored with NO learned parameters, so no future data can leak into a graded date. Any future learned parameter must be fit only from strictly-earlier dates.",
    sampleWarning: rows.length < 50 ? `INSUFFICIENT SAMPLE (${rows.length} games across ${perDate.length} date(s)). Committed team-market lines exist for one date only; a real rolling backtest needs lines committed daily.` : null,
    perDate, metrics, verdict,
    note: "The simulation is MARKET-ANCHORED — its moneyline/total metrics track the market baseline by construction and cannot beat it here. This confirms the mechanics; it does not prove predictive value. NOT for public rollout, NOT for product-card use.",
  };

  const outFile = `full-game-sim-${dates[dates.length - 1] ?? "none"}.json`;
  if (WRITE && dates.length) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, outFile), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[fgs-rolling] ${WRITE ? "WROTE" : "DRY-RUN"} ${outFile} · dates ${perDate.length} · graded ${rows.length} · verdict ${verdict}`);
  console.log("  metrics:", JSON.stringify({ brierSim: metrics.moneylineBrier_sim, brierMarket: metrics.moneylineBrier_market, totMAEsim: metrics.projTotalMAE_sim }));
  if (out.sampleWarning) console.log("  ⚠", out.sampleWarning);
}

main();
