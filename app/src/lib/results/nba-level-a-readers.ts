/**
 * Build-time readers for the two NBA-season Results records (founder mandate 2026-10-24). Read-only; each degrades to
 * an empty record when its file is absent, and an empty record renders as "nothing recorded yet", never as zero wins.
 *
 *   levelARecordView()        data/internal/products/level-a/{suggestions,graded}.jsonl  → lib/results/level-a-record.mjs
 *   nbaForecastVsActualView() app/public/data/nba/experimental-public/<date>.json + results/finals-<season>.json
 *                                                                                         → lib/results/nba-forecast-vs-actual.mjs
 */
import fs from "node:fs";
import path from "node:path";

import { levelARecord } from "@/lib/results/level-a-record.mjs";
import { nbaForecastVsActual } from "@/lib/results/nba-forecast-vs-actual.mjs";

const readJsonl = (p: string): Record<string, any>[] => {
  try { return fs.readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)); } catch { return []; }
};
const readJson = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

export const LEVEL_A_DIR = path.resolve(process.cwd(), "..", "data/internal/products/level-a");

export function levelARecordView(dir: string = LEVEL_A_DIR) {
  return levelARecord(readJsonl(path.join(dir, "suggestions.jsonl")), readJsonl(path.join(dir, "graded.jsonl")));
}

/** ET dates with a published NBA lane file — each gets a /results/date/<d>/ page carrying that day's games. */
export function nbaOfficialForecastDates(dataRoot: string = path.join(process.cwd(), "public", "data")): string[] {
  try { return fs.readdirSync(path.join(dataRoot, "nba", "experimental-public")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort(); } catch { return []; }
}

export function nbaForecastVsActualView(dataRoot: string = path.join(process.cwd(), "public", "data")) {
  const laneDir = path.join(dataRoot, "nba", "experimental-public");
  let days: any[] = [];
  try {
    days = fs.readdirSync(laneDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => readJson(path.join(laneDir, f))).filter(Boolean);
  } catch { /* no lane yet */ }
  const resultsDir = path.join(dataRoot, "nba", "results");
  let finals: any = null;
  try {
    const f = fs.readdirSync(resultsDir).filter((x) => /^finals-\d{4}-\d{2}\.json$/.test(x)).sort().at(-1);
    finals = f ? readJson(path.join(resultsDir, f)) : null;
  } catch { /* no finals yet */ }
  return nbaForecastVsActual(days, finals);
}
