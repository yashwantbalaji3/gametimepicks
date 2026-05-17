import fs from "node:fs";
import path from "node:path";

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

/**
 * Stream the public settled-leans jsonl into memory. The whole file is
 * the audit for ALL settled dates — typical day has a few hundred rows.
 * Returns [] when the file doesn't exist yet.
 */
export function getMlbSettledLeans(): MlbSettledLean[] {
  const p = path.join(RESULTS_DIR, "settled_leans.jsonl");
  if (!fs.existsSync(p)) return [];
  const out: MlbSettledLean[] = [];
  try {
    const text = fs.readFileSync(p, "utf-8");
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        out.push(JSON.parse(t) as MlbSettledLean);
      } catch {
        // Skip malformed lines silently — never break the page on one bad row
      }
    }
  } catch (err) {
    console.warn("[data-mlb-results] could not read settled_leans.jsonl:", err);
  }
  return out;
}

export function getMlbSettledLeansForDate(date: string): MlbSettledLean[] {
  return getMlbSettledLeans().filter((l) => l.date === date);
}
