/**
 * Normalized public data contracts — one shape per concept so shared components render every
 * sport identically. Adapters convert sport-specific artifacts into these contracts. World Cup
 * adapters are implemented here; MLB/NBA/UFC adapters follow the same contract in later PRs.
 */
import type { WcParlays, WcProjections, WcPlayerProjections } from "@/lib/world-cup/projections";

export type SportKey = "world_cup" | "mlb" | "nba" | "ufc";
export type RiskTier = "Low" | "Medium" | "High" | "Longshot";

export interface PublicProjection {
  id: string;
  sport: SportKey;
  sportLabel: string;
  date: string;
  matchId?: number | string | null;
  gameLabel: string;
  market: string;
  marketLabel: string;
  participantType: "team" | "player" | "fighter" | "game";
  player?: { id?: number | string; name: string; team?: string; position?: string | null; photo?: string | null } | null;
  pickLabel: string;
  line?: number | string | null;
  americanOdds?: number | null;
  bookmaker?: string | null;
  modelProbability?: number | null;
  marketProbability?: number | null;
  edgePct?: number | null;
  confidence: "Low" | "Medium" | "High";
  riskTier?: RiskTier;
  public: boolean;
  parlayEligible: boolean;
  bankBuilderEligible: boolean;
  status: string;
  lineupStatus?: string;
  caveats?: string[];
}

export interface PublicSuggestedCard {
  id: string;
  date: string;
  title: string;
  sports: SportKey[];
  sportLabels: string[];
  cardType: "single_sport" | "mixed_sport" | "bank_builder_candidate";
  riskTier: RiskTier;
  legs: Array<{ sport: SportKey; label: string; sublabel?: string; americanOdds: number; photo?: string | null }>;
  combinedAmericanOdds: number;
  defaultStake: number;
  isPublic: boolean;
  bankBuilderEligible: boolean;
  whyThisCard?: string[];
  caveats?: string[];
}

export interface SportSummary {
  sport: SportKey;
  label: string;
  href: string;
  accent: string;
  live: boolean;
  stats: Array<{ label: string; value: string | number }>;
}

const WC_MARKET_LABEL: Record<string, string> = {
  moneyline_90: "Moneyline (90′)",
  double_chance: "Double chance",
  match_total_goals: "Total goals",
  match_total_corners: "Total corners",
  player_shots: "Shots",
  player_shots_on_target: "Shots on target",
  player_assists: "Assists",
  player_goal_scorer_anytime: "Anytime goalscorer",
};

export function normalizeWcCards(parlays: WcParlays | null): PublicSuggestedCard[] {
  if (!parlays) return [];
  return parlays.cards.map((c) => ({
    id: c.id,
    date: parlays.date,
    title: c.title,
    sports: ["world_cup"],
    sportLabels: ["World Cup"],
    cardType: "single_sport",
    riskTier: c.riskTier as RiskTier,
    legs: c.legs.map((l) => ({
      sport: "world_cup" as SportKey,
      label: l.pick,
      sublabel: l.match,
      americanOdds: l.americanOdds,
    })),
    combinedAmericanOdds: c.combinedAmericanOdds,
    defaultStake: c.defaultStake,
    isPublic: true,
    bankBuilderEligible: false,
    whyThisCard: c.whyThisCard,
    caveats: c.dataCaveats,
  }));
}

export function normalizeWcProjections(projections: WcProjections | null): PublicProjection[] {
  if (!projections) return [];
  return projections.matches.map((p) => ({
    id: p.id,
    sport: "world_cup",
    sportLabel: "World Cup",
    date: p.date,
    matchId: p.matchId,
    gameLabel: `${p.homeTeam} vs ${p.awayTeam}`,
    market: p.market,
    marketLabel: WC_MARKET_LABEL[p.market] ?? p.market,
    participantType: "team",
    pickLabel: p.pickLabel ?? `${p.homeTeam} vs ${p.awayTeam}`,
    line: p.line,
    americanOdds: p.americanOdds,
    bookmaker: p.bookmaker,
    modelProbability: p.modelProbability,
    marketProbability: p.marketProbability,
    edgePct: p.edgePct,
    confidence: (p.confidence as "Low" | "Medium" | "High") ?? "Low",
    riskTier: p.riskTier as RiskTier,
    public: p.public ?? true,
    parlayEligible: p.parlayEligible ?? false,
    bankBuilderEligible: false,
    status: p.projectionStatus ?? "public_projection",
    caveats: p.caveats,
  }));
}

export function normalizeWcPlayerProps(players: WcPlayerProjections | null): PublicProjection[] {
  if (!players) return [];
  return players.matches.map((p) => ({
    id: p.id,
    sport: "world_cup",
    sportLabel: "World Cup",
    date: players.date,
    matchId: p.matchId,
    gameLabel: p.player.team,
    market: p.market,
    marketLabel: WC_MARKET_LABEL[p.market] ?? p.market,
    participantType: "player",
    player: { id: p.player.id, name: p.player.name, team: p.player.team, position: p.player.position, photo: p.player.photo },
    pickLabel: p.market === "player_goal_scorer_anytime" ? "Anytime" : `${p.pick} ${p.line ?? ""}`.trim(),
    line: p.line,
    americanOdds: p.americanOdds,
    bookmaker: p.bookmaker,
    modelProbability: p.modelProbability,
    marketProbability: p.marketProbability,
    edgePct: p.edgePct,
    confidence: "Low",
    riskTier: p.riskTier as RiskTier,
    public: p.public ?? true,
    parlayEligible: p.parlayEligible ?? false,
    bankBuilderEligible: false,
    status: p.projectionStatus ?? "pre_lineup_public_projection",
    lineupStatus: p.lineupStatus,
    caveats: p.dataCaveats,
  }));
}
