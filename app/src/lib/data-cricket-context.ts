/**
 * Cricket / IPL contextual data loader.
 *
 * Reads the per-date context JSON produced by
 * `pipeline.cricket.fetch_ipl_context`. The context file pairs an
 * automated team-form + head-to-head pull (ESPN cricket scoreboard)
 * with an optional manual overlay (key players + venue trends), each
 * field carrying source citations.
 *
 * Honest contract:
 *   - Returns null when no context file exists — UI must render
 *     exactly as if the context layer didn't exist.
 *   - Every `manual: true` datum was authored by a curator and cites
 *     a public source. We don't fabricate.
 *   - No total / over-under projection is derived here — totals stay
 *     unavailable when the book provider hasn't posted lines.
 */
import fs from "node:fs";
import path from "node:path";

export interface CricketContextTeam {
  name: string | null;
  abbr: string | null;
}

export interface CricketContextRecentMatch {
  date: string;
  opponent: string | null;
  opponentName: string | null;
  /** "home" or "away" from the perspective of the team in `teamForm`. */
  venue: "home" | "away" | string;
  result: "W" | "L" | string;
  teamScore: string | null;
  opponentScore: string | null;
  summary: string | null;
}

export interface CricketTeamForm {
  team: string | null;
  lastN: number;
  wins: number;
  losses: number;
  summary: string;
  matches: CricketContextRecentMatch[];
}

export interface CricketHeadToHeadEntry {
  date: string;
  teamA: string;
  teamB: string;
  winner: string | null;
  summary: string | null;
  scoreLine: string | null;
  venue: string | null;
}

export interface CricketPlayerForm {
  team: string;
  player: string;
  role: "batter" | "bowler" | "all-rounder" | "keeper" | string;
  note: string;
  manual: boolean;
  source?: string | null;
}

export interface CricketVenueTrends {
  venue: string;
  country?: string | null;
  elevation_m?: number | null;
  notes: string[];
  manual: boolean;
  source?: string | null;
  honestyNote?: string | null;
}

export interface CricketMatchupNote {
  label: string;
  note: string;
  manual: boolean;
}

export interface CricketContextSource {
  name: string;
  url?: string | null;
  covers?: string | null;
}

export interface CricketContext {
  date: string;
  generatedAt: string;
  matchId: string | null;
  shortName?: string | null;
  venue: string | null;
  teams: {
    home: CricketContextTeam;
    away: CricketContextTeam;
  };
  teamForm: CricketTeamForm[];
  headToHead: CricketHeadToHeadEntry[];
  playerForm: CricketPlayerForm[];
  venueTrends: CricketVenueTrends | null;
  matchupNotes: CricketMatchupNote[];
  notes: {
    preTossWarning: string;
    pitchWeatherNotModeled: string;
  };
  manualOverlayPresent: boolean;
  sources: CricketContextSource[];
}

const CONTEXT_DIR = path.join(
  process.cwd(),
  "public",
  "data",
  "cricket",
  "context",
);

export function getCricketContextForDate(
  date: string,
): CricketContext | null {
  if (!date) return null;
  const p = path.join(CONTEXT_DIR, `${date}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as CricketContext;
  } catch {
    return null;
  }
}
