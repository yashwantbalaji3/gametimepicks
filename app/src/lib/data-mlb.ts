import fs from "node:fs";
import path from "node:path";

import type {
  MlbBoardData,
  MlbScheduleData,
  MlbPowerData,
} from "./types-mlb";

const DATA_DIR = path.join(process.cwd(), "public", "data", "mlb");

function readMlbJson<T>(rel: string, fallback: T): T {
  try {
    const p = path.join(DATA_DIR, rel);
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch (err) {
    console.warn(`[data-mlb] could not load ${rel}:`, err);
    return fallback;
  }
}

function emptyBoard(date: string): MlbBoardData {
  return {
    sport: "MLB",
    date,
    generatedAt: new Date().toISOString(),
    generatedFor: date,
    isDemo: false,
    scheduleAvailable: false,
    propsAvailable: false,
    scheduleSource: "unavailable",
    oddsSource: null,
    dataSources: [],
    games: [],
    leans: [],
    summary: {
      scheduledGames: 0,
      eventsWithOdds: 0,
      leans: 0,
      highConfidence: 0,
      mediumConfidence: 0,
      lowConfidence: 0,
      insufficientData: 0,
      anomalies: 0,
      byMarket: {},
    },
    credits: { before: null, after: null, spent: 0, estimated: null },
  };
}

export function getMlbBoardForDate(date: string): MlbBoardData {
  return readMlbJson<MlbBoardData>(`boards/${date}.json`, emptyBoard(date));
}

export function getMlbScheduleForDate(date: string): MlbScheduleData {
  return readMlbJson<MlbScheduleData>(`schedule/${date}.json`, {
    sport: "MLB",
    date,
    generatedAt: new Date().toISOString(),
    source: "unavailable",
    games: [],
  });
}

export function getMlbPowerForDate(date: string): MlbPowerData {
  return readMlbJson<MlbPowerData>(`power/${date}.json`, {
    sport: "MLB",
    scope: "home_runs",
    date,
    generatedAt: new Date().toISOString(),
    state: "pending",
    reason:
      "Power Board data inputs are not yet wired. The schedule below shows the slate the Power Board will analyze when they go live.",
    inputsPlanned: [
      "season slugging + hard-hit + barrel rate",
      "pitcher HR-allowed rate + handedness splits",
      "park factor + weather",
      "lineup position",
    ],
    games: [],
  });
}

export function getMlbAvailableBoardDates(): string[] {
  try {
    const dir = path.join(DATA_DIR, "boards");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch (err) {
    console.warn("[data-mlb] could not list boards/:", err);
    return [];
  }
}

/**
 * Pick the active MLB date for default landings.
 *
 * The earliest on-disk date >= today (ET-ish via local TZ) so a Saturday
 * pre-generated schedule does not surface as "today's slate" on Monday.
 * Falls back to the most recent on-disk date if no current/future file
 * exists. Used by /mlb, /mlb/board, /mlb/power, and the homepage sports
 * rail — every "MLB · today" surface flows through this. Mirrors the
 * activeNhlDate / activeIplDate helpers.
 */
export function activeMlbDate(): string | null {
  const dates = getMlbAvailableBoardDates();
  if (dates.length === 0) return null;
  const today = new Date().toISOString().slice(0, 10);
  const current = dates.find((d) => d >= today);
  return current ?? dates[dates.length - 1];
}

/**
 * Enumerate every MLB schedule file on disk. Used by the upcoming-slate
 * strip on /mlb to show the full next-week window even when only the
 * latest date has a board file with leans.
 */
export function getMlbAvailableScheduleDates(): string[] {
  try {
    const dir = path.join(DATA_DIR, "schedule");
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch (err) {
    console.warn("[data-mlb] could not list schedule/:", err);
    return [];
  }
}
