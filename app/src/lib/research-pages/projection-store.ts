/**
 * RESEARCH PROJECTION READER (v1.3) — SERVER / BUILD TIME ONLY.
 *
 * Pages read the committed research projection (data/research-projection/v1), never the Data Platform store.
 * Each sport partition is parsed once per build worker and cached. A projection whose schemaVersion this reader
 * does not know is refused (throws) — never interpreted.
 *
 * Nothing here is sent to the browser wholesale: a page passes one entity's record plus the few labels and hrefs
 * that record references.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { RESEARCH_PROJECTION_DIR, assertProjectionVersion, researchPath } from "./contract.mjs";

export type ResearchSport = "MLB" | "NFL" | "EPL" | "UFC";
export const SPORT_SEGMENTS: Record<string, ResearchSport> = { mlb: "MLB", nfl: "NFL", epl: "EPL", ufc: "UFC" };

export interface IndexEntry {
  kind: "team" | "player";
  sport: ResearchSport;
  id: string;
  slug: string;
  label: string;
  hint: string | null;
  indexable: boolean;
  status: string;
  path: string;
}

export interface Coverage {
  status: string;
  available: string[];
  unavailable: string[];
  notes: string[];
  from: string | null;
  to: string | null;
}

/** [gameId, date, seasonId, ha, opponentTeamId, status, own, opp, result] */
export type TeamRow = [string, string | null, string, "H" | "A" | "N", string | null, "F" | "S", number | null, number | null, "W" | "L" | "T" | null];

export interface TeamSeason {
  id: string;
  label: string;
  games: number;
  record: { w: number; l: number; t: number; finals: number; scored: number; allowed: number } | null;
  firstDate: string | null;
  lastDate: string | null;
}

export interface TeamProjection {
  schemaVersion: 1;
  entityType: "team";
  id: string;
  slug: string;
  sport: ResearchSport;
  name: string;
  abbreviation: string | null;
  league: string;
  supportsResults: boolean;
  seasons: TeamSeason[];
  defaultSeason: string | null;
  currentSeason: string | null;
  recentForm: { n: number; w: number; l: number; t: number; gameIds: string[] } | null;
  resultsThrough: string | null;
  games: TeamRow[];
  indexable: boolean;
  eligibility: string;
  coverage: Coverage;
}

/** [gameId, date, seasonId, teamId, opponentId, ha, result, teamScore, oppScore, familyCode, detail, ...values] */
export type PlayerRow = Array<string | number | null>;

export interface PlayerProjection {
  schemaVersion: 1;
  entityType: "player";
  id: string;
  slug: string;
  sport: ResearchSport;
  name: string;
  currentTeamId: string | null;
  columns: Array<{ key: string; label: string; short: string; unit: string }>;
  groups: Array<{ key: string; label: string; columns: string[] }>;
  seasons: Array<{ id: string; label: string; games: number; teams: string[]; totals: Record<string, { n: number; sum: number }>; record?: { w: number; l: number; n: number } }>;
  defaultSeason: string | null;
  firstDate: string | null;
  lastDate: string | null;
  record: { w: number; l: number; n: number } | null;
  windows: Record<string, Array<{ size: number; n: number; values: number[]; sum: number; avg: number | null }>>;
  gameLog: PlayerRow[];
  upcoming?: Array<{ gameId: string; startUtc: string; opponentId: string | null; cardId: string | null }>;
  opponents?: Record<string, string | null>;
  cards?: Record<string, string | null>;
  indexable: boolean;
  eligibility: string;
  coverage: Coverage;
}

const ROOT = () => path.join(process.cwd(), "..", RESEARCH_PROJECTION_DIR);

const readText = (rel: string): string => {
  const abs = path.join(ROOT(), rel);
  const buf = fs.readFileSync(abs);
  return (abs.endsWith(".gz") ? zlib.gunzipSync(buf) : buf).toString("utf8");
};

let indexCache: IndexEntry[] | null = null;
export function researchIndex(): IndexEntry[] {
  if (!indexCache) {
    const doc = assertProjectionVersion(JSON.parse(readText("index.json")), "research index") as { entries: IndexEntry[] };
    indexCache = doc.entries;
  }
  return indexCache;
}

const lines = new Map<string, Map<string, unknown>>();
function partition<T extends { slug: string }>(rel: string): Map<string, T> {
  if (!lines.has(rel)) {
    const m = new Map<string, T>();
    for (const line of readText(rel).split("\n")) {
      if (!line) continue;
      const rec = assertProjectionVersion(JSON.parse(line), rel) as T;
      m.set(rec.slug, rec);
    }
    lines.set(rel, m as Map<string, unknown>);
  }
  return lines.get(rel) as Map<string, T>;
}

export function teamBySlug(sport: ResearchSport, slug: string): TeamProjection | null {
  return partition<TeamProjection>(`teams/${sport}.jsonl.gz`).get(slug) ?? null;
}

export function playerBySlug(sport: ResearchSport, slug: string): PlayerProjection | null {
  return partition<PlayerProjection>(`players/${sport}.jsonl.gz`).get(slug) ?? null;
}

/** A team projection by canonical id (for a player page's "current team" context). Exact id only. */
export function teamById(id: string): TeamProjection | null {
  const e = researchIndex().find((x) => x.kind === "team" && x.id === id);
  return e ? teamBySlug(e.sport, e.slug) : null;
}

const labelCache = new Map<string, Record<string, { name: string; abbreviation: string | null }>>();
export function teamLabels(sport: ResearchSport): Record<string, { name: string; abbreviation: string | null }> {
  if (!labelCache.has(sport)) {
    const doc = assertProjectionVersion(JSON.parse(readText(`labels/${sport}.json`)), `labels/${sport}`) as { teams: Record<string, { name: string; abbreviation: string | null }> };
    labelCache.set(sport, doc.teams);
  }
  return labelCache.get(sport)!;
}

let hrefCache: Map<string, string> | null = null;
/** canonical id → research path, for entities that HAVE a page. Absent ⇒ render the label as plain text. */
export function researchHrefById(): Map<string, string> {
  if (!hrefCache) hrefCache = new Map(researchIndex().map((e) => [e.id, researchPath(e.kind, e.sport, e.slug)]));
  return hrefCache;
}

export function researchHref(id: string | null | undefined): string | null {
  return id ? researchHrefById().get(id) ?? null : null;
}

/** Pick the hrefs a set of ids needs — the only href data a client component receives. */
export function hrefsFor(ids: Iterable<string | null | undefined>): Record<string, string> {
  const all = researchHrefById();
  const out: Record<string, string> = {};
  for (const id of ids) if (id && all.has(id)) out[id] = all.get(id)!;
  return out;
}

export function staticParams(kind: "team" | "player"): Array<{ sport: string; slug: string }> {
  return researchIndex().filter((e) => e.kind === kind).map((e) => ({ sport: e.sport.toLowerCase(), slug: e.slug }));
}

let teamsByGame: Map<string, Array<{ id: string; ha: string; name: string; path: string }>> | null = null;
/**
 * The research-page teams that played a game, by exact canonical game id (e.g. a shipped EPL fixture id). Used by a
 * game page to link its clubs without resolving any club by name.
 */
export function researchTeamsForGame(sport: ResearchSport, gameId: string): Array<{ id: string; ha: string; name: string; path: string }> {
  if (!teamsByGame) {
    teamsByGame = new Map();
    for (const e of researchIndex().filter((x) => x.kind === "team")) {
      const t = teamBySlug(e.sport, e.slug);
      if (!t) continue;
      for (const g of t.games) {
        const k = `${e.sport}|${g[0]}`;
        const list = teamsByGame.get(k) ?? [];
        list.push({ id: t.id, ha: g[3], name: t.name, path: e.path });
        teamsByGame.set(k, list);
      }
    }
  }
  return teamsByGame.get(`${sport}|${gameId}`) ?? [];
}
