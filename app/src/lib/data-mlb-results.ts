import fs from "node:fs";
import path from "node:path";

import type {
  MlbAvailableDates,
  MlbComparisonReport,
  MlbLifetimeSummary,
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
