/**
 * Static loaders for FIFA World Cup 2026 data.
 *
 * Reads pre-curated JSON artifacts under `app/public/data/world-cup/`.
 * The data is hand-curated from FIFA's official sources + ESPN cross-reference;
 * see each artifact's `source`/`sourceUrl` field for attribution.
 *
 * Honest framing:
 *   - The schedule + groups are official (Final Draw on 2025-12-05).
 *   - Final 26-player squads are pending official release (deadline 2026-06-01);
 *     this loader returns `status: "pending_official_release"` until that date.
 *   - No projection / odds data exists for World Cup matches; the consumer pages
 *     render "projections coming soon" honestly.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "public", "data", "world-cup");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorldCupMeta {
  tournament: string;
  edition: string;
  hosts: Array<{ country: string; code: string; matchesShare: string }>;
  format: {
    teams: number;
    groups: number;
    teamsPerGroup: number;
    groupStageMatches: number;
    knockoutMatches: number;
    totalMatches: number;
    knockoutRounds: string[];
  };
  schedule: {
    openingMatch: { date: string; matchup: string; venueCity: string };
    finalMatch: { date: string; venueCity: string };
    groupStageStart: string;
    groupStageEnd: string;
    knockoutStart: string;
  };
  squadStatus: {
    officialFinalSquadsReleased: boolean;
    finalSubmissionDeadline: string;
    officialPublicationDate: string;
    preliminarySubmissionDeadline: string;
    notes: string;
  };
  projectionStatus: {
    modelLive: boolean;
    plannedInputs: string[];
    notes: string;
  };
  sources: Array<{ label: string; url: string }>;
  generatedAt: string;
  dataQuality: string;
}

export interface WorldCupTeam {
  name: string;
  code: string;
  group: string;
  confederation: "AFC" | "CAF" | "CONCACAF" | "CONMEBOL" | "OFC" | "UEFA";
  isHost: boolean;
}

export interface WorldCupGroup {
  id: string;
  teams: string[];
}

export type WorldCupStage = "group" | "r32" | "r16" | "qf" | "sf" | "third" | "final";

export interface WorldCupMatch {
  id: number;
  stage: WorldCupStage;
  group?: string;
  date: string;
  kickoffLocal: string;
  venueCity: string;
  venueCountry: "US" | "CA" | "MX";
  home?: string;
  away?: string;
  homePlaceholder?: string;
  awayPlaceholder?: string;
}

export interface WorldCupSquadsArtifact {
  status: "pending_official_release" | "partial" | "complete";
  generatedAt: string;
  officialReleaseDate: string;
  finalSubmissionDeadline: string;
  rosterModuleUnlocksAt: string;
  source: string;
  sourceUrl: string;
  rules: {
    playersPerSquad: number;
    minGoalkeepers: string;
    preliminaryRangePlayers: string;
    preliminaryMinGoalkeepers: number;
  };
  squads: Array<{
    teamCode: string;
    teamName: string;
    announcedAt: string;
    sourceUrl: string;
    players: Array<{ name: string; position: string; club?: string }>;
  }>;
}

// ---------------------------------------------------------------------------
// Loaders (cached at module scope — files don't change at runtime)
// ---------------------------------------------------------------------------

let _metaCache: WorldCupMeta | null | undefined;
let _teamsCache: WorldCupTeam[] | null | undefined;
let _groupsCache: WorldCupGroup[] | null | undefined;
let _scheduleCache: WorldCupMatch[] | null | undefined;
let _squadsCache: WorldCupSquadsArtifact | null | undefined;

function _readJson<T>(file: string): T | null {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

export function loadWorldCupMeta(): WorldCupMeta | null {
  if (_metaCache !== undefined) return _metaCache;
  _metaCache = _readJson<WorldCupMeta>("meta.json");
  return _metaCache;
}

export function loadWorldCupTeams(): WorldCupTeam[] {
  if (_teamsCache !== undefined) return _teamsCache ?? [];
  const raw = _readJson<{ teams: WorldCupTeam[] }>("teams.json");
  _teamsCache = raw?.teams ?? null;
  return _teamsCache ?? [];
}

export function loadWorldCupGroups(): WorldCupGroup[] {
  if (_groupsCache !== undefined) return _groupsCache ?? [];
  const raw = _readJson<{ groups: WorldCupGroup[] }>("groups.json");
  _groupsCache = raw?.groups ?? null;
  return _groupsCache ?? [];
}

export function loadWorldCupSchedule(): WorldCupMatch[] {
  if (_scheduleCache !== undefined) return _scheduleCache ?? [];
  const raw = _readJson<{ matches: WorldCupMatch[] }>("schedule.json");
  _scheduleCache = raw?.matches ?? null;
  return _scheduleCache ?? [];
}

export function loadWorldCupSquads(): WorldCupSquadsArtifact | null {
  if (_squadsCache !== undefined) return _squadsCache;
  _squadsCache = _readJson<WorldCupSquadsArtifact>("squads.json");
  return _squadsCache;
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export function teamByName(name: string): WorldCupTeam | null {
  return loadWorldCupTeams().find((t) => t.name === name) ?? null;
}

export function teamByCode(code: string): WorldCupTeam | null {
  return loadWorldCupTeams().find((t) => t.code === code) ?? null;
}

export function fixturesForTeam(teamName: string): WorldCupMatch[] {
  return loadWorldCupSchedule().filter(
    (m) => m.stage === "group" && (m.home === teamName || m.away === teamName),
  );
}

export function matchesForGroup(groupId: string): WorldCupMatch[] {
  return loadWorldCupSchedule().filter(
    (m) => m.stage === "group" && m.group === groupId,
  );
}

export function matchesOnDate(dateIso: string): WorldCupMatch[] {
  return loadWorldCupSchedule().filter((m) => m.date === dateIso);
}

/**
 * Convert ISO 3166-1 alpha-2 (or GB-{ENG,SCT,WLS,NIR}) into the
 * Unicode emoji-flag sequence. Returns an empty string for unrecognised
 * codes so the UI never renders a placeholder box.
 */
export { flagEmoji } from "./flag-emoji";

/**
 * Compute days-until-kickoff relative to a given today (defaults to system
 * UTC). The tournament opener is 2026-06-11 in Mexico City. Returns 0 once
 * the opener has started and a negative number after.
 */
export function daysUntilOpener(today?: Date): number {
  const opener = new Date("2026-06-11T18:00:00Z"); // 1 PM CT in Mexico City ≈ 19:00 UTC
  const now = today ?? new Date();
  const diffMs = opener.getTime() - now.getTime();
  return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0);
}

/**
 * Group the schedule by date for the schedule-page calendar view.
 */
export function scheduleByDate(): Array<{
  date: string;
  matches: WorldCupMatch[];
}> {
  const all = loadWorldCupSchedule();
  const byDate = new Map<string, WorldCupMatch[]>();
  for (const m of all) {
    const list = byDate.get(m.date) ?? [];
    list.push(m);
    byDate.set(m.date, list);
  }
  return [...byDate.entries()]
    .map(([date, matches]) => ({ date, matches }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export const STAGE_LABEL: Record<WorldCupStage, string> = {
  group: "Group stage",
  r32: "Round of 32",
  r16: "Round of 16",
  qf: "Quarter-final",
  sf: "Semi-final",
  third: "Third-place playoff",
  final: "Final",
};

export const CONFEDERATION_LABEL: Record<WorldCupTeam["confederation"], string> = {
  AFC: "AFC (Asia)",
  CAF: "CAF (Africa)",
  CONCACAF: "CONCACAF (North America)",
  CONMEBOL: "CONMEBOL (South America)",
  OFC: "OFC (Oceania)",
  UEFA: "UEFA (Europe)",
};
