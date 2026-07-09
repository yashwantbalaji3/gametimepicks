/**
 * MULTI-SPORT CANDIDATE LEG — a normalized, sport-agnostic candidate leg shape + settlement-aware
 * product-eligibility gating.
 *
 * Pure, side-effect-free SCAFFOLDING for a future shared multi-sport candidate pool. It does NOT create
 * exposure, is NOT wired into Bank Builder / Moonshot generation, and reads no artifacts — callers pass
 * already-loaded, artifact-backed fields. The one opinion it encodes is honest: a leg can only be
 * `productEligible` (activatable for a money product) when its market has SETTLEMENT wired and its data
 * quality is adequate. Soccer team + player markets settle via API-Football; MLB now settles via the
 * tested rules in src/lib/mlb/product-settlement (statsapi box scores) — see the settlement audit.
 * Eligibility is about gradeability + never activates a card or creates exposure.
 */
import { isMlbMarketSettleable } from "../mlb/product-settlement/mlb-markets";

export type Sport = "MLB" | "Soccer";
export type DataQuality = "strong" | "medium" | "thin" | "unavailable";
export type SettlementSource = "statsapi" | "api-football" | "manual" | "none";

export interface CandidateLeg {
  sport: Sport;
  date: string;
  gameId: string;
  eventName: string;
  market: string;
  selection: string;
  side?: string;
  line?: number;
  price?: number;
  marketProbability?: number;
  modelProbability?: number;
  calibratedProbability?: number;
  edgePct?: number;
  confidence?: string;
  reliabilityWeight?: number;
  dataQuality: DataQuality;
  settlementSource: SettlementSource;
  /** True ⇔ this leg may be activated in a money product (settlement wired + data adequate). */
  productEligible: boolean;
  productEligibilityReason: string;
  /** Honest, prediction-free descriptor for UI (never a probability/price). */
  publicLabel: string;
  artifactSource: string;
}

/** Soccer markets with settlement wired today (team + player), via API-Football. */
const SOCCER_SETTLEABLE = new Set([
  "moneyline_90", "double_chance", "draw_no_bet", "match_total_goals", "btts",
  "player_goal_scorer_anytime", "player_assists", "player_shots", "player_shots_on_target",
]);

/** The settlement source for a (sport, market), or "none" when no product-card settlement is wired. */
export function settlementSourceFor(sport: Sport, market: string): SettlementSource {
  if (sport === "Soccer") return SOCCER_SETTLEABLE.has(market) ? "api-football" : "none";
  // MLB now has tested settlement rules (src/lib/mlb/product-settlement) graded from statsapi box
  // scores. A market is settleable only when a rule exists for it; others stay "none".
  return isMlbMarketSettleable(market) ? "statsapi" : "none";
}

/** Product eligibility: settleable AND data adequate. Everything else is analysis/watchlist only. */
export function evaluateProductEligibility(
  sport: Sport,
  market: string,
  dataQuality: DataQuality,
  settlementSource: SettlementSource = settlementSourceFor(sport, market),
): { productEligible: boolean; reason: string } {
  if (settlementSource === "none") {
    return { productEligible: false, reason: `no product-card settlement wired for ${sport} ${market} — analysis/watchlist only` };
  }
  if (dataQuality === "unavailable") return { productEligible: false, reason: "no usable data" };
  if (dataQuality === "thin") return { productEligible: false, reason: "thin history — watchlist / low priority" };
  return { productEligible: true, reason: `settleable via ${settlementSource}, data ${dataQuality}` };
}

/** The minimal input a caller supplies; the rest is derived honestly. */
export interface CandidateLegInput {
  sport: Sport;
  date: string;
  gameId: string;
  eventName: string;
  market: string;
  selection: string;
  side?: string;
  line?: number;
  price?: number;
  marketProbability?: number;
  modelProbability?: number;
  calibratedProbability?: number;
  edgePct?: number;
  confidence?: string;
  reliabilityWeight?: number;
  dataQuality: DataQuality;
  publicLabel?: string;
  artifactSource: string;
}

/**
 * Normalize a partial input into a full `CandidateLeg`, deriving `settlementSource`, `productEligible`,
 * and `productEligibilityReason`. Never fabricates a probability — optional numeric fields pass through
 * only when the caller supplied them. `publicLabel` defaults to a prediction-free "selection · market".
 */
export function normalizeCandidateLeg(input: CandidateLegInput): CandidateLeg {
  const settlementSource = settlementSourceFor(input.sport, input.market);
  const { productEligible, reason } = evaluateProductEligibility(input.sport, input.market, input.dataQuality, settlementSource);
  return {
    sport: input.sport,
    date: input.date,
    gameId: input.gameId,
    eventName: input.eventName,
    market: input.market,
    selection: input.selection,
    side: input.side,
    line: input.line,
    price: input.price,
    marketProbability: input.marketProbability,
    modelProbability: input.modelProbability,
    calibratedProbability: input.calibratedProbability,
    edgePct: input.edgePct,
    confidence: input.confidence,
    reliabilityWeight: input.reliabilityWeight,
    dataQuality: input.dataQuality,
    settlementSource,
    productEligible,
    productEligibilityReason: reason,
    publicLabel: input.publicLabel ?? `${input.selection} · ${input.market}`,
    artifactSource: input.artifactSource,
  };
}
