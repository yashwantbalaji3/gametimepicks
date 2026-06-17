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
      // UFC publishes "latest" artifacts for the most recent event (no per-date board).
      const projPath = path.join(dataRoot, "ufc", "projections-latest.json");
      const proj = readJson(projPath);
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
      // Player files often omit per-record kickoff; join it by matchId from the team file so player
      // props are judged on merit (lineup/DNP) rather than rejected for a missing event-start time.
      const kickoffByMatch = new Map<string, string>();
      for (const r of teamRecs) {
        if (r?.matchId != null && r?.kickoffUtc) kickoffByMatch.set(String(r.matchId), String(r.kickoffUtc));
      }
      const playerRecs = playerRaw
        ? normalizeWcRecords(playerRaw).map((r: any) => ({
            ...r,
            kickoffUtc: r.kickoffUtc ?? kickoffByMatch.get(String(r.matchId)) ?? null,
          }))
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
