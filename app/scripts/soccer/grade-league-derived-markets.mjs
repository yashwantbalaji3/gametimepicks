#!/usr/bin/env node
/**
 * GRADE LEAGUE DERIVED MARKETS — over 2.5, both teams to score and the likeliest score an accepted league's page
 * prints, against the SAME pre-kickoff forecast the 1X2 owner graded. Rules and refusals:
 * lib/sports/soccer/derived-markets-grade.mjs.
 *
 *   node scripts/soccer/grade-league-derived-markets.mjs --league ligue-1 [--write]
 *
 * Reads   public/data/soccer/<league>/results/graded.json          (forecast of record + official final, per match)
 *         public/data/soccer/<league>/forecasts/YYYY-MM-DD.json     (the dated archives that forecast lives in)
 * Appends public/data/soccer/<league>/results/graded-derived-markets.jsonl (append-only; a graded match is never redone)
 *
 * Exit 3 when a graded match cannot be re-opened: the archive keeps every kicked-off match's last pre-kickoff row, so
 * a miss is a broken join, not missing history.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeLeagueDerived, locateLeagueForecast } from "../../src/lib/sports/soccer/derived-markets-grade.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; };
const KEY = arg("--league");
const WRITE = process.argv.includes("--write");
if (!KEY || !/^[a-z0-9-]+$/.test(KEY)) { console.error("usage: --league <key> [--write]"); process.exit(2); }

const dir = path.join(APP, "public/data/soccer", KEY);
const gradedFile = path.join(dir, "results", "graded.json");
const LEDGER = path.join(dir, "results", "graded-derived-markets.jsonl");
const readJsonl = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);

const graded = fs.existsSync(gradedFile) ? JSON.parse(fs.readFileSync(gradedFile, "utf8")).matches ?? [] : [];
if (graded.length === 0) { console.log(`${KEY}: no graded matches — nothing to grade`); process.exit(0); }
const already = new Set(readJsonl(LEDGER).map((r) => r.eventId));

const fdir = path.join(dir, "forecasts");
const archives = (fs.existsSync(fdir) ? fs.readdirSync(fdir) : [])
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()
  .map((f) => ({ source: `forecasts/${f}`, rows: JSON.parse(fs.readFileSync(path.join(fdir, f), "utf8")).rows ?? [] }));

const added = [];
const refused = {};
const misses = [];
for (const g of graded) {
  if (already.has(g.eventId)) continue;
  const out = gradeLeagueDerived(g, locateLeagueForecast(g, archives), KEY);
  if (out.refused) {
    refused[out.refused] = (refused[out.refused] ?? 0) + 1;
    if (out.refused === "FORECAST_OF_RECORD_UNRECOVERED") misses.push(g.eventId);
    continue;
  }
  added.push(out.row);
}

console.log(`\n${KEY} derived-market grading (over 2.5 · both teams to score · likeliest score)`);
console.log(`  graded matches: ${graded.length} · already here: ${already.size} · NEWLY GRADED: ${added.length}`);
if (Object.keys(refused).length) console.log(`  not graded: ${JSON.stringify(refused)}`);
for (const r of added) {
  console.log(`    ${String(r.matchup).padEnd(36)} ${r.final.score.padEnd(5)} o2.5 ${r.outcomes.over25 ? "Y" : "N"} p=${r.forecast.over25.toFixed(3)} · btts ${r.outcomes.btts ? "Y" : "N"} p=${r.forecast.bttsYes.toFixed(3)} · likeliest ${r.forecast.likeliestScore.score} ${r.outcomes.likeliestScoreHit ? "HIT" : "miss"}`);
}

if (WRITE && added.length) {
  fs.appendFileSync(LEDGER, added.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`\nappended ${added.length} row(s) to ${path.relative(APP, LEDGER)}`);
} else if (!WRITE) {
  console.log("\ndry run — pass --write to append.");
}
if (misses.length) {
  console.error(`REFUSED — ${misses.length} graded match(es) could not be re-opened from the archive: ${misses.slice(0, 5).join(", ")}`);
  process.exit(3);
}
