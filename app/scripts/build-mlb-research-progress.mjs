/**
 * build-mlb-research-progress.mjs — the research-warehouse ACCUMULATION tracker (Phase 3 observability).
 *
 * Answers "how much clean research data have we collected, and how far from the modeling gate?" It is a read-only
 * aggregator over the internal pregame-archive warehouse; it NEVER builds a model, evaluates performance, or touches
 * money/public artifacts. Writes data/internal/mlb/pregame-archive/status/research-progress.json (public:false).
 *
 * The modeling gate stays BLOCKED until 30 dates / 500 settled observations + out-of-sample validation + founder
 * approval. This tracker only reports progress toward that gate honestly (0 observations is reported as 0).
 *
 *   node app/scripts/build-mlb-research-progress.mjs
 */
import fs from "node:fs";
import path from "node:path";

const APP = process.cwd().endsWith("/app") ? process.cwd() : path.join(process.cwd(), "app");
const REPO = path.dirname(APP);
const PA = path.join(REPO, "data/internal/mlb/pregame-archive");
const STATUS = path.join(PA, "status");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const lsdirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { return []; } };
const lsfiles = (p) => { try { return fs.readdirSync(p).filter((f) => !f.startsWith(".")); } catch { return []; } };

const DATES_TARGET = 30;
const OBS_TARGET = 500;
// The market families the ResearchObservation assembler emits (team + player-prop). Kept in sync with build-mlb-research-observations.mjs.
const MARKET_FAMILIES = ["h2h", "spreads", "totals", "pitcher_strikeouts", "pitcher_outs", "pitcher_earned_runs", "batter_hits", "batter_total_bases", "batter_home_runs", "batter_rbis", "batter_runs_scored", "batter_hits_runs_rbis"];

function main() {
  const featureDir = path.join(PA, "pregame-features");
  const families = lsdirs(featureDir);
  // dates collected = the union of date-dirs across every feature family
  const featureDates = new Set();
  const gamesByDate = {};
  for (const fam of families) {
    for (const date of lsdirs(path.join(featureDir, fam))) {
      featureDates.add(date);
      const games = gamesByDate[date] || (gamesByDate[date] = new Set());
      for (const f of lsfiles(path.join(featureDir, fam, date))) {
        const gamePk = f.split(/[-_.]/)[0];
        if (/^\d+$/.test(gamePk)) games.add(gamePk);
      }
    }
  }
  const gamesObserved = Object.values(gamesByDate).reduce((a, s) => a + s.size, 0);

  // research observations (settled rows) — parse the jsonl per date; the dir is absent until the first settled slate
  const obsDir = path.join(PA, "research-observations");
  const markets = Object.fromEntries(MARKET_FAMILIES.map((m) => [m, 0]));
  let observations = 0;
  const obsDates = new Set();
  for (const f of lsfiles(obsDir)) {
    if (!f.endsWith(".jsonl")) continue;
    obsDates.add(f.replace(/\.jsonl$/, ""));
    for (const line of (fs.readFileSync(path.join(obsDir, f), "utf8").split("\n"))) {
      if (!line.trim()) continue;
      try { const row = JSON.parse(line); observations++; const m = row.market || row.marketKey || row.marketFamily; if (m && m in markets) markets[m]++; } catch { /* skip */ }
    }
  }

  // settlement joins — census finality + CAPTURED market leans (the pre-observation stage). Finality is on
  // gameFinalStatus.isFinal (NOT a top-level isFinal). A captured lean settles only once its game is final.
  const TEAM_MARKETS = new Set(["h2h", "spreads", "totals"]);
  const joinDates = lsdirs(path.join(PA, "settlement-joins")).sort();
  let finalGames = 0, joinedGames = 0, capturedMarketLeans = 0, teamMarketLeans = 0, playerPropLeans = 0;
  const marketDistribution = {}, propDistribution = {}, settlementStatuses = {}, settledOutcomes = { win: 0, loss: 0, push: 0 };
  const perDate = {};
  for (const d of joinDates) {
    const pd = perDate[d] = { games: 0, final: 0, marketLeans: 0, settledEligible: 0, pending: 0 };
    for (const f of lsfiles(path.join(PA, "settlement-joins", d))) {
      const j = readJson(path.join(PA, "settlement-joins", d, f));
      if (!j) continue;
      joinedGames++; pd.games++;
      if (j.gameFinalStatus?.isFinal) { finalGames++; pd.final++; }
      for (const row of (j.marketRows || [])) {
        capturedMarketLeans++; pd.marketLeans++;
        const m = row.market || "?";
        if (TEAM_MARKETS.has(m)) { teamMarketLeans++; marketDistribution[m] = (marketDistribution[m] || 0) + 1; }
        else { playerPropLeans++; propDistribution[m] = (propDistribution[m] || 0) + 1; }
        const st = row.settlementStatus || "?";
        settlementStatuses[st] = (settlementStatuses[st] || 0) + 1;
        if (st in settledOutcomes) settledOutcomes[st]++;
        if (row.countsAsSettledEligible) pd.settledEligible++;
        if (st === "pending") pd.pending++;
      }
    }
  }

  // reuse the AUTHORITATIVE readiness gate (simulation-readiness.json) — do NOT recompute the gate divergently.
  // Its "N/30" / "M/500" strings are the single source of truth for the modeling gate; this tracker only censuses
  // the warehouse (datesCollected/gamesObserved/observations) as descriptive context alongside that gate.
  const readiness = readJson(path.join(STATUS, "simulation-readiness.json")) || {};
  const featureCoverage = readiness.coverage || null;
  const parseFrac = (s, fallback) => { const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(s ?? "")); return m ? { got: +m[1], target: +m[2] } : fallback; };
  const gateDates = parseFrac(readiness.gate?.dates, { got: featureDates.size, target: DATES_TARGET });
  const gateObs = parseFrac(readiness.gate?.settledObservations, { got: observations, target: OBS_TARGET });

  // missing feature families (0% coverage) + last date that produced a settled observation
  const byFamily = readiness.coverage?.byFamily || {};
  const missingFeatures = Object.entries(byFamily).filter(([, pct]) => (Number(pct) || 0) === 0).map(([k]) => k);
  const lastSuccessfulObservation = [...obsDates].sort().pop() || null;
  // daily research health (Phase 8) — the latest joined date at a glance
  const latestDate = joinDates[joinDates.length - 1] || null;
  const latestObsCount = latestDate ? (() => { try { return fs.readFileSync(path.join(obsDir, `${latestDate}.jsonl`), "utf8").split("\n").filter((l) => l.trim()).length; } catch { return 0; } })() : 0;
  const dailyHealth = latestDate ? {
    date: latestDate,
    capturedGames: perDate[latestDate].games,
    finalGames: perDate[latestDate].final,
    marketLeansCaptured: perDate[latestDate].marketLeans,
    settledEligible: perDate[latestDate].settledEligible,
    observationsCreated: latestObsCount,
    hasFreeze: lsfiles(path.join(PA, "freezes", latestDate)).length > 0,
    hasMarketSnapshots: lsfiles(path.join(PA, "market-snapshots", latestDate)).length > 0,
    note: perDate[latestDate].final === 0 ? "games not final yet — captured leans stay pending until finalization" : (perDate[latestDate].marketLeans === 0 ? "final but no market leans captured (market capture did not run this date)" : "final + market-covered — observations should be produced"),
  } : null;

  // datasetHealth (Phase 5) — "is this dataset ready for research?" Sourced from the observation quality gate.
  const q = readJson(path.join(STATUS, "research-observation-quality.json"));
  const invalidObservations = q ? Object.values(q.hardViolations || {}).reduce((a, b) => a + b, 0) : null;
  const datasetHealth = {
    totalObservations: q?.totalObservations ?? observations,
    validObservations: q ? (q.totalObservations - invalidObservations) : null,
    invalidObservations,
    qualityStatus: q?.status ?? "NOT_RUN",
    averageFeatureCoverage: q?.averageCoverageScore ?? null,
    marketProbabilityCoveragePct: q?.warnings?.marketProbabilityCoveragePct ?? null,
    marketsCovered: Object.keys({ ...marketDistribution, ...propDistribution }).length,
    datesCovered: obsDates.size,               // dates that actually produced settled observations
    latestSettlementDate: lastSuccessfulObservation,
    readyForResearch: false,                    // ALWAYS false until the gate passes + founder approval
    readyReason: "modeling BLOCKED: needs 30 distinct observation dates AND 500 settled observations AND out-of-sample validation AND founder approval",
  };

  // datasetReadiness (Phase 4) — progress toward the 30-DATE / 500-observation dataset gate (NOT model readiness).
  const REQUIRED_DATES = 30, REQUIRED_OBS = 500;
  const currentDates = obsDates.size;              // distinct dates that produced settled observations
  const remainingDates = Math.max(0, REQUIRED_DATES - currentDates);
  // simple projection: ~1 qualifying (final + market-covered) date per day → remainingDates days out. Not a model.
  const estCompletion = (() => { const t = new Date(); t.setUTCDate(t.getUTCDate() + remainingDates); return remainingDates === 0 ? "met" : t.toISOString().slice(0, 10); })();
  const datasetReadiness = {
    currentDates, requiredDates: REQUIRED_DATES, remainingDates,
    observations, remainingObservations: Math.max(0, REQUIRED_OBS - observations),
    estimatedCompletion: estCompletion,
    latestValidDate: lastSuccessfulObservation,
    bindingConstraint: remainingDates > 0 ? "dates" : (observations < REQUIRED_OBS ? "observations" : "met — awaiting founder approval + out-of-sample validation"),
    note: "Dataset readiness only. estimatedCompletion assumes ~1 qualifying date/day and is NOT a model-readiness estimate; modeling stays BLOCKED past the gate until out-of-sample validation + founder approval.",
  };

  const report = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-research-progress",
    lastUpdated: new Date().toISOString(),
    datasetHealth, datasetReadiness,
    datesCollected: featureDates.size,
    gamesObserved,
    observations,
    observationDates: obsDates.size,
    lastSuccessfulObservation,
    // captured market leans (the pre-observation stage — present even while 0 have settled)
    capturedMarketLeans, teamMarketLeans, playerPropLeans,
    marketDistribution, propDistribution, settlementStatuses, settledOutcomes,
    markets, featureCoverage, missingFeatures,
    settlement: { joinDates: joinDates.length, joinedGames, finalGames, perDate },
    dailyHealth,
    gate: {
      // authoritative — mirrors simulation-readiness.json (the gate's single source of truth)
      datesTarget: gateDates.target, observationsTarget: gateObs.target,
      datesCollected: gateDates.got, observations: gateObs.got,
      datesRemaining: Math.max(0, gateDates.target - gateDates.got),
      observationsRemaining: Math.max(0, gateObs.target - gateObs.got),
      met: gateDates.got >= gateDates.target && gateObs.got >= gateObs.target,
      modelingStatus: "BLOCKED",
    },
    note: "Accumulation tracker only. Modeling stays BLOCKED until 30 dates AND 500 settled observations AND out-of-sample validation AND founder approval. observations=0 until slates finalize and produce settled, research-eligible market leans; high feature/market-lean coverage does NOT make a model ready.",
  };

  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(path.join(STATUS, "research-progress.json"), JSON.stringify(report, null, 2));

  console.log("\n=== MLB RESEARCH PROGRESS ===");
  console.log(`  feature dates:    ${report.datesCollected}  ·  games observed: ${gamesObserved}  ·  coverage ${featureCoverage?.featureCoveragePct ?? "-"}%`);
  console.log(`  captured leans:   ${capturedMarketLeans}  (team ${teamMarketLeans} · props ${playerPropLeans})  across ${joinDates.length} join dates (${finalGames}/${joinedGames} games final)`);
  console.log(`  observations:     ${observations}/${OBS_TARGET}  ·  settled outcomes ${JSON.stringify(settledOutcomes)}  ·  last: ${lastSuccessfulObservation || "none"}`);
  if (dailyHealth) console.log(`  latest ${dailyHealth.date}: ${dailyHealth.capturedGames} games · ${dailyHealth.finalGames} final · ${dailyHealth.marketLeansCaptured} leans · ${dailyHealth.observationsCreated} obs — ${dailyHealth.note}`);
  console.log(`  GATE: ${report.gate.met ? "MET" : "NOT MET"}  ·  modeling BLOCKED  ·  need ${report.gate.datesRemaining} more dates, ${report.gate.observationsRemaining} more observations`);
  console.log(`  → data/internal/mlb/pregame-archive/status/research-progress.json`);
  process.exit(0);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();
