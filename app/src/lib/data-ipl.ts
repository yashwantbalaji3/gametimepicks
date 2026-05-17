import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "public", "data", "ipl");

export interface IplScheduleGame {
  matchId: string | number | null;
  gameDate: string | null;
  shortName: string | null;
  status: string | null;
  homeTeamAbbr: string | null;
  homeTeamName: string | null;
  awayTeamAbbr: string | null;
  awayTeamName: string | null;
  venue: string | null;
}

export interface IplSchedulePayload {
  sport: "IPL";
  date: string;
  scheduleSource: string;
  generatedAt: string;
  games: IplScheduleGame[];
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch (err) {
    console.warn(`[data-ipl] could not read ${filePath}:`, err);
    return fallback;
  }
}

export function getIplScheduleForDate(date: string): IplSchedulePayload {
  return readJsonSafe<IplSchedulePayload>(
    path.join(DATA_DIR, "schedule", `${date}.json`),
    {
      sport: "IPL",
      date,
      scheduleSource: "unavailable",
      generatedAt: new Date().toISOString(),
      games: [],
    },
  );
}

export function getAvailableIplScheduleDates(): string[] {
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

export function activeIplDate(): string | null {
  const dates = getAvailableIplScheduleDates();
  if (dates.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const future = dates.find((d) => d >= today);
  return future ?? dates[dates.length - 1];
}
