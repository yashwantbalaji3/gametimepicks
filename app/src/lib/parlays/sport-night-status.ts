/**
 * PARLAY CENTER · TONIGHT, PER SPORT (UX-06/07, trust audit 2026-11-09).
 *
 * On an NBA/NFL night every risk tier used to say "The MLB season is over", as if no sport had games. The MLB off-season
 * reason belongs to MLB alone; every other sport states its own night from the Level A registry
 * (sport-capability-registry.ts MODEL_SUGGESTION_CAPABILITIES, founder policy 2026-10-23), in the registry's own words.
 * No sport is opened here and no tier is built: NBA suggestions stay untiered and NFL stays closed until the founder
 * decides otherwise in writing.
 *
 * Pure: counts and the MLB reason are arguments.
 */
import { MODEL_SUGGESTION_CAPABILITIES } from "@/lib/sport-capability-registry";

export type SportNightState = "OFF_SEASON" | "SLATE" | "NO_SLATE";
export interface SportNightLine {
  readonly sport: "mlb" | "nba" | "nfl";
  readonly label: string;
  readonly state: SportNightState;
  /** Level A registry state for the sport (OPEN / CLOSED), as recorded. */
  readonly suggestions: "OPEN" | "CLOSED" | null;
  readonly text: string;
}

/** The tier reason on a night MLB is over: sport-neutral, so no tier claims the whole site has no games. */
export const OFF_SEASON_TIER_REASON = "No card at this risk level tonight. Each sport’s status for tonight is listed above.";

const capability = (sport: string) => MODEL_SUGGESTION_CAPABILITIES.find((c) => c.key === sport) ?? null;
const games = (n: number) => `${n} game${n === 1 ? "" : "s"} tonight`;

export function sportNightStatus({ mlbOffSeasonReason, nbaGames, nflGames }: { mlbOffSeasonReason: string | null; nbaGames: number; nflGames: number }): SportNightLine[] {
  const lines: SportNightLine[] = [];
  const mlb = capability("mlb");
  if (mlbOffSeasonReason) lines.push({ sport: "mlb", label: "MLB", state: "OFF_SEASON", suggestions: mlb?.state ?? null, text: mlbOffSeasonReason });
  const nba = capability("nba");
  lines.push(nbaGames > 0
    ? { sport: "nba", label: "NBA", state: "SLATE", suggestions: nba?.state ?? null, text: `${games(nbaGames)}. The official Elo sides are on the NBA page. ${nba?.reason ?? ""}`.trim() }
    : { sport: "nba", label: "NBA", state: "NO_SLATE", suggestions: nba?.state ?? null, text: "No games on tonight’s slate." });
  const nfl = capability("nfl");
  lines.push(nflGames > 0
    ? { sport: "nfl", label: "NFL", state: "SLATE", suggestions: nfl?.state ?? null, text: `${games(nflGames)}. Not yet open for suggestions: ${nfl?.reason ?? ""}`.trim() }
    : { sport: "nfl", label: "NFL", state: "NO_SLATE", suggestions: nfl?.state ?? null, text: "No games on tonight’s slate." });
  return lines;
}
