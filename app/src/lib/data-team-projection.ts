/**
 * Loader for the NBA team-game projection artifact produced by
 * `pipeline.team_projection`. Files live at
 * `app/public/data/nba/team_projections/<date>.json`.
 *
 * Read at build time only — same pattern as every other static loader
 * in `lib/data*`. Returns `null` when no artifact exists for the date
 * so the UI can render a "no team projection on file" empty state.
 *
 * Pure derivation: no fetches, no model calls. The artifact itself is
 * derived from the player-prop board file, so this is one layer of
 * indirection that lets the audit / UI consume a stable shape.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(
  process.cwd(),
  "public",
  "data",
  "nba",
  "team_projections",
);

export interface TeamProjectionPlayerContribution {
  playerId: number | null;
  playerName: string;
  market: string;
  line: number | null;
  projection: number | null;
  confidence: string | null;
}

export interface TeamProjectionSide {
  teamAbbr: string;
  isHome: boolean | null;
  projectedPts: number;
  contributingPlayerCount: number;
  contributions: TeamProjectionPlayerContribution[];
}

export interface TeamGameProjection {
  sport: string;
  date: string;
  gameId: string;
  matchup: string;
  home: TeamProjectionSide;
  away: TeamProjectionSide;
  projectedMargin: number;
  projectedWinner: string | null;
  playoffContext: {
    gameId: string;
    dateIso: string;
    isPlayoff: boolean;
    seasonPhase: string;
    round: string | null;
    gameNumber: number | null;
    seriesShort: string | null;
    eliminationFlag: boolean | null;
    homeTeam: string | null;
    awayTeam: string | null;
    priorGameInSeries: string | null;
    notes: string | null;
  };
  marketSpread: number | null;
  marketMoneyline: { home: number; away: number } | null;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  dataQualityFlag: string | null;
  generatedAt: string;
}

export interface TeamProjectionArtifact {
  sport: string;
  date: string;
  generatedAt: string | null;
  games: TeamGameProjection[];
}

export function getTeamProjectionForDate(
  date: string,
): TeamProjectionArtifact | null {
  const p = path.join(ROOT, `${date}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as TeamProjectionArtifact;
  } catch {
    return null;
  }
}

export function getAvailableTeamProjectionDates(): string[] {
  if (!fs.existsSync(ROOT)) return [];
  return fs
    .readdirSync(ROOT)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}
