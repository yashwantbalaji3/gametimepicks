/**
 * NBA FORECAST GUARD · PAGE-SIDE READ (node only). Reads the committed guard document beside a lane. Pages call
 * guardLane(); nothing here recomputes a verdict or reads a box score at page build (the builder,
 * forecast-guard-build.mjs, is the only reader of the internal box scores).
 */
import fs from "node:fs";
import path from "node:path";
import { applyForecastGuard, FORECAST_GUARD, guardApplies } from "./forecast-guard-accessor.mjs";

/** public/data/nba/forecast-guard/<date>.json under an app directory. */
export const guardFile = (appDir, date) => path.join(appDir, "public", "data", FORECAST_GUARD.dir, `${date}.json`);

/** The committed guard document for a slate, or null. Read only when the guard applies to that date. */
export function readGuardDoc(appDir, date) {
  if (!guardApplies(date)) return null;
  try { return JSON.parse(fs.readFileSync(guardFile(appDir, date), "utf8")); } catch { return null; }
}

/** THE READ every NBA surface makes: the lane through the guard (the same object before the cut-over). */
export function guardLane(appDir, lane) {
  return lane ? applyForecastGuard(lane, readGuardDoc(appDir, lane.date)) : lane;
}
