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

/** Real recent form (last-5 across all competitions) from API-Football. */
export interface WcRecentForm {
  formString: string; // e.g. "WWDLW", most recent first
  last5: Array<{
    date: string;
    opponent: string;
    score: string;
    result: "W" | "L" | "D" | "-";
    home: boolean;
    competition: string;
  }>;
}

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
  /** 2-letter ISO codes for national-team flags (odds-only path; no api-sports logos). */
  homeCode?: string | null;
  awayCode?: string | null;
  /** Coarse data-quality tag — "limited" odds-only; "B" once API-Football form is attached. */
  dataQuality?: string;
  /** Tournament group (e.g. "Group G") from API-Football standings. */
  group?: string | null;
  /** Which stat layer enriched this projection (e.g. "api_football_recent_form"). */
  statLayer?: string;
  /** Real recent form (last-5 across all competitions) from API-Football. */
  homeForm?: WcRecentForm | null;
  awayForm?: WcRecentForm | null;
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
  cornerSample?: number;
  parlayEligible?: boolean;
  outcomes?: Array<{
    label: string;
    side: string;
    modelProbability: number;
    marketProbability: number;
    americanOdds: number | null;
  }>;
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
  /** Settlement outcome — present only after official 90-minute grading. */
  result?: "win" | "loss" | "push" | "pending" | string;
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
  /** Card settlement state — present only after every leg is officially graded. */
  result?: "won" | "lost" | "push" | "pending" | string;
  settledAt?: string;
  settlementSource?: string;
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
  // Surface every PUBLIC probability view (model vs market). A "pick" only renders when the
  // projection is parlay-eligible — weak edges show as a view, never as a suggested lean.
  const pub = p.matches.filter((m) => m.public === true);
  return pub.length > 0
    ? { ...p, matches: pub, projectionCount: pub.length }
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

// ── Settlement (written by pipeline.world_cup.settle from official FT scores) ──
export interface WcSettlementFinal {
  matchId: number | string;
  match: string;
  // Group-stage artifacts wrote a formatted `regulationScore` ("5-1"); knockout-era artifacts write
  // structured `homeGoals`/`awayGoals` (+ `status`) instead. Both shapes occur — consumers must handle
  // either. `finalScoreText()` normalizes them into one display string.
  regulationScore?: string;
  homeGoals?: number;
  awayGoals?: number;
  status?: string;
  corners?: { home: number; away: number };
}

/** Normalize a settlement final's 90′ score to a display string across both artifact shapes. "" when absent. */
export function finalScoreText(f: Pick<WcSettlementFinal, "regulationScore" | "homeGoals" | "awayGoals">): string {
  if (typeof f.regulationScore === "string" && f.regulationScore) return f.regulationScore;
  if (typeof f.homeGoals === "number" && typeof f.awayGoals === "number") return `${f.homeGoals}-${f.awayGoals}`;
  return "";
}
export interface WcSettlementGraded {
  id: string;
  matchId?: number | string;
  market: string;
  pick: string;
  regulationScore: string;
  outcome: "win" | "loss" | "push" | string;
}
export interface WcSettlement {
  generatedAt: string;
  date: string;
  settlementSource?: string;
  finals?: WcSettlementFinal[];
  graded: WcSettlementGraded[];
}

/** The World Cup settlement artifact (official 90-minute grading), or null before
 *  any match has settled. When `latest.json` is an empty shell for a not-yet-played
 *  slate (the nightly settle run rewrites it each day), falls back to the newest
 *  DATED artifact that actually carries grades — settled history never vanishes
 *  from the UI just because a new day started. */
export function loadWorldCupSettlement(): WcSettlement | null {
  const latest = read<WcSettlement>("settlement/latest.json");
  if (latest && Array.isArray(latest.graded) && latest.graded.length > 0) return latest;
  try {
    const dir = path.join(process.cwd(), "public", "data", "world-cup", "settlement");
    const dated = fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
      .reverse();
    for (const f of dated) {
      const s = read<WcSettlement>(`settlement/${f}`);
      if (s && Array.isArray(s.graded) && s.graded.length > 0) return s;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** The suggested-parlays artifact for a SPECIFIC date (e.g. the settled slate the
 *  Results tab is showing), or null. */
export function loadWorldCupParlaysForDate(date: string): WcParlays | null {
  const p = read<WcParlays>(`parlays/${date}.json`);
  return p && Array.isArray(p.cards) && p.cards.length > 0 ? p : null;
}

export interface WcPlayerProjection {
  id: string;
  matchId: number;
  player: {
    id: number;
    name: string;
    sportsbookName: string;
    team: string;
    teamLogo: string | null;
    position: string | null;
    photo: string | null;
  };
  market: string;
  line: number | null;
  pick: string;
  americanOdds: number;
  bookmaker: string | null;
  modelProbability: number;
  marketProbability: number;
  edgePct: number;
  public: boolean;
  parlayEligible: boolean;
  projectionStatus: string;
  riskTier: string;
  confidence: string;
  lineupStatus: string;
  modelHasEvidence: boolean;
  factors: string[];
  dataCaveats: string[];
}
export interface WcPlayerProjections {
  generatedAt: string;
  date: string;
  lineupsPosted: boolean;
  projectionCount: number;
  publicCount: number;
  parlayEligibleCount: number;
  byMarket: Record<string, number>;
  matchedPlayers: number;
  matches: WcPlayerProjection[];
}
/** Pre-lineup player projections (public views), or null. */
export function loadWorldCupPlayerProjections(): WcPlayerProjections | null {
  const p = read<WcPlayerProjections>("player-projections/latest.json");
  return p && Array.isArray(p.matches) && p.matches.length > 0 ? p : null;
}
const PLAYER_MARKET_LABEL: Record<string, string> = {
  player_shots: "Shots",
  player_shots_on_target: "Shots on target",
  player_assists: "Assists",
  player_goal_scorer_anytime: "Anytime goalscorer",
};
export function playerMarketLabel(key: string): string {
  return PLAYER_MARKET_LABEL[key] ?? key;
}

export interface WcMarketStatus {
  key: string;
  label: string;
  kind: "team" | "player";
  oddsProvider: string;
  oddsReady: boolean;
  dataReady: boolean;
  lineupsReady: boolean | null;
  projectionReady: boolean;
  status: string;
  reason: string;
}
export interface WcMarketAvailability {
  generatedAt: string;
  date: string;
  providers: {
    oddsApi: { connected: boolean; sportKey: string; creditsRemaining?: string | null };
    apiFootball: { connected: boolean; plan?: string };
  };
  markets: Record<string, WcMarketStatus>;
  requestedMarketsComplete: boolean;
}
/** Per-market availability matrix (real probe), or null. Drives the "Requested markets"
 *  section so no requested market is ever silently missing. */
export function loadWorldCupMarketAvailability(): WcMarketAvailability | null {
  const a = read<WcMarketAvailability>("markets/availability-latest.json");
  return a && a.markets ? a : null;
}
/** Friendly chip label + tone for a market status. */
export function marketStatusChip(status: string): { label: string; tone: string } {
  switch (status) {
    case "live": return { label: "Live", tone: "var(--vault-success)" };
    case "research_only": return { label: "Model research", tone: "var(--vault-gold-bright)" };
    case "waiting_on_odds": return { label: "Waiting on odds", tone: "var(--vault-text-mute)" };
    case "waiting_on_lineups": return { label: "Waiting on lineups", tone: "var(--vault-gold)" };
    case "waiting_on_provider_stats": return { label: "Waiting on stats", tone: "var(--vault-text-mute)" };
    case "waiting_on_edge_threshold": return { label: "Awaiting edge", tone: "var(--vault-gold)" };
    case "unavailable_from_provider": return { label: "No provider odds", tone: "var(--vault-text-faint)" };
    default: return { label: status, tone: "var(--vault-text-faint)" };
  }
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
