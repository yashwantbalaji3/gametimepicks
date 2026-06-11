/**
 * World Cup model-projection + suggested-parlay loaders (build-time, static).
 *
 * Reads the artifacts written by `pipeline.world_cup.build_team_projections` and
 * `build_suggested_parlays`. These ARE GameTime Picks model projections — a recent-form
 * Poisson model BLENDED with the de-vigged market (never an echo of the market), 90-minute
 * regulation only (Draw is a real outcome; no extra time/penalties). Fail-closed: returns
 * null / empty when the gates didn't pass so no artifact exists.
 */
import fs from "node:fs";
import path from "node:path";

export interface WcProjection {
  id: string;
  sport: "world_cup";
  date: string;
  matchId: number;
  homeTeam: string;
  awayTeam: string;
  kickoffUtc: string | null;
  homeLogo: string | null;
  awayLogo: string | null;
  market: "moneyline_90" | "match_total_goals" | string;
  pick: string;
  pickLabel: string;
  line: number | null;
  americanOdds: number | null;
  bookmaker: string | null;
  modelProbability: number;
  marketProbability: number;
  edgePct: number;
  confidence: string | null;
  riskTier: string;
  regulationOnly: boolean;
  sampleSizeWarning: boolean;
  factors: string[];
  notes: string[];
}
export interface WcProjections {
  generatedAt: string;
  date: string;
  matchCount: number;
  projectionCount: number;
  disclaimer: string;
  matches: WcProjection[];
}

export interface WcParlayLeg {
  matchId: number;
  match: string;
  market: string;
  pick: string;
  americanOdds: number;
  modelProbability: number;
  marketProbability: number;
  edgePct: number;
  confidence: string | null;
  regulationOnly: boolean;
}
export interface WcParlayCard {
  id: string;
  sport: "world_cup";
  riskTier: string;
  title: string;
  legs: WcParlayLeg[];
  legCount: number;
  combinedAmericanOdds: number;
  combinedDecimal: number;
  defaultStake: number;
  projectedReturn: number;
  regulationOnly: boolean;
  combinedTotalEdgePct?: number;
  whyThisCard: string[];
  correlationNotes: string[];
  dataCaveats: string[];
}
export interface WcParlays {
  generatedAt: string;
  date: string;
  cardCount: number;
  byRisk: Record<string, number>;
  disclaimer: string;
  cards: WcParlayCard[];
  gateReasons: string[];
}

const DIR = path.join(process.cwd(), "public", "data", "world-cup");
function read<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, rel), "utf8")) as T;
  } catch {
    return null;
  }
}

/** Today's model projections, or null when none were generated (gates failed). */
export function loadWorldCupProjections(): WcProjections | null {
  const p = read<WcProjections>("projections/latest.json");
  return p && Array.isArray(p.matches) && p.matches.length > 0 ? p : null;
}

/** Today's suggested parlays, or null when no valid cards exist. */
export function loadWorldCupParlays(): WcParlays | null {
  const p = read<WcParlays>("parlays/latest.json");
  return p && Array.isArray(p.cards) && p.cards.length > 0 ? p : null;
}

/** Format an American price for display, always signed. */
export function fmtAmerican(odds: number | null | undefined): string {
  if (odds === null || odds === undefined) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}
