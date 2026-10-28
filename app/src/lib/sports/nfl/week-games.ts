/**
 * THE GAMES OF ONE NFL WEEK — what /nfl/week/[key] lists, for a current week AND for a week that has rolled over.
 *
 * ⚠ THE WEEK PAGE LISTED ONLY THE LIVE UNION (2026-10-28, /nfl/week/2-07/ showed DAL @ PHI alone). `forecasts/latest.json`
 * and `frozen-latest.json` carry the CURRENT week: once a week rolls, its games leave the union — the Monday night game
 * lingered one run longer than the rest — so a played week's page lost every game but the last, then all of them,
 * while each game's own page stayed up through the archive (archived-forecast.ts, P320).
 *
 * One rule now, the same one the game page follows: a game in the live union is read from the union; every game the
 * graded record (reconciliation/<week>.json) names for this week and the union no longer carries is read from its
 * FROZEN pre-kickoff revision (archivedForecastFor — the named revision, byte for byte, or nothing). A reconciled game
 * whose revision is on no committed file is returned in `unavailable`, so the page names it instead of silently
 * dropping it; nothing is ever approximated from another revision. No number is computed here.
 */
import fs from "node:fs";
import path from "node:path";

import { unionFrozenForecasts } from "./public-forecast-union.mjs";
import { nflPublicRecordResolver } from "./public-record.mjs";
import { archivedForecastFor, reconciledGames, type ReconciledGame } from "./archived-forecast";

export interface WeekGame {
  providerEventId: string;
  matchup: string;
  kickoffUtc: string;
  home: { abbr: string; name: string };
  away: { abbr: string; name: string };
  forecastSummary: {
    projectedScore: { home: number; away: number };
    winProbability: { home: number; away: number };
    total: { median: number; p10: number; p90: number };
  };
  /** Where the row was read from: the live union, or the frozen revision the graded record names. */
  source: "live" | "archive";
}

const readJson = (root: string, rel: string) => {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8")); } catch { return null; }
};

/**
 * @param root the public data directory (app/public/data)
 * @param key  `${seasonType}-${paddedWeek}`, the week route's key
 */
export function weekGames(
  root: string,
  key: string,
  opts: { receiptsRoot?: string } = {},
): { games: WeekGame[]; unavailable: ReconciledGame[] } {
  const [seasonType, week] = key.split("-").map(Number);
  const union = unionFrozenForecasts(readJson(root, "nfl/forecasts/latest.json"), readJson(root, "nfl/forecasts/frozen-latest.json"), { resolve: nflPublicRecordResolver() }) as { forecasts?: Array<WeekGame & { seasonType: number; week: number }> } | null;
  const live = (union?.forecasts ?? [])
    .filter((f) => f.seasonType === seasonType && f.week === week)
    .map((f) => ({ ...f, source: "live" as const }));
  const seen = new Set(live.map((f) => String(f.providerEventId)));
  const archived: WeekGame[] = [];
  const unavailable: ReconciledGame[] = [];
  for (const { game, weekKey } of reconciledGames(root)) {
    if (weekKey !== key || seen.has(String(game.providerEventId))) continue;
    seen.add(String(game.providerEventId));
    const a = archivedForecastFor(root, game.providerEventId, opts.receiptsRoot ? { receiptsRoot: opts.receiptsRoot } : {});
    if (a) archived.push({ ...(a.forecast as unknown as WeekGame), source: "archive" });
    else unavailable.push(game);
  }
  const games = [...live, ...archived].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc) || a.providerEventId.localeCompare(b.providerEventId));
  return { games, unavailable };
}
