import fs from "node:fs";
import path from "node:path";

import type {
  MlbBoardData,
  MlbScheduleData,
  MlbPowerData,
} from "./types-mlb";
import { currentEtDate } from "./freshness";

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
 * The earliest on-disk date >= today (anchored to America/New_York via
 * `currentEtDate`) so a pre-generated future schedule does not surface
 * as "today's slate", and so the helper does NOT tick forward at
 * midnight UTC (~8pm ET in summer) while ET is still the same day —
 * that off-by-one was masking the live MLB slate from the homepage
 * cross-sport count after sunset.
 *
 * Falls back to the most recent on-disk date if no current/future file
 * exists. Used by /mlb, /mlb/board, /mlb/power, and the homepage sports
 * rail — every "MLB · today" surface flows through this.
 */
export function activeMlbDate(): string | null {
  const dates = getMlbAvailableBoardDates();
  if (dates.length === 0) return null;
  const today = currentEtDate();
  const current = dates.find((d) => d >= today);
  return current ?? dates[dates.length - 1];
}

/**
 * Enumerate every MLB schedule file on disk. Used by the upcoming-slate
 * strip on /mlb to show the full next-week window even when only the
 * latest date has a board file with leans.
 *
 * The UNION of both schedule owners, deliberately. `schedule/` is written by the paid day-of
 * ingestion, so it never reaches past tomorrow; `statsapi-schedule/` is the free StatsAPI
 * population capture (P226's matrix denominator), which nightly-settle now commits a week ahead.
 * Listing only the paid dir meant every future day the repo genuinely knew about was invisible:
 * /simulate/d/2026-09-07 404'd while its population sat committed, and the day pages told readers
 * "No MLB games on this date" against a 15-game slate (P240 audit, 80 of 91 window games).
 */
export function getMlbAvailableScheduleDates(): string[] {
  const dates = new Set<string>();
  for (const sub of ["schedule", "statsapi-schedule"]) {
    try {
      const dir = path.join(DATA_DIR, sub);
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        if (f.endsWith(".json")) dates.add(f.replace(/\.json$/, ""));
      }
    } catch (err) {
      console.warn(`[data-mlb] could not list ${sub}/:`, err);
    }
  }
  return [...dates].sort();
}

/** One row of the free StatsAPI population capture (schedule only — no odds, no model claim). */
export interface MlbStatsapiScheduleGame {
  gamePk: number;
  gameDate: string | null;
  status: string | null;
  doubleHeader?: string;
  gameNumber?: number;
  away: { id: number | null; name: string | null };
  home: { id: number | null; name: string | null };
  venue: string | null;
}

/**
 * The day's true event population from the free StatsAPI capture, or null when that day was never
 * captured. Distinct from the board on purpose: this proves a game is SCHEDULED and nothing more,
 * so its consumers may only render schedule-only states from it.
 */
export function getMlbStatsapiScheduleForDate(date: string): {
  date: string;
  capturedAt: string | null;
  games: MlbStatsapiScheduleGame[];
} | null {
  const raw = readMlbJson<{ date?: string; capturedAt?: string; games?: MlbStatsapiScheduleGame[] } | null>(
    path.join("statsapi-schedule", `${date}.json`),
    null,
  );
  if (!raw || !Array.isArray(raw.games)) return null;
  return { date: raw.date ?? date, capturedAt: raw.capturedAt ?? null, games: raw.games };
}
