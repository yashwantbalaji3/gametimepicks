#!/usr/bin/env node
/**
 * Stage 3B — the MLB lean forecast of record, as row ids, for writers outside the JS readers.
 *
 * pipeline/mlb/export_mlb_results.py (lifetime_summary.json) calls this instead of re-implementing the rule, so the
 * Python lifetime summary and graded-picks.json count the SAME rows (lib/results/mlb-leans-of-record.mjs: one lean per
 * game · player · market, the last board before the game's canonical start). Read-only: prints JSON to stdout, writes
 * nothing.
 *
 *   node app/scripts/results/mlb-leans-of-record-ids.mjs --leans <mlb_settled_leans.jsonl> [--games <game-predictions-graded.jsonl>]
 *
 * Output: { schemaVersion, sourceRows, recordIds: [...], notOfRecordIds: [...], excluded, timingUnverified, startSources }
 * Exit 1 when --leans is missing or unreadable (the caller fails closed: no summary is better than a second rule).
 */
import fs from "node:fs";

import { mlbFirstPitches, mlbLeansOfRecord } from "../../src/lib/results/mlb-leans-of-record.mjs";

const arg = (f) => { const i = process.argv.indexOf(f); return i > -1 ? process.argv[i + 1] ?? null : null; };
const readJsonl = (p) => fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim())
  .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const leansPath = arg("--leans");
if (!leansPath || !fs.existsSync(leansPath)) {
  console.error(`mlb-leans-of-record-ids: --leans ${leansPath ?? "(missing)"} is not readable`);
  process.exit(1);
}
const gamesPath = arg("--games");
const leans = readJsonl(leansPath);
const games = gamesPath && fs.existsSync(gamesPath) ? readJsonl(gamesPath) : [];
const sel = mlbLeansOfRecord(leans, { firstPitches: mlbFirstPitches(games) });
process.stdout.write(JSON.stringify({
  schemaVersion: 1,
  sourceRows: leans.length,
  recordIds: [...sel.recordIds],
  notOfRecordIds: [...sel.notOfRecordIds],
  excluded: sel.excluded,
  timingUnverified: sel.timingUnverified,
  startSources: sel.startSources,
}) + "\n");
