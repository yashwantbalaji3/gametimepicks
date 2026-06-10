/**
 * Loader for the MARKET-IMPLIED game outlook artifact produced by
 * `pipeline.build_game_outlook`. Files live at
 * `app/public/data/game-outlook/<sport>/latest.json`.
 *
 * Read at build time only (same static pattern as every other `lib/data*`
 * loader). Returns `null` when no artifact exists so the UI can render a
 * friendly "market not posted yet" empty state instead of inventing data.
 *
 * IMPORTANT: this is NOT a model pick. The win probabilities here are
 * de-vigged straight from the sportsbook moneyline; team totals are derived
 * from the posted total ± spread. It is a transparent read of current market
 * prices — labeled as such everywhere it surfaces.
 */
import fs from "node:fs";
import path from "node:path";

export interface GameOutlookGame {
  gameId: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  startTime: string | null;
  moneyline: { home?: number; away?: number } | null;
  impliedWinProbHome: number | null;
  impliedWinProbAway: number | null;
  spread: { home?: number; away?: number } | null;
  total: number | null;
  teamTotalHome: number | null;
  teamTotalAway: number | null;
  bookmaker: string | null;
  lastUpdate: string | null;
  hasMarket: boolean;
  missing: string[];
}

export interface GameOutlook {
  generatedAt: string;
  sport: string;
  date: string;
  kind: string;
  disclaimer: string;
  source: string;
  bookmakersPreferred?: string[] | null;
  oddsGeneratedAt?: string | null;
  gameCount: number;
  games: GameOutlookGame[];
}

function root(sport: string): string {
  return path.join(process.cwd(), "public", "data", "game-outlook", sport);
}

export function getGameOutlook(sport: "nba" | "mlb"): GameOutlook | null {
  for (const file of ["latest.json"]) {
    try {
      const raw = fs.readFileSync(path.join(root(sport), file), "utf8");
      const parsed = JSON.parse(raw) as GameOutlook;
      if (parsed && Array.isArray(parsed.games)) return parsed;
    } catch {
      /* fall through to null */
    }
  }
  return null;
}
