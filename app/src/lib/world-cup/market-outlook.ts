/**
 * World Cup market-outlook loader (build-time, static — same pattern as other
 * `lib/data*` loaders). Reads the artifact written by `pipeline.world_cup.odds_api`
 * from REAL The Odds API prices. This is a MARKET OUTLOOK (de-vigged sportsbook
 * implied probabilities), NOT a GameTime Picks model pick — 90-minute regulation
 * result only (Draw included; extra time/penalties excluded). Fail-closed: returns
 * null when no artifact / no ready odds.
 */
import fs from "node:fs";
import path from "node:path";

export interface WcOutlookResult {
  homeOdds: number; drawOdds: number; awayOdds: number;
  homeWinPct: number; drawPct: number; awayWinPct: number;
  bookmaker: string | null; market: string;
}
export interface WcOutlookTotals {
  line: number; overOdds: number; underOdds: number;
  overPct: number; underPct: number; bookmaker: string | null;
}
export interface WcOutlookMatch {
  oddsEventId: string | null; homeTeam: string; awayTeam: string;
  commenceTime: string | null; status: string;
  matchId?: number | null; group?: string | null; stage?: string | null;
  kickoffLocal?: string | null; venueCity?: string | null; date?: string | null;
  result?: WcOutlookResult; totals?: WcOutlookTotals | null; marketRules?: string;
}
export interface WcMarketOutlook {
  generatedAt: string; date: string; source: string; disclaimer: string;
  matchCount: number; readyCount: number; matches: WcOutlookMatch[];
}
export interface WcProjectionReadiness {
  oddsReady: boolean; statsReady: boolean; marketOutlookReady: boolean;
  projectionsReady: boolean; parlayReady: boolean; playerPropsReady: boolean;
  perMarket: Record<string, string>; failClosedReasons: string[];
}

const DIR = path.join(process.cwd(), "public", "data", "world-cup");
function read<T>(f: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as T;
  } catch {
    return null;
  }
}
export function loadWorldCupMarketOutlook(): WcMarketOutlook | null {
  const o = read<WcMarketOutlook>("market-outlook-latest.json");
  return o && Array.isArray(o.matches) ? o : null;
}
export function loadWorldCupProjectionReadiness(): WcProjectionReadiness | null {
  return read<WcProjectionReadiness>("projection-readiness-latest.json");
}

/** Soccer stats-provider readiness (fail-closed gating), written by
 *  `pipeline.world_cup.readiness`. Null when no artifact yet. */
export interface WcStatsReadiness {
  provider: string; providerConfigured: boolean;
  oddsReady: boolean; teamStatsReady: boolean; xgReady: boolean;
  lineupsReady: boolean; playerStatsReady: boolean;
  marketOutlookReady: boolean; projectionsAllowed: boolean;
  playerPropsAllowed: boolean; parlayAllowed: boolean;
  providerPlanBlock?: string;
  failClosedReasons: string[];
}
export function loadWorldCupStatsReadiness(): WcStatsReadiness | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(DIR, "stats", "readiness-latest.json"), "utf8"),
    ) as WcStatsReadiness;
  } catch {
    return null;
  }
}

// Team-name normalization + a small alias map so schedule names (FIFA) match the
// Odds API names (e.g. "Czechia" ↔ "Czech Republic").
const ALIASES: Record<string, string> = {
  czechrepublic: "czechia",
  korearepublic: "southkorea",
  bosniaherzegovina: "bosniaandherzegovina",
  unitedstates: "usa",
  us: "usa",
  ivorycoast: "cotedivoire",
};
function norm(s: string | null | undefined): string {
  const base = (s || "").toLowerCase().replace(/[^a-z]/g, "");
  return ALIASES[base] ?? base;
}

/** Find the outlook card for a scheduled match (by team-pair, alias-aware). */
export function outlookForMatch(
  home: string,
  away: string,
  outlook: WcMarketOutlook | null,
): WcOutlookMatch | null {
  if (!outlook) return null;
  const h = norm(home);
  const a = norm(away);
  return (
    outlook.matches.find(
      (m) =>
        (norm(m.homeTeam) === h && norm(m.awayTeam) === a) ||
        (norm(m.homeTeam) === a && norm(m.awayTeam) === h),
    ) ?? null
  );
}
