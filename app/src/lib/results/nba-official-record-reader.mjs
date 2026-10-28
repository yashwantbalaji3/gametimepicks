/**
 * Build-time reader: the first graded game of the NBA Official Forecast record, from the committed public lane
 * (app/public/data/nba/experimental-public/<date>.json) and finals record (results/finals-<season>.json) — the same two
 * files /results/nba grades from (lib/results/nba-level-a-readers.ts nbaForecastVsActualView), through the same pure
 * grader. SERVER ONLY (fs). Read-only; a missing lane or finals file yields null, and a null date is never printed.
 */
import fs from "node:fs";
import path from "node:path";

import { nbaForecastVsActual } from "./nba-forecast-vs-actual.mjs";
import { firstGradedGameDate } from "./nba-official-record.mjs";

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const memo = new Map();

/** @param {string} [dataRoot] app/public/data @returns {string | null} ET date, e.g. "2026-10-20" */
export function nbaFirstGradedGameDate(dataRoot = path.join(process.cwd(), "public", "data")) {
  if (memo.has(dataRoot)) return memo.get(dataRoot);
  let laneFiles = [];
  try {
    laneFiles = fs.readdirSync(path.join(dataRoot, "nba", "experimental-public")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  } catch { /* no lane */ }
  let finals = null;
  try {
    const f = fs.readdirSync(path.join(dataRoot, "nba", "results")).filter((x) => /^finals-\d{4}-\d{2}\.json$/.test(x)).sort().at(-1);
    finals = f ? readJson(path.join(dataRoot, "nba", "results", f)) : null;
  } catch { /* no finals */ }
  /* Oldest lane day first: the first day with a graded game answers, so a build reads one or two files, not all. */
  let first = null;
  for (const f of laneFiles) {
    const day = readJson(path.join(dataRoot, "nba", "experimental-public", f));
    if (!day) continue;
    first = firstGradedGameDate(nbaForecastVsActual([day], finals));
    if (first) break;
  }
  memo.set(dataRoot, first);
  return first;
}
