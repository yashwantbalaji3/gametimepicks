/**
 * backtest-mlb-full-game-sim.mjs — evaluate the market-anchored full-game simulation against official
 * final scores. READ-ONLY; internal only. It does NOT claim success — it prints the honest numbers and
 * a verdict from {not_ready, internal_only, promising_but_needs_forward_test}. Never
 * candidate_for_public_rollout.
 *
 * Data reality: only dates with BOTH committed team-market lines AND official finals can be graded.
 * Committed lines exist for 2026-07-09 only, so the backtest is tiny (its final games) — flagged
 * explicitly as insufficient. Fetches finals from the free StatsAPI (no Odds credits).
 *
 * Output: data/internal/mlb/full-game-sim-backtests/<date>.json   Usage:
 *   npx tsx scripts/backtest-mlb-full-game-sim.mjs [--date 2026-07-09] [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { getMlbGameCenter } from "../src/lib/mlb-team-markets.ts";
import { parseSchedulePayload } from "../src/lib/mlb/product-settlement/statsapi-linescore.ts";
import { buildExpectedRuns, simulateMlbGame, DEFAULT_SIM_OPTIONS } from "../src/lib/full-game-sim/mlb/index.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "full-game-sim-backtests");
const WRITE = process.argv.includes("--write");
const DATE = (() => { const i = process.argv.indexOf("--date"); return i >= 0 ? process.argv[i + 1] : "2026-07-09"; })();

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r4 = (x) => Number(x.toFixed(4));

async function main() {
  const board = JSON.parse(fs.readFileSync(path.join(BOARDS, `${DATE}.json`), "utf8"));
  const pkToId = new Map();
  for (const l of board.leans || []) if (l.gamePk != null && !pkToId.has(l.gamePk)) pkToId.set(l.gamePk, l.gameId);

  let finals;
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${DATE}`, { headers: { accept: "application/json" } });
    finals = parseSchedulePayload(await res.json());
  } catch (e) { console.error(`[fgs-backtest] fetch failed: ${String(e).slice(0, 80)}`); process.exit(1); }

  const rows = [];
  const skipped = [];
  for (const g of finals) {
    if (!g.isFinal) { skipped.push({ gamePk: g.gamePk, reason: "not final" }); continue; }
    const gameId = pkToId.get(g.gamePk);
    const gc = gameId ? getMlbGameCenter(DATE, gameId) : null;
    if (!gc?.total) { skipped.push({ gamePk: g.gamePk, reason: "no committed market line" }); continue; }
    const market = { total: gc.total.line, homeWinProb: gc.moneyline?.homeWinProb, awayWinProb: gc.moneyline?.awayWinProb, runLine: gc.runLine ? { line: gc.runLine.line, favorite: gc.runLine.favorite } : undefined };
    const sim = simulateMlbGame(buildExpectedRuns(market, DEFAULT_SIM_OPTIONS.vmr), market, DEFAULT_SIM_OPTIONS);
    const actualHomeWin = g.homeRuns > g.awayRuns ? 1 : 0;
    const actualTotal = g.homeRuns + g.awayRuns;
    rows.push({
      gamePk: g.gamePk, score: `${g.awayRuns}-${g.homeRuns}`,
      simHomeWin: sim.winProbability.home, marketHomeWin: market.homeWinProb ?? null, actualHomeWin,
      simTotal: sim.projectedScore.totalMean, marketLine: market.total, actualTotal,
      simOverProb: sim.coverage.total?.overProbability ?? null, actualOver: actualTotal > market.total ? 1 : actualTotal < market.total ? 0 : null,
      simRlCover: sim.coverage.runLine?.coverProbability ?? null,
      actualRlCover: gc.runLine ? ((gc.runLine.favorite === "home" ? (g.homeRuns - g.awayRuns) : (g.awayRuns - g.homeRuns)) + gc.runLine.line > 0 ? 1 : 0) : null,
    });
  }

  const withMl = rows.filter((r) => r.marketHomeWin != null);
  const ouRows = rows.filter((r) => r.actualOver != null && r.simOverProb != null);
  const rlRows = rows.filter((r) => r.actualRlCover != null && r.simRlCover != null);
  const metrics = {
    gamesGraded: rows.length,
    brierSim_moneyline: withMl.length ? r4(mean(withMl.map((r) => (r.simHomeWin - r.actualHomeWin) ** 2))) : null,
    brierMarket_moneyline: withMl.length ? r4(mean(withMl.map((r) => (r.marketHomeWin - r.actualHomeWin) ** 2))) : null,
    mlAccuracySim: withMl.length ? r4(mean(withMl.map((r) => ((r.simHomeWin > 0.5 ? 1 : 0) === r.actualHomeWin ? 1 : 0)))) : null,
    mlAccuracyMarket: withMl.length ? r4(mean(withMl.map((r) => ((r.marketHomeWin > 0.5 ? 1 : 0) === r.actualHomeWin ? 1 : 0)))) : null,
    totalOverBrierSim: ouRows.length ? r4(mean(ouRows.map((r) => (r.simOverProb - r.actualOver) ** 2))) : null,
    totalOverAccuracySim: ouRows.length ? r4(mean(ouRows.map((r) => ((r.simOverProb > 0.5 ? 1 : 0) === r.actualOver ? 1 : 0)))) : null,
    runLineCoverAccuracySim: rlRows.length ? r4(mean(rlRows.map((r) => ((r.simRlCover > 0.5 ? 1 : 0) === r.actualRlCover ? 1 : 0)))) : null,
    projTotalMAE_sim: rows.length ? r4(mean(rows.map((r) => Math.abs(r.simTotal - r.actualTotal)))) : null,
    projTotalMAE_marketLine: rows.length ? r4(mean(rows.map((r) => Math.abs(r.marketLine - r.actualTotal)))) : null,
  };

  // Honest verdict: tiny sample + market-anchored ⇒ internal_only unless it clearly beats the market.
  const beatsMarket = metrics.brierSim_moneyline != null && metrics.brierMarket_moneyline != null && metrics.brierSim_moneyline < metrics.brierMarket_moneyline - 0.01;
  const verdict = rows.length < 30 ? "internal_only" : beatsMarket ? "promising_but_needs_forward_test" : "internal_only";

  const out = {
    sport: "MLB", date: DATE, asOf: DATE, public: false, internal: true, kind: "full-game-sim-backtest",
    officialMoneyRecordAffected: false,
    modelVersion: DEFAULT_SIM_OPTIONS.modelVersion, runCount: DEFAULT_SIM_OPTIONS.runCount, seed: DEFAULT_SIM_OPTIONS.seed,
    sampleWarning: rows.length < 30 ? `INSUFFICIENT SAMPLE (${rows.length} games) — only 2026-07-09 has committed team-market lines, and only its final games are gradeable. Not enough to conclude the model adds value.` : null,
    metrics, verdict, skippedCount: skipped.length, skipped: skipped.slice(0, 20), rows,
    note: "The simulation is MARKET-ANCHORED, so its moneyline/total Brier will track the market baseline by construction. This backtest cannot show the model beats the market; it only confirms the mechanics on real finals. Forward-testing over many dates (once lines are committed daily) is required. NOT for public rollout.",
  };

  if (WRITE) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${DATE}.json`), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[fgs-backtest] ${WRITE ? "WROTE" : "DRY-RUN"} ${DATE} · graded ${rows.length} · skipped ${skipped.length} · verdict ${verdict}`);
  console.log("  metrics:", JSON.stringify(metrics));
  if (out.sampleWarning) console.log("  ⚠", out.sampleWarning);
}

main();
