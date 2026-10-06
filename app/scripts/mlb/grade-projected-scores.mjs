#!/usr/bin/env node
/**
 * GRADE MLB PROJECTED SCORES — the published simulation medians (projected score per team, simulation-median total)
 * against the official final, from the SAME forecast of record the game-prediction owner graded. Rules and refusals:
 * lib/mlb/prediction/grade-projected-scores.mjs.
 *
 *   node scripts/mlb/grade-projected-scores.mjs [--write]
 *
 * Reads   app/public/data/mlb/results/game-predictions-graded.jsonl   (forecast of record + official final, per game)
 *         the source each graded row names: snapshot:<date>/<file> → data/internal/mlb/prediction-snapshots/,
 *         dated-file:<date> → app/public/data/mlb/predictions/<date>.json (only while it still holds that revision),
 *         git:<sha12> → that commit's app/public/data/mlb/predictions/<date>.json (needs the commit in the clone)
 * Appends app/public/data/mlb/results/game-projected-scores-graded.jsonl (append-only; a graded game is never redone)
 *
 * A source that cannot be opened leaves the game UNRECOVERED — counted, retried next run, never approximated.
 * Exit 3 only when a SNAPSHOT-sourced game cannot be re-opened (an immutable file missing = a broken join).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gradeProjectedScore } from "../../src/lib/mlb/prediction/grade-projected-scores.mjs";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROOT = path.resolve(APP, "..");
const OWNER = path.join(APP, "public/data/mlb/results/game-predictions-graded.jsonl");
const LEDGER = path.join(APP, "public/data/mlb/results/game-projected-scores-graded.jsonl");
const SNAPSHOTS = path.join(ROOT, "data/internal/mlb/prediction-snapshots");
const PRED_DIR = path.join(APP, "public/data/mlb/predictions");
const WRITE = process.argv.includes("--write");

const readJsonl = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

const cache = new Map();
function openRevision(source, date) {
  const key = `${source}|${date}`;
  if (cache.has(key)) return cache.get(key);
  let doc = null;
  let m;
  if ((m = /^snapshot:(\d{4}-\d{2}-\d{2}\/snapshot-\d{12}\.json)$/.exec(source))) {
    doc = readJson(path.join(SNAPSHOTS, m[1]));
  } else if ((m = /^dated-file:(\d{4}-\d{2}-\d{2})$/.exec(source))) {
    doc = readJson(path.join(PRED_DIR, `${m[1]}.json`));
  } else if ((m = /^git:([0-9a-f]{7,40})$/.exec(source)) && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    try {
      doc = JSON.parse(execFileSync("git", ["show", `${m[1]}:app/public/data/mlb/predictions/${date}.json`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }));
    } catch { doc = null; }
  }
  const rev = doc && typeof doc.generatedAt === "string" && Array.isArray(doc.predictions) ? doc : null;
  cache.set(key, rev);
  return rev;
}

const owner = readJsonl(OWNER);
const already = new Set(readJsonl(LEDGER).map((r) => String(r.gamePk)));
const byGame = new Map();
for (const r of owner) {
  if (!Number.isInteger(r.gamePk)) continue;
  const k = String(r.gamePk);
  byGame.set(k, [...(byGame.get(k) ?? []), r]);
}

const added = [];
const refused = {};
const snapshotMisses = [];
for (const [pk, rows] of byGame) {
  if (already.has(pk)) continue;
  const src = rows[0].forecastSource;
  const out = gradeProjectedScore(rows, openRevision(String(src ?? ""), rows[0].date));
  if (out.refused) {
    refused[out.refused] = (refused[out.refused] ?? 0) + 1;
    if (String(src).startsWith("snapshot:") && out.refused !== "NO_PUBLISHED_MEDIAN") snapshotMisses.push(`${pk} (${out.refused})`);
    continue;
  }
  added.push(out.row);
}
added.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.gamePk - b.gamePk);

const err = (rs, f) => rs.map(f).filter((v) => v != null);
const mae = (xs) => (xs.length ? (xs.reduce((s, x) => s + Math.abs(x), 0) / xs.length).toFixed(2) : "—");
console.log(`\nMLB projected-score grading`);
console.log(`  graded games: ${byGame.size} · already here: ${already.size} · NEWLY GRADED: ${added.length}`);
if (Object.keys(refused).length) console.log(`  not graded: ${JSON.stringify(refused)}`);
const team = err(added, (r) => r.projectedScore && [r.projectedScore.away - r.actual.awayRuns, r.projectedScore.home - r.actual.homeRuns]).flat();
const tot = err(added, (r) => (r.simulationMedianTotal == null ? null : r.simulationMedianTotal - r.actual.totalRuns));
console.log(`  new rows: team MAE ${mae(team)} over ${team.length} team scores · median-total MAE ${mae(tot)} over ${tot.length} games`);

if (WRITE && added.length) {
  fs.appendFileSync(LEDGER, added.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`\nappended ${added.length} row(s) to ${path.relative(APP, LEDGER)}`);
} else if (!WRITE) {
  console.log("\ndry run — pass --write to append.");
}
if (snapshotMisses.length) {
  console.error(`REFUSED — ${snapshotMisses.length} snapshot-sourced game(s) could not be re-opened: ${snapshotMisses.slice(0, 5).join(", ")}`);
  process.exit(3);
}
