/**
 * Source loaders for the methodology extractors — the IO companion to the PURE adapter.ts.
 * This module reads board/projection JSON from public/data and normalizes each sport's source into
 * the shape `extractPredictionsBySport` expects. It is imported ONLY by scripts (dry-run + launch),
 * never by the app bundle, so the adapter stays pure/client-safe.
 *
 * Read-only: it never writes. Missing files yield `undefined` (→ honest source_missing / no_candidates).
 */
import fs from "node:fs";
import path from "node:path";
import type { Sport } from "./types";
import {
  extractPredictionsBySport,
  type SportExtractionResult,
  type MethodologyOptions,
  DEFAULT_OPTIONS,
} from "./adapter";

export const ALL_SPORTS: Sport[] = ["MLB", "NBA", "UFC", "WORLD_CUP"];

export const SPORT_ALIASES: Record<string, Sport> = {
  mlb: "MLB", nba: "NBA", ufc: "UFC",
  "world-cup": "WORLD_CUP", worldcup: "WORLD_CUP", wc: "WORLD_CUP", world_cup: "WORLD_CUP",
};

function readJson(p: string): any | undefined {
  try {
    if (!fs.existsSync(p)) return undefined;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return undefined;
  }
}

export interface LoadedSource {
  sport: Sport;
  sourcePath: string | null;
  mlb?: any;
  nba?: any;
  ufc?: any;
  worldCupTeam?: any;
  worldCupPlayer?: any;
}

/** Load + normalize one sport's source for a date. dataRoot = <app>/public/data. */
export function loadSourceForSport(sport: Sport, date: string, dataRoot: string): LoadedSource {
  switch (sport) {
    case "MLB": {
      const p = path.join(dataRoot, "mlb", "boards", `${date}.json`);
      const mlb = readJson(p);
      return { sport, sourcePath: mlb ? p : null, mlb };
    }
    case "NBA": {
      const p = path.join(dataRoot, "boards", `${date}.json`);
      const nba = readJson(p);
      // NBA boards can be present-but-empty (season over) → still report wired_no_candidates.
      const hasLeans = Array.isArray(nba?.leans) && nba.leans.length > 0;
      return { sport, sourcePath: nba ? p : null, nba: hasLeans ? nba : (nba ?? undefined) };
    }
    case "UFC": {
      // UFC publishes "latest" artifacts for the most recent event (no per-date board). Only treat
      // it as today's source when the event date matches the requested date — otherwise a past
      // event would leak into every date.
      const projPath = path.join(dataRoot, "ufc", "projections-latest.json");
      const projRaw = readJson(projPath);
      const eventDay = String(projRaw?.eventDate ?? "").slice(0, 10);
      if (!projRaw || eventDay !== date) return { sport, sourcePath: null, ufc: undefined };
      const proj = projRaw;
      const odds = readJson(path.join(dataRoot, "ufc", "odds-latest.json"));
      if (proj && Array.isArray(odds?.bouts)) {
        // Attach per-bout commence time (fighter-name match) so leakage/start gates are honest.
        const byFighter = new Map<string, string>();
        for (const b of odds.bouts) {
          for (const f of b?.fighters ?? []) {
            if (typeof f === "string" && b?.commenceTime) byFighter.set(f.toLowerCase(), b.commenceTime);
          }
        }
        if (Array.isArray(proj.projections)) {
          proj.projections = proj.projections.map((r: any) => ({
            ...r,
            commenceTime: r.commenceTime ?? byFighter.get(String(r.fighter ?? "").toLowerCase()) ?? null,
          }));
        }
      }
      return { sport, sourcePath: proj ? projPath : null, ufc: proj };
    }
    case "WORLD_CUP": {
      const teamPath = path.join(dataRoot, "world-cup", "projections", `${date}.json`);
      const playerPath = path.join(dataRoot, "world-cup", "player-projections", `${date}.json`);
      const teamRaw = readJson(teamPath);
      const playerRaw = readJson(playerPath);
      const teamRecs = teamRaw ? normalizeWcRecords(teamRaw) : [];
      const teamSource = teamRaw ? { ...teamRaw, public: teamRecs } : undefined;
      // Player files key matches by hash/fixture while team records use numeric ids, so a bare
      // matchId join fails. Build a STABLE join across matchId, normalized team name, and the
      // "Home vs Away" fixture string, so player props inherit a real kickoff (event_start_time) and
      // country code — making them leakage-validatable instead of dropped for missing timing.
      const wcKickoff = buildWcKickoffIndex(teamRecs);
      const playerRecs = playerRaw
        ? normalizeWcRecords(playerRaw).map((r: any) => {
            const joined = resolveWcPlayerKickoff(r, wcKickoff);
            return { ...r, kickoffUtc: r.kickoffUtc ?? joined.kickoffUtc, homeCode: r.homeCode ?? joined.code };
          })
        : [];
      const playerSource = playerRaw ? { ...playerRaw, public: playerRecs } : undefined;
      return {
        sport,
        sourcePath: teamSource ? teamPath : (playerSource ? playerPath : null),
        worldCupTeam: teamSource,
        worldCupPlayer: playerSource,
      };
    }
    default:
      return { sport, sourcePath: null };
  }
}

const normTeam = (s: unknown): string => String(s ?? "").toLowerCase().replace(/[^a-z]/g, "");

export interface WcKickoffIndex {
  byMatchId: Map<string, { kickoffUtc: string; code: string | null }>;
  byTeam: Map<string, { kickoffUtc: string; code: string | null }>;
  byFixture: Map<string, { kickoffUtc: string; code: string | null }>;
}

/** Build a multi-key kickoff index from team projection records (matchId / team name / fixture). */
export function buildWcKickoffIndex(teamRecs: any[]): WcKickoffIndex {
  const byMatchId = new Map<string, { kickoffUtc: string; code: string | null }>();
  const byTeam = new Map<string, { kickoffUtc: string; code: string | null }>();
  const byFixture = new Map<string, { kickoffUtc: string; code: string | null }>();
  for (const r of teamRecs) {
    const k = r?.kickoffUtc;
    if (!k) continue;
    if (r.matchId != null) byMatchId.set(String(r.matchId), { kickoffUtc: k, code: r.homeCode ?? null });
    if (r.homeTeam) byTeam.set(normTeam(r.homeTeam), { kickoffUtc: k, code: r.homeCode ?? null });
    if (r.awayTeam) byTeam.set(normTeam(r.awayTeam), { kickoffUtc: k, code: r.awayCode ?? null });
    if (r.homeTeam && r.awayTeam) byFixture.set(`${normTeam(r.homeTeam)}|${normTeam(r.awayTeam)}`, { kickoffUtc: k, code: r.homeCode ?? null });
  }
  return { byMatchId, byTeam, byFixture };
}

/** Resolve a player record's kickoff + code from the index (matchId → team → fixture). */
export function resolveWcPlayerKickoff(rec: any, idx: WcKickoffIndex): { kickoffUtc: string | null; code: string | null } {
  if (rec.matchId != null && idx.byMatchId.has(String(rec.matchId))) return idx.byMatchId.get(String(rec.matchId))!;
  const team = normTeam(rec.player?.team ?? rec.team);
  if (team && idx.byTeam.has(team)) return idx.byTeam.get(team)!;
  const fx = String(rec.fixture ?? "").toLowerCase();
  const m = fx.match(/(.+?)\s+(?:vs|v|–|-)\s+(.+)/);
  if (m) {
    const key = `${normTeam(m[1])}|${normTeam(m[2])}`;
    if (idx.byFixture.has(key)) return idx.byFixture.get(key)!;
    const rev = `${normTeam(m[2])}|${normTeam(m[1])}`;
    if (idx.byFixture.has(rev)) return idx.byFixture.get(rev)!;
  }
  return { kickoffUtc: null, code: null };
}

/**
 * WC files store the projection records either as a flat `projections` array, or — in current data —
 * as the elements of `matches[]` (each element IS a projection with a `market`), or nested under
 * `matches[].projections`. (`public` at top level is a boolean flag, not the array.)
 */
function normalizeWcRecords(obj: any): any[] {
  if (Array.isArray(obj?.projections)) return obj.projections;
  if (Array.isArray(obj?.matches)) {
    const out: any[] = [];
    for (const m of obj.matches) {
      if (Array.isArray(m?.projections)) out.push(...m.projections);
      else if (m && typeof m === "object" && "market" in m) out.push(m);
    }
    return out;
  }
  if (Array.isArray(obj?.public)) return obj.public; // future shape
  return [];
}

export interface DateExtraction {
  date: string;
  sportsRequested: Sport[];
  bySport: SportExtractionResult[];
}

/** Extract methodology PredictionOutputs for a date across the requested sports. dataRoot = public/data. */
export function extractPredictionsForDate(
  date: string,
  sports: Sport[],
  dataRoot: string,
  opts: MethodologyOptions = DEFAULT_OPTIONS,
): DateExtraction {
  const bySport = sports.map((sport) => {
    const loaded = loadSourceForSport(sport, date, dataRoot);
    return extractPredictionsBySport(sport, loaded, opts);
  });
  return { date, sportsRequested: sports, bySport };
}

/** Normalize a --sport flag value into the canonical Sport list. */
export function resolveSports(flag: string | null | undefined): Sport[] {
  if (!flag || flag.toLowerCase() === "all") return [...ALL_SPORTS];
  const s = SPORT_ALIASES[flag.toLowerCase()];
  if (!s) throw new Error(`Unknown --sport "${flag}". Use one of: all, mlb, nba, ufc, world-cup.`);
  return [s];
}
