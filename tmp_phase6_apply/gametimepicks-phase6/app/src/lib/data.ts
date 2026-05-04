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
