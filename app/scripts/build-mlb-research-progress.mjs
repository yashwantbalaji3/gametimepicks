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

  // settlement joins — how many dates have joins, and how many are final vs pending
  const joinDates = lsdirs(path.join(PA, "settlement-joins"));
  let finalJoins = 0, pendingJoins = 0;
  for (const d of joinDates) for (const f of lsfiles(path.join(PA, "settlement-joins", d))) {
    const j = readJson(path.join(PA, "settlement-joins", d, f));
    if (j?.isFinal || j?.joinStatus === "final" || j?.joinStatus === "settled") finalJoins++; else pendingJoins++;
  }

  // reuse the AUTHORITATIVE readiness gate (simulation-readiness.json) — do NOT recompute the gate divergently.
  // Its "N/30" / "M/500" strings are the single source of truth for the modeling gate; this tracker only censuses
  // the warehouse (datesCollected/gamesObserved/observations) as descriptive context alongside that gate.
  const readiness = readJson(path.join(STATUS, "simulation-readiness.json")) || {};
  const featureCoverage = readiness.coverage || null;
  const parseFrac = (s, fallback) => { const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(s ?? "")); return m ? { got: +m[1], target: +m[2] } : fallback; };
  const gateDates = parseFrac(readiness.gate?.dates, { got: featureDates.size, target: DATES_TARGET });
  const gateObs = parseFrac(readiness.gate?.settledObservations, { got: observations, target: OBS_TARGET });

  const report = {
    public: false, approvedForProduction: false, productEligible: false, kind: "mlb-research-progress",
    lastUpdated: new Date().toISOString(),
    datesCollected: featureDates.size,
    gamesObserved,
    observations,
    observationDates: obsDates.size,
    markets,
    featureCoverage,
    settlement: { joinDates: joinDates.length, finalJoins, pendingJoins },
    gate: {
      // authoritative — mirrors simulation-readiness.json (the gate's single source of truth)
      datesTarget: gateDates.target, observationsTarget: gateObs.target,
      datesCollected: gateDates.got, observations: gateObs.got,
      datesRemaining: Math.max(0, gateDates.target - gateDates.got),
      observationsRemaining: Math.max(0, gateObs.target - gateObs.got),
      met: gateDates.got >= gateDates.target && gateObs.got >= gateObs.target,
      modelingStatus: "BLOCKED",
    },
    note: "Accumulation tracker only. Modeling stays BLOCKED until 30 dates AND 500 settled observations AND out-of-sample validation AND founder approval. observations=0 until slates finalize and produce settled, research-eligible market leans; high feature coverage does NOT make a model ready.",
  };

  fs.mkdirSync(STATUS, { recursive: true });
  fs.writeFileSync(path.join(STATUS, "research-progress.json"), JSON.stringify(report, null, 2));

  console.log("\n=== MLB RESEARCH PROGRESS ===");
  console.log(`  dates collected:  ${report.datesCollected}/${DATES_TARGET}  ·  games observed: ${gamesObserved}`);
  console.log(`  observations:     ${observations}/${OBS_TARGET}  (across ${obsDates.size} settled dates)`);
  console.log(`  settlement joins: ${joinDates.length} dates  ·  final ${finalJoins}  ·  pending ${pendingJoins}`);
  console.log(`  feature coverage: ${featureCoverage?.featureCoveragePct ?? "-"}%`);
  console.log(`  gate: ${report.gate.met ? "MET" : "NOT MET"}  ·  modeling: BLOCKED  ·  need ${report.gate.datesRemaining} more dates, ${report.gate.observationsRemaining} more observations`);
  console.log(`  → data/internal/mlb/pregame-archive/status/research-progress.json`);
  process.exit(0);
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) main();
