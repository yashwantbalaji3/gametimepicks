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
import { loadWorldCupStatsReadiness } from "./market-outlook";

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
  caveats?: string[];
  modelVersion?: string;
  opponentStrengthCoverage?: number;
  // Upgraded methodology (2026-06-11). Only `active` projections are public.
  projectionStatus?:
    | "active"
    | "research_only"
    | "gated_market_sanity"
    | "gated_sample_size"
    | "gated_missing_features"
    | "gated_low_edge"
    | "gated_opponent_strength_missing";
  public?: boolean;
  statusReason?: string;
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

/** True when projections may be shown PUBLICLY (passed the methodology-review gate). */
function projectionsArePublic(): boolean {
  return loadWorldCupStatsReadiness()?.projectionsPublic === true;
}
/** True when suggested parlays may be shown PUBLICLY. */
function parlaysArePublic(): boolean {
  return loadWorldCupStatsReadiness()?.parlayPublic === true;
}

/**
 * Today's PUBLIC model projections, or null. Fail-closed twice over:
 *   1. methodology-review gate — returns null unless `projectionsPublic === true`;
 *   2. only `active` (public) projections are returned, never research/gated picks.
 * The raw artifact is still on disk for audit; this loader is the public boundary.
 */
export function loadWorldCupProjections(): WcProjections | null {
  if (!projectionsArePublic()) return null;
  const p = read<WcProjections>("projections/latest.json");
  if (!p || !Array.isArray(p.matches)) return null;
  // Only surface picks explicitly classified active/public by the upgraded model.
  const active = p.matches.filter(
    (m) => m.projectionStatus === "active" && m.public !== false,
  );
  return active.length > 0
    ? { ...p, matches: active, projectionCount: active.length }
    : null;
}

/** Today's PUBLIC suggested parlays, or null (methodology-review gate). */
export function loadWorldCupParlays(): WcParlays | null {
  if (!parlaysArePublic()) return null;
  const p = read<WcParlays>("parlays/latest.json");
  return p && Array.isArray(p.cards) && p.cards.length > 0 ? p : null;
}

/** Whether the model is paused under methodology review (drives the public note). */
export function worldCupMethodologyReview(): boolean {
  return loadWorldCupStatsReadiness()?.methodologyReviewRequired === true;
}

export interface WcTeamStrengthSummary {
  source: string;
  sourceDate: string;
  teamCount: number;
}
/** Summary of the real team-strength source (FIFA ranking), or null. Drives the data-status
 *  "Team strength" row — independent of whether projections are public. */
export function loadWorldCupTeamStrengthSummary(): WcTeamStrengthSummary | null {
  const s = read<{ source?: string; sourceDate?: string; teamCount?: number }>(
    "team-strength/team-strength-latest.json",
  );
  if (!s || !s.teamCount) return null;
  return {
    source: s.source ?? "FIFA ranking",
    sourceDate: s.sourceDate ?? "",
    teamCount: s.teamCount,
  };
}

/** Format an American price for display, always signed. */
export function fmtAmerican(odds: number | null | undefined): string {
  if (odds === null || odds === undefined) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}
