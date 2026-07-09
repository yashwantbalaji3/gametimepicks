/**
 * wc-expanded-markets.ts — loader + view for the EXPANDED World Cup market modules
 * (Asian handicap + team totals), read from the de-vigged
 * public/data/world-cup/expanded-markets/<date>.json (written by ingest-wc-expanded-markets.mjs).
 *
 * DIRECT read of the de-vigged prices — no model, no fabrication. Returns null when there is no
 * artifact for the date; returns per-module unavailable notes when a book didn't post a market.
 * Money-independent. NOT a sampled simulation — market-implied only.
 */
import fs from "node:fs";
import path from "node:path";

export interface WcAhSide {
  line: number | null;
  odds: number;
  impliedProb?: number | null;
  noVigProb: number | null;
}
export interface WcAsianHandicap {
  source: string;
  line: number;
  home: WcAhSide;
  away: WcAhSide;
}
export interface WcTeamTotalSide {
  team: string;
  line: number;
  over: { odds: number; noVigProb: number | null };
  under: { odds: number; noVigProb: number | null };
}
export interface WcTeamTotals {
  source: string;
  home: WcTeamTotalSide;
  away: WcTeamTotalSide;
}
export interface WcExpandedUnavailable {
  market: string;
  reason: string;
}
export interface WcExpandedMarkets {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  asianHandicap: WcAsianHandicap | null;
  teamTotals: WcTeamTotals | null;
  supportedModules: string[];
  unavailable: WcExpandedUnavailable[];
}

const DIR = path.join(process.cwd(), "public", "data", "world-cup", "expanded-markets");

function readArtifact(date: string): Record<string, unknown> | null {
  try {
    const p = path.join(DIR, `${date}.json`);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (err) {
    console.warn(`[wc-expanded-markets] could not load ${date}:`, err);
    return null;
  }
}

/** The expanded markets for one fixture on a date, or null when no artifact/match. */
export function getWcExpandedMarkets(date: string, matchId: string): WcExpandedMarkets | null {
  const art = readArtifact(date);
  const m = (art?.matches as Record<string, any> | undefined)?.[matchId];
  if (!m) return null;
  const asianHandicap = (m.markets?.asianHandicap as WcAsianHandicap) ?? null;
  const teamTotals = (m.markets?.teamTotals as WcTeamTotals) ?? null;
  const supportedModules = [
    asianHandicap ? "Asian handicap" : null,
    teamTotals ? "Team totals" : null,
  ].filter(Boolean) as string[];
  // Standard soccer modules this expansion still can't back (Odds API doesn't post them).
  const unavailable: WcExpandedUnavailable[] = [
    ...((m.unavailableMarkets as WcExpandedUnavailable[]) ?? []),
    { market: "corners", reason: "provider_not_available" },
    { market: "cards", reason: "provider_not_available" },
    { market: "exact_score", reason: "provider_not_available" },
    { market: "first_scorer", reason: "not_posted" },
  ];
  return {
    matchId,
    homeTeam: String(m.homeTeam ?? ""),
    awayTeam: String(m.awayTeam ?? ""),
    asianHandicap,
    teamTotals,
    supportedModules,
    unavailable,
  };
}
