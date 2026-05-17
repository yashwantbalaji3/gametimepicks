import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "public", "data", "nhl");

export interface NhlScheduleGame {
  gameId: number | null;
  gameDate: string | null;
  gameState: string | null;
  gameType: number | null;
  awayTeamAbbr: string | null;
  homeTeamAbbr: string | null;
  awayTeamName: string | null;
  homeTeamName: string | null;
  venue: string | null;
}

export interface NhlSchedulePayload {
  sport: "NHL";
  date: string;
  scheduleSource: string;
  generatedAt: string;
  games: NhlScheduleGame[];
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch (err) {
    console.warn(`[data-nhl] could not read ${filePath}:`, err);
    return fallback;
  }
}

export function getNhlScheduleForDate(date: string): NhlSchedulePayload {
  return readJsonSafe<NhlSchedulePayload>(
    path.join(DATA_DIR, "schedule", `${date}.json`),
    {
      sport: "NHL",
      date,
      scheduleSource: "unavailable",
      generatedAt: new Date().toISOString(),
      games: [],
    },
  );
}

export function getAvailableNhlScheduleDates(): string[] {
  try {
    const dir = path.join(DATA_DIR, "schedule");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Pick the earliest schedule date >= today (ET-ish via local TZ), or
 * fall back to the most recent file on disk. Mirrors `activeMlbDate`.
 */
export function activeNhlDate(): string | null {
  const dates = getAvailableNhlScheduleDates();
  if (dates.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const future = dates.find((d) => d >= today);
  return future ?? dates[dates.length - 1];
}
