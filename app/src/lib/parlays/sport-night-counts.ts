/**
 * Tonight's game counts for the Parlay Center's per-sport status (sport-night-status.ts). Server-only (fs), build time.
 *   NBA  app/public/data/nba/experimental-public/<date>.json   games on the official lane for that ET day
 *   NFL  app/public/data/nfl/forecasts/latest.json             forecasts whose kickoff falls on that ET day
 * A missing or unreadable file counts as no slate (the copy then says so for that sport only).
 */
import fs from "node:fs";
import path from "node:path";

const readJson = (f: string): unknown => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const etDate = (iso: unknown): string | null => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)) : null;
};

export function nbaGamesOn(dataRoot: string, date: string): number {
  const lane = readJson(path.join(dataRoot, "nba", "experimental-public", `${date}.json`)) as { date?: string; games?: unknown[] } | null;
  return lane?.date === date && Array.isArray(lane.games) ? lane.games.length : 0;
}

export function nflGamesOn(dataRoot: string, date: string): number {
  const doc = readJson(path.join(dataRoot, "nfl", "forecasts", "latest.json")) as { forecasts?: { kickoffUtc?: string }[] } | null;
  return (doc?.forecasts ?? []).filter((f) => etDate(f?.kickoffUtc) === date).length;
}
