/**
 * Read-only view of an accepted soccer league's public forecast artifact (P257). Every figure on the page is
 * read from here; nothing is recomputed in the page. Public artifact only — never a research file.
 */
import fs from "node:fs";
import path from "node:path";

export interface LeagueForecastRow {
  eventId: string; matchup: string; homeClub: string; awayClub: string; slug: string; kickoffUtc: string;
  homeEspnId?: string | null; awayEspnId?: string | null;
  probs: { home: number; draw: number; away: number };
  expectedGoals: number | null; over25: number | null;
  btts?: { yes: number; no: number } | null;
  topScorelines?: Array<{ score: string; p: number }>;
  coldStart?: { home?: boolean; away?: boolean } | null;
  sparseInput?: { note: string } | null;
}
export interface LeagueForecastSet {
  league: string; competition: string; country?: string; generatedAt: string;
  model: { id: string; matchesFitted: number };
  validation: {
    verdict: string;
    holdout: { season: string; matches: number; logLoss: number; empiricalLogLoss: number; drawEceAllScored: number };
    limitations: { closingMarketBetterBy: number | null; eloBetterBy: number | null; note: string };
  };
  sources: { fixtures: string; history: string };
  rows: LeagueForecastRow[];
  refused: Array<{ matchup?: string; eventId: string; reason: string }>;
}

export function loadLeagueForecasts(league: string): LeagueForecastSet | null {
  try {
    const p = path.join(process.cwd(), "public", "data", "soccer", league, "forecasts", "latest.json");
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return raw?.artifact === "soccer-league-forecasts" && Array.isArray(raw.rows) ? (raw as LeagueForecastSet) : null;
  } catch {
    return null;
  }
}
