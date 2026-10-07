#!/usr/bin/env node
/**
 * Stage 3E — do all public readers of a record publish the same numbers? Reads the committed artifacts (what
 * Production serves) and exits 1 on any disagreement or missing reader. Run from app/:
 *   node scripts/results/check-record-parity.mjs [--json]
 * Records checked (every committed artifact that states one of these records, found by search on 2026-10-07):
 *   NFL game winners       graded-picks.json · Forecast Ledger nfl_game_winner · settler lifetime summary (cohorts)
 *                          · NFL index experimentalRecord (cohorts) · interval-calibration.json (cohorts)
 *   NFL regular season     settler regular-season cohort · NFL index · interval-calibration · weekly reports (sum)
 *   MLB player leans       graded-picks.json · Python lifetime_summary.json · model-index.json
 *                          · audit/model_audit.json (pipeline/model_audit.py) · research/terminal-summary.json
 *   MLB game calls         game-predictions-record.json · Forecast Ledger (moneyline, run line, total)
 *   MLB Homer Nukes        homer-nukes/record.json (homered vs not) · Forecast Ledger mlb_homer_nukes (HIT / MISS)
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
const hnRecord = json(path.join(APP, "public/data/mlb/homer-nukes/record.json"));
const hnLedger = (() => {
  if (!mlbLedger) return { win: null, loss: null };
  const rows = mlbLedger.filter((r) => r.family === "mlb_homer_nukes" && r.settlement?.state === "SETTLED");
  return { win: rows.filter((r) => r.settlement.finalCategory === "HIT").length, loss: rows.filter((r) => r.settlement.finalCategory === "MISS").length };
})();
const modelAudit = json(path.join(APP, "public/data/audit/model_audit.json"));
const terminal = json(path.join(APP, "public/data/research/terminal-summary.json"));
const nflIndex = json(path.join(APP, "public/data/nfl/index.json"));
const intervals = json(path.join(APP, "public/data/nfl/interval-calibration.json"));
const reconDir = path.join(APP, "public/data/nfl/reconciliation");
const weekly = (() => {
  // Sum of the weekly reports' winner lines (regular season, one report per week).
  let win = 0, loss = 0, seen = 0;
  for (const f of fs.existsSync(reconDir) ? fs.readdirSync(reconDir).filter((f) => /^2-\d{2}\.json$/.test(f)) : []) {
    const w = json(path.join(reconDir, f))?.summary?.props?.find((p) => p.id === "winner");
    if (!w || !Number.isInteger(w.hits) || !Number.isInteger(w.checks)) return { win: null, loss: null };
    seen += 1; win += w.hits; loss += w.checks - w.hits - (w.voids ?? 0);
  }
  return seen ? { win, loss } : { win: null, loss: null };
})();
const cohortsOf = (list) => (Array.isArray(list) ? Object.fromEntries(list.map((c) => [c.label, { decisive: c.n, winnerAccuracy: c.winnerAccuracy }])) : null);
const only = (cohorts, label) => (cohorts?.[label] ? { [label]: cohorts[label] } : null);
const fromCohorts = (c) => (c ? winsFromAccuracy(c) : { win: null, loss: null });

const groups = [
  { record: "NFL game winners", readers: [
    { name: "graded-picks", ...counts(nflPicks?.counts, "hits", "misses") },
    { name: "forecast-ledger", ...ledgerDirectional(nflLedger, "nfl_game_winner") },
    { name: "settler lifetime", ...fromCohorts(settler?.cohorts) },
    { name: "NFL index", ...fromCohorts(nflIndex?.experimentalRecord?.cohorts) },
    { name: "interval-calibration", ...fromCohorts(cohortsOf(intervals?.cohorts)) },
  ] },
  { record: "NFL game winners · regular season", readers: [
    { name: "settler lifetime", ...fromCohorts(only(settler?.cohorts, "regular-season")) },
    { name: "NFL index", ...fromCohorts(only(nflIndex?.experimentalRecord?.cohorts, "regular-season")) },
    { name: "interval-calibration", ...fromCohorts(only(cohortsOf(intervals?.cohorts), "regular-season")) },
    { name: "weekly reports", ...weekly },
  ] },
  { record: "MLB player leans", readers: [
    { name: "graded-picks", ...counts(mlbPicks?.counts, "hits", "misses") },
    { name: "lifetime_summary (Python)", ...counts(lifetime) },
    { name: "model-index", ...counts(modelIndex?.coverage) },
    { name: "model_audit (Python)", ...counts(modelAudit?.sports?.mlb?.lifetime) },
    { name: "research terminal-summary", win: terminal?.modelUniverse?.wins ?? null,
      loss: Number.isInteger(terminal?.modelUniverse?.decisiveRows) && Number.isInteger(terminal?.modelUniverse?.wins) ? terminal.modelUniverse.decisiveRows - terminal.modelUniverse.wins : null },
  ] },
  { record: "MLB Homer Nukes (homered / did not)", readers: [
    { name: "homer-nukes record.json", win: hnRecord?.actual ?? null, loss: Number.isInteger(hnRecord?.gradedPicks) && Number.isInteger(hnRecord?.actual) ? hnRecord.gradedPicks - hnRecord.actual : null },
    { name: "forecast-ledger", ...hnLedger },
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
