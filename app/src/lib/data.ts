/**
 * Data loaders. These read the pre-generated JSON files in app/public/data/.
 * Because Next.js is in `output: "export"` mode, all data must be available
 * at build time. The pipeline writes these files; the frontend reads them.
 *
 * In a server component, we use `fs` to read the JSON directly so we get
 * type-safe imports rather than fetch calls during static export.
 */
import fs from "node:fs";
import path from "node:path";

import type {
  BoardData,
  TrendsData,
  HitRatesData,
  MetaData,
  ScheduleData,
  SlateData,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "public", "data");

function readJson<T>(filename: string, fallback: T): T {
  try {
    const filePath = path.join(DATA_DIR, filename);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[data] could not load ${filename}, using fallback. Error:`, err);
    return fallback;
  }
}

export function getBoard(): BoardData {
  return readJson<BoardData>("board.json", {
    generatedFor: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    dataSources: ["demo"],
    isDemo: true,
    leans: [],
  });
}

export function getBoardForDate(date: string): BoardData {
  return readJson<BoardData>(`boards/${date}.json`, {
    generatedFor: date,
    generatedAt: new Date().toISOString(),
    dataSources: [],
    isDemo: true,
    leans: [],
    scheduleAvailable: false,
    propsAvailable: false,
    scheduleSource: "unavailable",
    oddsSource: null,
    games: [],
  });
}

export function getSlate(): SlateData {
  return readJson<SlateData>("slate.json", {
    generatedAt: new Date().toISOString(),
    primaryDate: new Date().toISOString().slice(0, 10),
    slateDays: 1,
    days: [],
    newsSignalsActive: 0,
    newsSignalsConfigured: false,
  });
}

export function getTrends(): TrendsData {
  return readJson<TrendsData>("trends.json", {
    generatedAt: new Date().toISOString(),
    isDemo: true,
    players: [],
  });
}

export function getHitRates(): HitRatesData {
  return readJson<HitRatesData>("hit_rates.json", {
    generatedAt: new Date().toISOString(),
    isDemo: true,
    dateRange: "no data",
    overall: {
      label: "All Tracked Leans",
      total: 0,
      won: 0,
      lost: 0,
      push: 0,
      hitRate: 0,
    },
    byMarket: [],
    byConfidence: [],
    recentSettled: [],
  });
}

export function getMeta(): MetaData {
  return readJson<MetaData>("meta.json", {
    appName: "GametimePicks",
    version: "0.1.0",
    lastPipelineRun: new Date().toISOString(),
    isDemo: true,
    dataSources: [],
  });
}

export function getSchedule(): ScheduleData {
  return readJson<ScheduleData>("schedule.json", {
    generatedAt: new Date().toISOString(),
    source: "demo",
    isDemo: true,
    date: new Date().toISOString().slice(0, 10),
    games: [],
  });
}

/**
 * Phase 7B-4 — list every per-day board file present on disk.
 *
 * Used as a defense-in-depth fallback when slate.json is stale (e.g. the
 * pipeline was last run with --days 1). The /board page can union
 * slate.days with this list so the UI surfaces every date that actually
 * has data, even if slate.json hasn't been rebuilt yet.
 *
 * No network calls. Reads directory listing only.
 */
export function getAvailableBoardDates(): string[] {
  try {
    const boardsDir = path.join(DATA_DIR, "boards");
    if (!fs.existsSync(boardsDir)) return [];
    return fs.readdirSync(boardsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
  } catch (err) {
    console.warn("[data] could not list boards/:", err);
    return [];
  }
}
