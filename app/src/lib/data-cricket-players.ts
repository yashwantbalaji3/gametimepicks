/**
 * Cricket player projection loader — projections-only.
 *
 * Reads `app/public/data/cricket/player-projections/<date>.json`.
 *
 * Honest contract:
 *   - Returns null when no file exists; UI falls back to the
 *     existing context cards and never claims player projections.
 *   - Players carry **qualitative role-impact** notes only by
 *     default. The `projectionType: "context-only"` flag is the
 *     default state — UI must not render a numeric runs/wickets
 *     value unless `projectionType: "numeric"` is set AND a
 *     supported numeric field is populated.
 *   - Every record carries `manual: true` + a `source` string.
 *   - Cricket remains projections-only (never enters parlay
 *     optimizer / custom builder / Results).
 */
import fs from "node:fs";
import path from "node:path";

export type CricketPlayerRole =
  | "batter"
  | "bowler"
  | "all-rounder"
  | "keeper"
  | string;

export type CricketPlayerProjectionType = "context-only" | "numeric";

export type CricketLikelyXiStatus = "likely" | "squad" | "unknown" | string;

export interface CricketPlayerProjection {
  team: string;
  name: string;
  role: CricketPlayerRole;
  battingOrder?: string | null;
  likelyXiStatus: CricketLikelyXiStatus;
  /** "context-only" by default. Set to "numeric" ONLY when a
   *  supported numeric projection field is populated below. */
  projectionType: CricketPlayerProjectionType;
  /** Qualitative role-impact note. Always present. */
  roleImpact: string;
  /** Optional qualitative trend note. */
  trendNote?: string | null;
  /** Confidence tag. Use "Qualitative" for context-only cards;
   *  reserve High/Medium/Low for future numeric projections. */
  confidence: "High" | "Medium" | "Low" | "Qualitative" | string;
  /** Optional numeric fields — populated only when `projectionType` is
   *  "numeric". UI ignores them otherwise. */
  projectedRuns?: number | null;
  projectedRunsRange?: string | null;
  projectedWickets?: number | null;
  projectedWicketsRange?: string | null;
  /** Curated metadata. Always present in the manual files we ship. */
  manual: boolean;
  source: string;
}

export interface CricketTotalsContextNote {
  label: string;
  note: string;
  rangeQualitative?: string | null;
  source?: string | null;
}

export interface CricketPlayerProjectionsFile {
  date: string;
  matchId: string | null;
  status: "pre_toss" | "post_toss" | string;
  totalsContext: CricketTotalsContextNote | null;
  players: CricketPlayerProjection[];
  notes: string[];
  sources: Array<{
    name: string;
    url?: string | null;
    covers?: string | null;
  }>;
}

const DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "cricket",
  "player-projections",
);

export function getCricketPlayerProjectionsForDate(
  date: string,
): CricketPlayerProjectionsFile | null {
  if (!date) return null;
  const p = path.join(DIR, `${date}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as CricketPlayerProjectionsFile;
  } catch {
    return null;
  }
}

/** Group players by team for two-column rendering. */
export function groupPlayersByTeam(
  players: CricketPlayerProjection[],
): Record<string, CricketPlayerProjection[]> {
  return players.reduce<Record<string, CricketPlayerProjection[]>>(
    (acc, p) => {
      const k = p.team || "?";
      (acc[k] = acc[k] || []).push(p);
      return acc;
    },
    {},
  );
}

/** Sort players inside a team by role priority then name. Batter →
 *  all-rounder → keeper → bowler; ties broken alphabetically. */
const _ROLE_ORDER: Record<string, number> = {
  batter: 0,
  "all-rounder": 1,
  keeper: 2,
  bowler: 3,
};

export function sortPlayersForDisplay(
  players: CricketPlayerProjection[],
): CricketPlayerProjection[] {
  return players.slice().sort((a, b) => {
    const ra = _ROLE_ORDER[a.role] ?? 99;
    const rb = _ROLE_ORDER[b.role] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.name || "").localeCompare(b.name || "");
  });
}
