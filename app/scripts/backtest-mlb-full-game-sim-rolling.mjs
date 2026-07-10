/**
 * backtest-mlb-full-game-sim-rolling.mjs — a leakage-safe ROLLING forward backtest across every date that
 * has BOTH committed team-market lines AND official final scores. It grades THREE things head-to-head:
 *
 *   1. the MARKET baseline (de-vigged moneyline / total / run line),
 *   2. the pure MARKET-ANCHORED simulation, and
 *   3. the SHADOW-ADJUSTED simulation (bounded park factor + strictly-earlier team run rates).
 *
 * READ-ONLY re: money; internal-only; conservative verdict. NOT for public rollout / product use.
 *
 * LEAKAGE SAFETY (proven, not asserted):
 *   • team run rates use ONLY committed linescore dates STRICTLY EARLIER than the graded date,
 *   • park factors are static structural constants (date-independent),
 *   • pitcher strength is neutral (0),
 *   • the final score enters ONLY the evaluation phase — never an input.
 * The engine has no learned parameters; any future fitted parameter MUST be fit from strictly-earlier
 * dates only (documented invariant).
 *
 * Data reality: committed team-market lines exist for one date (2026-07-09), so the sample is tiny →
 * `insufficient_sample`. The harness is forward-compatible: it grows automatically as the daily ingest
 * (ingest-mlb-team-market-lines-daily.mjs) accumulates dates.
 *
 * Output: data/internal/mlb/full-game-sim-backtests/rolling-latest.json
 * Usage:  npx tsx scripts/backtest-mlb-full-game-sim-rolling.mjs [--write]
 */
import fs from "node:fs";
import path from "node:path";
import { getMlbGameCenter } from "../src/lib/mlb-team-markets.ts";
import { parseSchedulePayload } from "../src/lib/mlb/product-settlement/statsapi-linescore.ts";
import { buildExpectedRuns, applyIndependentAdjustments, simulateMlbGame, DEFAULT_SIM_OPTIONS } from "../src/lib/full-game-sim/mlb/index.ts";

const APP = path.join(process.cwd(), process.cwd().endsWith("app") ? "" : "app");
const REPO = path.join(APP, "..");
const BOARDS = path.join(APP, "public", "data", "mlb", "boards");
const LINES_DIR = path.join(REPO, "data", "internal", "mlb", "team-market-lines");
const LINESCORES = path.join(REPO, "data", "internal", "mlb", "linescores");
const PARK_TABLE = path.join(REPO, "data", "internal", "mlb", "model-inputs", "park-factors", "static.json");
const OUT_DIR = path.join(REPO, "data", "internal", "mlb", "full-game-sim-backtests");
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
/** gamePk → { gameId, homeAbbr } from the board leans. */
function boardByPk(date) {
  const p = path.join(BOARDS, `${date}.json`);
  const m = new Map();
  if (!fs.existsSync(p)) return m;
  for (const l of (JSON.parse(fs.readFileSync(p, "utf8")).leans || [])) if (l.gamePk != null && !m.has(l.gamePk)) m.set(l.gamePk, { gameId: l.gameId, homeAbbr: l.homeTeamAbbr ?? "", awayAbbr: l.awayTeamAbbr ?? "" });
  return m;
}
/** LEAKAGE-SAFE run rates: committed final linescores STRICTLY EARLIER than `date`. */
function runRatesBefore(date) {
  const runs = new Map();
  if (!fs.existsSync(LINESCORES)) return runs;
  for (const f of fs.readdirSync(LINESCORES).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
    if (f.replace(".json", "") >= date) continue;
    for (const g of (JSON.parse(fs.readFileSync(path.join(LINESCORES, f), "utf8")).games || [])) {
      if (!g.isFinal) continue;
      if (typeof g.homeRuns === "number") { const a = runs.get(g.homeTeam) ?? []; a.push(g.homeRuns); runs.set(g.homeTeam, a); }
      if (typeof g.awayRuns === "number") { const a = runs.get(g.awayTeam) ?? []; a.push(g.awayRuns); runs.set(g.awayTeam, a); }
    }
  }
  const rates = new Map();
  for (const [t, xs] of runs) rates.set(t, { runsPerGame: Number((xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2)), games: xs.length });
  return rates;
}
function loadPark() {
  if (!fs.existsSync(PARK_TABLE)) return { byAbbr: new Map(), byName: new Map() };
  const t = JSON.parse(fs.readFileSync(PARK_TABLE, "utf8"));
  const byAbbr = new Map(); const byName = new Map();
  for (const e of t.factors || []) { byAbbr.set(e.team, e); byName.set(e.name, e); }
  return { byAbbr, byName };
}

function brierAcc(rows, key) {
  const withP = rows.filter((r) => r[key] != null);
  return {
    brier: r4(mean(withP.map((r) => (r[key] - r.actualHomeWin) ** 2))),
    accuracy: r4(mean(withP.map((r) => ((r[key] >= 0.5 ? 1 : 0) === r.actualHomeWin ? 1 : 0)))),
    n: withP.length,
  };
}

async function main() {
  const dates = datesWithLines();
  const park = loadPark();
  const rows = [];
  const perDate = [];
  const skipped = [];

  for (const date of dates) {
    const board = boardByPk(date);
    const rates = runRatesBefore(date); // strictly-earlier — leakage-safe
    const finals = await finalsFor(date);
    let graded = 0;
    for (const g of finals) {
      const info = board.get(g.gamePk);
      if (!g.isFinal) { continue; }
      const gc = info?.gameId ? getMlbGameCenter(date, info.gameId) : null;
      if (!gc?.total) { skipped.push({ date, gamePk: g.gamePk, reason: gc ? "no market total" : "no committed line" }); continue; }

      const market = {
        total: gc.total.line,
        homeWinProb: gc.moneyline?.homeWinProb,
        awayWinProb: gc.moneyline?.awayWinProb,
        runLine: gc.runLine ? { line: gc.runLine.line, favorite: gc.runLine.favorite } : undefined,
      };
      // Independent inputs (leakage-safe): static park factor + strictly-earlier run rates. Names from finals.
      const parkEntry = park.byAbbr.get(info?.homeAbbr) ?? park.byName.get(g.homeTeam) ?? null;
      const awayRate = rates.get(g.awayTeam);
      const homeRate = rates.get(g.homeTeam);
      const indep = {
        parkRunFactor: parkEntry?.runFactor, parkConfidence: parkEntry?.confidence,
        awayRunRate: awayRate?.runsPerGame, homeRunRate: homeRate?.runsPerGame,
        runRateSampleGames: { away: awayRate?.games ?? 0, home: homeRate?.games ?? 0 },
      };

      const baseExpected = buildExpectedRuns(market, DEFAULT_SIM_OPTIONS.vmr);
      const simPure = simulateMlbGame(baseExpected, market, DEFAULT_SIM_OPTIONS);
      const { expected: adjExpected, mode } = applyIndependentAdjustments(baseExpected, indep, market);
      const simAdj = simulateMlbGame(adjExpected, market, DEFAULT_SIM_OPTIONS);

      const actualHomeWin = g.homeRuns > g.awayRuns ? 1 : 0;
      const actualTotal = g.homeRuns + g.awayRuns;
      const actualOver = actualTotal > market.total ? 1 : actualTotal < market.total ? 0 : null;
      rows.push({
        date, gamePk: g.gamePk, mode,
        marketHomeWin: market.homeWinProb ?? null, simHomeWin: simPure.winProbability.home, adjHomeWin: simAdj.winProbability.home,
        actualHomeWin, actualTotal, marketLine: market.total,
        simTotal: simPure.projectedScore.totalMean, adjTotal: simAdj.projectedScore.totalMean,
        simOverProb: simPure.coverage.total?.overProbability ?? null, adjOverProb: simAdj.coverage.total?.overProbability ?? null, actualOver,
        simRlCover: simPure.coverage.runLine?.coverProbability ?? null,
        actualFavCover: gc.runLine ? ((gc.runLine.favorite === "home" ? (g.homeRuns - g.awayRuns) : (g.awayRuns - g.homeRuns)) + gc.runLine.line > 0 ? 1 : 0) : null,
      });
      graded += 1;
    }
    perDate.push({ date, graded });
  }

  // ── Moneyline: market vs pure sim vs adjusted sim ──
  const market = brierAcc(rows, "marketHomeWin");
  const sim = brierAcc(rows, "simHomeWin");
  const adj = brierAcc(rows, "adjHomeWin");

  // ── Calibration buckets on the pure sim's home-win prob (coarse thirds; N tiny) ──
  const withMl = rows.filter((r) => r.marketHomeWin != null);
  const buckets = [[0, 0.4], [0.4, 0.6], [0.6, 1.01]].map(([lo, hi]) => {
    const b = withMl.filter((r) => r.simHomeWin >= lo && r.simHomeWin < hi);
    return { range: `${lo}-${hi}`, n: b.length, predicted: r4(mean(b.map((r) => r.simHomeWin))), realized: r4(mean(b.map((r) => r.actualHomeWin))) };
  }).filter((b) => b.n > 0);

  // ── Totals + run line ──
  const ouRows = rows.filter((r) => r.actualOver != null);
  const rlRows = rows.filter((r) => r.actualFavCover != null && r.simRlCover != null);
  const metrics = {
    dates: perDate.length, gamesGraded: rows.length, skipped: skipped.length,
    moneyline: {
      market: { brier: market.brier, accuracy: market.accuracy },
      sim: { brier: sim.brier, accuracy: sim.accuracy },
      shadowAdjusted: { brier: adj.brier, accuracy: adj.accuracy },
    },
    projectedTotalMAE: {
      marketLine: r4(mean(rows.map((r) => Math.abs(r.marketLine - r.actualTotal)))),
      sim: r4(mean(rows.map((r) => Math.abs(r.simTotal - r.actualTotal)))),
      shadowAdjusted: r4(mean(rows.map((r) => Math.abs(r.adjTotal - r.actualTotal)))),
    },
    overUnder: {
      n: ouRows.length,
      simBrier: r4(mean(ouRows.map((r) => (r.simOverProb - r.actualOver) ** 2))),
      shadowAdjustedBrier: r4(mean(ouRows.map((r) => (r.adjOverProb - r.actualOver) ** 2))),
      simAccuracy: r4(mean(ouRows.map((r) => ((r.simOverProb >= 0.5 ? 1 : 0) === r.actualOver ? 1 : 0)))),
    },
    runLine: { n: rlRows.length, simCoverAccuracy: r4(mean(rlRows.map((r) => ((r.simRlCover >= 0.5 ? 1 : 0) === r.actualFavCover ? 1 : 0)))) },
    winProbCalibration: buckets,
  };

  // ── Conservative verdict (mission rules) ──
  const tiny = rows.length < 50 || perDate.length < 5;
  const beatsMarketBrier = sim.brier != null && market.brier != null && sim.brier < market.brier - 0.01;
  const adjBeatsMarket = adj.brier != null && market.brier != null && adj.brier < market.brier - 0.01;
  let verdict;
  if (tiny) verdict = "insufficient_sample";
  else if (adjBeatsMarket || beatsMarketBrier) verdict = "candidate_for_shadow_review";
  else if (sim.brier != null && market.brier != null && sim.brier <= market.brier + 0.01) verdict = "tracks_market";
  else verdict = "underperforms_market";

  const out = {
    sport: "MLB", asOf: dates[dates.length - 1] ?? null, public: false, internal: true, kind: "full-game-sim-rolling-backtest",
    officialMoneyRecordAffected: false, exposureCreated: 0, activationStatus: "internal_only",
    modelVersion: DEFAULT_SIM_OPTIONS.modelVersion, seed: DEFAULT_SIM_OPTIONS.seed, vmr: DEFAULT_SIM_OPTIONS.vmr,
    engineModes: [...new Set(rows.map((r) => r.mode))],
    leakageNote: "No learned parameters. Team run rates use ONLY committed linescore dates STRICTLY EARLIER than the graded date; park factors are static; pitcher strength is neutral; the final score enters only the evaluation phase. Any future learned parameter must be fit from strictly-earlier dates only.",
    inputsUsed: { parkFactors: "static (approximate, bounded ±3%)", teamRunRates: "committed finals strictly-earlier (bounded ±0.3 run margin)", pitcherStrength: "neutral (0)" },
    sampleWarning: tiny ? `INSUFFICIENT SAMPLE (${rows.length} games across ${perDate.length} date(s); need ≥50 games / ≥5 dates). Committed team-market lines exist for one date only; run ingest-mlb-team-market-lines-daily.mjs each slate to grow it.` : null,
    stability: "SNAPSHOT — the graded date(s) may be partially live (finals accrue through the evening), so the game count can move between runs. The VERDICT is decision-invariant. Internal-only; regenerate by re-running the harness.",
    perDate, metrics, skipped, verdict,
    note: "The simulation is MARKET-ANCHORED — its moneyline/total metrics track the market baseline by construction. The shadow-adjusted variant applies bounded park/run-rate nudges (evaluated here, never in a product). This confirms the mechanics; it does not prove predictive value. NOT public, NOT product, NOT money.",
  };

  if (WRITE && dates.length) { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, "rolling-latest.json"), JSON.stringify(out, null, 2) + "\n"); }
  console.log(`[fgs-rolling] ${WRITE ? "WROTE rolling-latest.json" : "DRY-RUN"} · dates ${perDate.length} · graded ${rows.length} · skipped ${skipped.length} · verdict ${verdict}`);
  console.log("  moneyline Brier:", JSON.stringify({ market: market.brier, sim: sim.brier, adjusted: adj.brier }));
  console.log("  projTotal MAE:  ", JSON.stringify({ marketLine: metrics.projectedTotalMAE.marketLine, sim: metrics.projectedTotalMAE.sim, adjusted: metrics.projectedTotalMAE.shadowAdjusted }));
  if (out.sampleWarning) console.log("  ⚠", out.sampleWarning);
}

main();
