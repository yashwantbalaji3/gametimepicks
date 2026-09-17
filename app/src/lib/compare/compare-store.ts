/**
 * COMPARE PROJECTION READER (v1.4) — SERVER / BUILD TIME ONLY.
 *
 * Reads the committed compare projection (data/compare-projection/v1). Matchup pages and discovery CTAs use it at
 * build time; the browser never imports this module (it fetches the emitted public assets instead). A projection
 * whose schemaVersion this reader does not know is refused.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { COMPARE_PROJECTION_DIR, assertCompareVersion } from "./contract.mjs";

type Sport = "MLB" | "NFL" | "EPL" | "UFC";

export interface CompareTeamEntity {
  schemaVersion: 1; artifact: "compare-team"; sport: Sport; id: string; slug: string; name: string; abbreviation: string | null; path: string;
  supportsResults: boolean; resultsThrough: string | null; coverage: { status: string; notes: string[]; from: string | null; to: string | null };
  rows: Array<[string, string | null, string, "H" | "A" | "N", string | null, "F" | "S", number | null, number | null, "W" | "L" | "T" | null]>;
}

export interface MatchupEntry {
  schemaVersion: 1; gameId: string; sport: Sport; seasonId: string; startUtc: string; homeTeamId: string; awayTeamId: string;
  neutralSite: boolean; final: { home: number; away: number } | null; priorMeetings: number; indexable: boolean; path: string;
}

const ROOT = () => path.join(process.cwd(), "..", COMPARE_PROJECTION_DIR);
const text = (rel: string) => {
  const abs = path.join(ROOT(), rel);
  const buf = fs.readFileSync(abs);
  return (abs.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
};
const jsonl = <T>(rel: string): T[] => (fs.existsSync(path.join(ROOT(), rel)) ? text(rel).split("\n").filter(Boolean).map((l) => assertCompareVersion(JSON.parse(l), rel) as T) : []);

const teamCache = new Map<string, Map<string, CompareTeamEntity>>();
export function compareTeams(sport: Sport): Map<string, CompareTeamEntity> {
  if (!teamCache.has(sport)) teamCache.set(sport, new Map(jsonl<CompareTeamEntity>(`teams/${sport}.jsonl.gz`).map((t) => [t.id, t])));
  return teamCache.get(sport)!;
}

const matchupCache = new Map<string, MatchupEntry[]>();
export function matchupEntries(sport: Sport): MatchupEntry[] {
  if (!matchupCache.has(sport)) matchupCache.set(sport, jsonl<MatchupEntry>(`matchups/${sport}.jsonl.gz`));
  return matchupCache.get(sport)!;
}

export function matchupEntry(sport: Sport, gameId: string): MatchupEntry | null {
  return matchupEntries(sport).find((e) => e.gameId === gameId) ?? null;
}

/** The Matchup Explorer path for an exact canonical game id, or null (no dead CTA). */
export function matchupHref(sport: Sport, gameId: string | number | null | undefined): string | null {
  if (gameId == null || gameId === "") return null;
  return matchupEntry(sport, String(gameId))?.path ?? null;
}

let readinessCache: any = null;
export function compareReadiness(): any {
  readinessCache ??= assertCompareVersion(JSON.parse(text("readiness.json")), "compare readiness");
  return readinessCache;
}

const playerIndexCache = new Map<string, { families: string[]; entries: Array<[string, string, string, string | null, number[]]> }>();
function playerIndex(sport: Sport) {
  if (!playerIndexCache.has(sport)) {
    const rel = `indexes/players-${sport.toLowerCase()}.json`;
    playerIndexCache.set(sport, fs.existsSync(path.join(ROOT(), rel)) ? assertCompareVersion(JSON.parse(text(rel)), rel) : { families: [], entries: [] });
  }
  return playerIndexCache.get(sport)!;
}

/**
 * Should a player research page offer "Compare player"? Only when the player is in the compare index AND at least one
 * of their families is carried by another published player (a comparable peer exists).
 */
const familyCountCache = new Map<string, Map<number, number>>();
export function playerHasComparablePeer(sport: Sport, playerId: string): boolean {
  const idx = playerIndex(sport);
  const me = idx.entries.find((e) => e[1] === playerId);
  if (!me) return false;
  if (!familyCountCache.has(sport)) {
    const counts = new Map<number, number>();
    for (const e of idx.entries) for (const f of e[4]) counts.set(f, (counts.get(f) ?? 0) + 1);
    familyCountCache.set(sport, counts);
  }
  const counts = familyCountCache.get(sport)!;
  return me[4].some((f) => (counts.get(f) ?? 0) >= 2);
}

export function teamInCompare(sport: Sport, teamId: string): boolean {
  return compareTeams(sport).has(teamId);
}
