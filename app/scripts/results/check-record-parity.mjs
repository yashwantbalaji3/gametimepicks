#!/usr/bin/env node
/**
 * Stage 3E — do all public readers of a record publish the same numbers? Reads the committed artifacts (what
 * Production serves) and exits 1 on any disagreement or missing reader. Run from app/:
 *   node scripts/results/check-record-parity.mjs [--json]
 * Records checked:
 *   NFL game winners  graded-picks.json · Forecast Ledger nfl_game_winner · settler lifetime summary (cohorts)
 *   MLB player leans  graded-picks.json · Python lifetime_summary.json · model-index.json
 *   MLB game calls    game-predictions-record.json · Forecast Ledger (moneyline, run line, total)
 */
import fs from "node:fs";
import path from "node:path";
import { parityReport, winsFromAccuracy, ledgerDirectional } from "../../src/lib/results/record-parity.mjs";

const APP = process.cwd();
const ROOT = path.resolve(APP, "..");
const json = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const jsonl = (p) => { try { return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return null; } };
const counts = (o, w = "wins", l = "losses") => ({ win: o?.[w] ?? null, loss: o?.[l] ?? null });

const nflPicks = json(path.join(APP, "public/data/nfl/graded-picks.json"));
const mlbPicks = json(path.join(APP, "public/data/mlb/graded-picks.json"));
const nflLedger = jsonl(path.join(ROOT, "data/internal/forecast-ledger/v1/nfl.jsonl"));
const mlbLedger = jsonl(path.join(ROOT, "data/internal/forecast-ledger/v1/mlb.jsonl"));
const settler = json(path.join(ROOT, "data/internal/nfl/experimental-settlement/summary.json"));
const lifetime = json(path.join(APP, "public/data/mlb/results/lifetime_summary.json"));
const modelIndex = json(path.join(APP, "public/data/mlb/results/model-index.json"));
const gameRecord = json(path.join(APP, "public/data/mlb/results/game-predictions-record.json"));

const groups = [
  { record: "NFL game winners", readers: [
    { name: "graded-picks", ...counts(nflPicks?.counts, "hits", "misses") },
    { name: "forecast-ledger", ...ledgerDirectional(nflLedger, "nfl_game_winner") },
    { name: "settler lifetime", ...(settler?.cohorts ? winsFromAccuracy(settler.cohorts) : { win: null, loss: null }) },
  ] },
  { record: "MLB player leans", readers: [
    { name: "graded-picks", ...counts(mlbPicks?.counts, "hits", "misses") },
    { name: "lifetime_summary (Python)", ...counts(lifetime) },
    { name: "model-index", ...counts(modelIndex?.coverage) },
  ] },
  ...[["moneyline", "mlb_moneyline"], ["run_line", "mlb_run_line"], ["total", "mlb_total"]].map(([fam, ledgerFam]) => ({
    record: `MLB game calls · ${fam}`, readers: [
      { name: "game-predictions-record", ...counts(gameRecord?.families?.[fam]) },
      { name: "forecast-ledger", ...ledgerDirectional(mlbLedger, ledgerFam) },
    ],
  })),
];

const report = parityReport(groups);
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else for (const r of report.rows) console.log(`${r.state.padEnd(8)} ${r.record}: ${r.detail}`);
process.exit(report.ok ? 0 : 1);
