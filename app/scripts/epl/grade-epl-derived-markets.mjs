#!/usr/bin/env node
/**
 * GRADE EPL DERIVED MARKETS — both teams to score, clean sheet (each side) and the correct-score table, against the
 * SAME pre-kickoff forecast the 1X2 owner graded. Rules and refusals: lib/sports/epl/derived-markets-grade.mjs.
 *
 *   node scripts/epl/grade-epl-derived-markets.mjs [--write] [--from-history]
 *
 * Reads   app/public/data/soccer/epl/results/graded-forecasts.jsonl     (forecast of record + official final score)
 *         data/internal/research/epl/forecasts/{snapshot-*,YYYY-MM-DD}.json (the revisions that forecast lives in)
 * Appends app/public/data/soccer/epl/results/graded-derived-markets.jsonl (append-only; a graded event is never redone)
 *
 * --from-history additionally reads every COMMITTED revision of the dated file the 1X2 owner cited (git), for the
 * matches graded before per-run snapshots existed (2026-08-22). A match whose exact revision is in neither place stays
 * UNRECOVERED — counted, never approximated from another revision and never rebuilt from the result.
 *
 * Exit 3 when a match graded in the snapshot era cannot be re-opened: that is a broken join, not missing history.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeDerivedMarkets, locateForecastOfRecord } from "../../src/lib/sports/epl/derived-markets-grade.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(APP, "..");
const FORECAST_DIR = path.join(REPO, "data/internal/research/epl/forecasts");
const RESULTS = path.join(APP, "public/data/soccer/epl/results");
const GRADED_1X2 = path.join(RESULTS, "graded-forecasts.jsonl");
const LEDGER = path.join(RESULTS, "graded-derived-markets.jsonl");
/* Per-run immutable snapshots began with 6f6f70118 (2026-08-22T14:09:49Z); a forecast after this always has one. */
const SNAPSHOT_ERA = "2026-08-22T14:09:49Z";

const WRITE = process.argv.includes("--write");
const FROM_HISTORY = process.argv.includes("--from-history");

const readJsonl = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);

const graded = readJsonl(GRADED_1X2);
if (graded.length === 0) { console.log("no graded EPL matches — nothing to grade"); process.exit(0); }
const already = new Set(readJsonl(LEDGER).map((r) => r.eventId));

const artifacts = fs.readdirSync(FORECAST_DIR)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) || /^snapshot-\d{12}\.json$/.test(f))
  .sort()
  .map((f) => {
    const doc = JSON.parse(fs.readFileSync(path.join(FORECAST_DIR, f), "utf8"));
    return { source: `forecasts/${f}`, generatedAt: doc.generatedAt, rows: doc.rows ?? [] };
  });

const historyCache = new Map();
function historyRevisions(forecastSource) {
  const m = /^forecasts\/(\d{4}-\d{2}-\d{2}\.json)$/.exec(String(forecastSource ?? ""));
  if (!m) return [];
  if (historyCache.has(m[1])) return historyCache.get(m[1]);
  const rel = `data/internal/research/epl/forecasts/${m[1]}`;
  const out = [];
  let shas = [];
  try { shas = execFileSync("git", ["log", "--format=%H", "--", rel], { cwd: REPO, encoding: "utf8" }).trim().split("\n").filter(Boolean); } catch { /* no history */ }
  for (const sha of shas) {
    let text;
    try { text = execFileSync("git", ["show", `${sha}:${rel}`], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); } catch { continue; }
    try {
      const doc = JSON.parse(text);
      out.push({ source: `git:${sha.slice(0, 12)}:forecasts/${m[1]}`, generatedAt: doc.generatedAt, rows: doc.rows ?? [] });
    } catch { /* an unparseable revision is not a forecast */ }
  }
  historyCache.set(m[1], out);
  return out;
}

if (FROM_HISTORY) {
  const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: REPO, encoding: "utf8" }).trim();
  if (shallow === "true") console.log("  note: shallow clone — history reaches only as far as fetched; anything older stays UNRECOVERED");
}

const added = [];
const refused = {};
const snapshotEraMisses = [];
for (const g of graded) {
  if (already.has(g.eventId)) continue;
  let located = locateForecastOfRecord(g, artifacts);
  if (!located && FROM_HISTORY) located = locateForecastOfRecord(g, historyRevisions(g.forecastSource));
  const out = gradeDerivedMarkets(g, located);
  if (out.refused) {
    refused[out.refused] = (refused[out.refused] ?? 0) + 1;
    if (out.refused === "FORECAST_OF_RECORD_UNRECOVERED" && Date.parse(g.forecastGeneratedAt) >= Date.parse(SNAPSHOT_ERA)) snapshotEraMisses.push(g.eventId);
    continue;
  }
  added.push(out.row);
}

console.log(`\nEPL derived-market grading (BTTS · clean sheet · correct score)`);
console.log(`  graded matches: ${graded.length} · already here: ${already.size} · NEWLY GRADED: ${added.length}`);
if (Object.keys(refused).length) console.log(`  not graded: ${JSON.stringify(refused)}`);
for (const r of added) {
  console.log(`    ${r.matchup.padEnd(40)} ${r.actual.score.padEnd(5)} btts ${r.outcomes.btts ? "Y" : "N"} p=${r.forecast.btts.yes.toFixed(3)} · score class ${r.outcomes.scorelineClass} · from ${r.recoveredFrom}`);
}

if (WRITE && added.length) {
  fs.appendFileSync(LEDGER, added.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`\nappended ${added.length} row(s) to ${path.relative(APP, LEDGER)}`);
} else if (!WRITE) {
  console.log("\ndry run — pass --write to append.");
}

if (snapshotEraMisses.length) {
  console.error(`REFUSED — ${snapshotEraMisses.length} match(es) graded after per-run snapshots began could not be re-opened: ${snapshotEraMisses.slice(0, 5).join(", ")}`);
  process.exit(3);
}
