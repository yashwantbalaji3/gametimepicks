import fs from "node:fs";
import path from "node:path";

import { mlbFirstPitches, mlbLeansOfRecord } from "./results/mlb-leans-of-record.mjs";
import type {
  MlbAvailableDates,
  MlbComparisonReport,
  MlbLifetimeSummary,
  MlbSettledLean,
} from "./types-mlb-results";

const RESULTS_DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "mlb",
  "results",
);

function readJson<T>(rel: string, fallback: T): T {
  try {
    const p = path.join(RESULTS_DIR, rel);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch (err) {
    console.warn(`[data-mlb-results] could not load ${rel}:`, err);
    return fallback;
  }
}

export function getMlbAvailableResultDates(): MlbAvailableDates {
  return readJson<MlbAvailableDates>("available_dates.json", {
    sport: "MLB",
    generatedAt: new Date().toISOString(),
    dates: [],
  });
}

export function getMlbLifetimeSummary(): MlbLifetimeSummary | null {
  const summary = readJson<MlbLifetimeSummary | null>(
    "lifetime_summary.json",
    null,
  );
  if (!summary || summary.totalSettled === 0) return null;
  return summary;
}

export function getMlbComparisonReport(
  date: string,
): MlbComparisonReport | null {
  const p = path.join(RESULTS_DIR, `comparison_report_${date}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as MlbComparisonReport;
  } catch (err) {
    console.warn(`[data-mlb-results] could not parse ${date} report:`, err);
    return null;
  }
}

/**
 * Pick the most recent MLB Results date on disk. Returns null when none
 * exist yet — the UI can fall back to a polished "pending" empty state.
 */
export function latestMlbResultDate(): string | null {
  const dates = getMlbAvailableResultDates().dates;
  return dates.length ? dates[dates.length - 1] : null;
}

function readJsonl(name: string): Record<string, unknown>[] {
  const p = path.join(RESULTS_DIR, name);
  if (!fs.existsSync(p)) return [];
  const out: Record<string, unknown>[] = [];
  try {
    const text = fs.readFileSync(p, "utf-8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t));
      } catch {
        // Skip malformed lines silently — never break the page on one bad row
      }
    }
  } catch (err) {
    console.warn(`[data-mlb-results] could not read ${name}:`, err);
  }
  return out;
}

/**
 * The settled MLB leans OF RECORD, for every settled date. The public
 * settled_leans.jsonl keeps every raw row; a lean re-issued on a later
 * board (the postponed 824785 game, Sep 22 → Sep 23) is in it twice.
 * Stage 3B: every page that counts these rows reads them through the one
 * forecast-of-record rule (lib/results/mlb-leans-of-record.mjs), the same
 * selection as graded-picks.json, lifetime_summary.json, model_audit.json
 * and the Results day pages, so no page counts an earlier copy.
 * Returns [] when the file doesn't exist yet.
 */
let leansOfRecordCache: MlbSettledLean[] | null = null;
export function getMlbSettledLeans(): MlbSettledLean[] {
  // Read once per build process: every date page calls this, and the files only change between builds.
  if (leansOfRecordCache) return leansOfRecordCache;
  const leans = readJsonl("settled_leans.jsonl");
  if (leans.length === 0) return [];
  const games = readJsonl("game-predictions-graded.jsonl");
  leansOfRecordCache = mlbLeansOfRecord(leans, { firstPitches: mlbFirstPitches(games) }).record as unknown as MlbSettledLean[];
  return leansOfRecordCache;
}

export function getMlbSettledLeansForDate(date: string): MlbSettledLean[] {
  return getMlbSettledLeans().filter((l) => l.date === date);
}
