/**
 * Daily suggested-parlay generator. For each risk level, build up to N cross-game parlays from the
 * eligible-leg pool. NEVER forces a weak parlay: if the pool lacks qualified legs, fewer (or zero)
 * cards are returned with an explicit reason. Pure — `createdAt` is stamped by the caller.
 */
import type { EligibleLeg, SuggestedParlay, RiskLevel, GenerationNote, ParlayLegView, Sport, ConfidenceTier, RiskTier } from "./types";
import { MODEL_VERSION } from "./types";
import { RISK_LEVELS, RISK_LEVEL_ORDER, legsForLevel } from "./risk-levels";
import { buildCombinations } from "./combination-optimizer";
import { combinedAmerican, combinedDecimal, combinedHitProbability } from "./odds-math";
import { meanCorrelation } from "./correlation";

const CONF_ORDER: ConfidenceTier[] = ["No Bet", "Low", "Medium", "High"];
const RISK_ORDER: RiskTier[] = ["low", "elevated", "high"];

function worstConfidence(legs: EligibleLeg[]): ConfidenceTier {
  return legs.reduce<ConfidenceTier>((w, l) => (CONF_ORDER.indexOf(l.confidenceTier) < CONF_ORDER.indexOf(w) ? l.confidenceTier : w), "High");
}
function worstRiskTier(legs: EligibleLeg[]): RiskTier {
  return legs.reduce<RiskTier>((w, l) => (RISK_ORDER.indexOf(l.riskTier) > RISK_ORDER.indexOf(w) ? l.riskTier : w), "low");
}

function legView(l: EligibleLeg): ParlayLegView {
  const label = l.line != null ? `${l.participantName} ${l.marketType} ${l.line}` : `${l.participantName} ${l.marketType}`;
  return {
    legId: l.legId, sport: l.sport, eventId: l.eventId, label,
    marketType: l.marketType, odds: l.odds, modelProbability: l.modelProbability, legQualityTier: l.legQualityTier,
  };
}

export interface AssembleCtx {
  date: string;
  riskLevel: RiskLevel;
  parlayType: "cross_game" | "same_game";
  index: number;
}

export function assembleParlay(legs: EligibleLeg[], ctx: AssembleCtx): SuggestedParlay {
  const sports = Array.from(new Set(legs.map((l) => l.sport)));
  const sport: Sport | "MIXED" = sports.length === 1 ? sports[0] : "MIXED";
  const combinedOdds = combinedAmerican(legs.map((l) => l.odds));
  const estimatedHitProbability = combinedHitProbability(legs.map((l) => l.modelProbability));
  const estimatedPayoutMultiple = combinedDecimal(legs.map((l) => l.odds));
  const averageLegQuality = Math.round(legs.reduce((s, l) => s + l.legQualityScore, 0) / legs.length);
  const correlationScore = Number(meanCorrelation(legs).toFixed(3));

  const whyThisParlay = [
    `${legs.length} ${ctx.parlayType === "same_game" ? "same-game" : "independent-game"} legs, avg quality ${averageLegQuality}/100`,
    ...legs.slice(0, 2).map((l) => l.topPositiveFactors[0]?.label).filter(Boolean) as string[],
  ];
  const whyItCouldFail = [
    ...legs.map((l) => l.topNegativeFactors[0]?.label).filter(Boolean).slice(0, 2) as string[],
    estimatedHitProbability == null ? "a leg lacks a model probability" : `combined model hit probability ≈ ${(estimatedHitProbability * 100).toFixed(0)}%`,
  ];

  return {
    parlayId: `${ctx.date}:${ctx.riskLevel}:${ctx.parlayType}:${ctx.index}:${sport}`,
    date: ctx.date,
    sport,
    riskLevel: ctx.riskLevel,
    parlayType: ctx.parlayType,
    legs: legs.map(legView),
    combinedOdds,
    estimatedHitProbability,
    estimatedPayoutMultiple,
    averageLegQuality,
    correlationScore,
    correlationSummary: ctx.parlayType === "same_game"
      ? "Same-game legs — shared-game correlation is expected and may be justified."
      : "Independent games — low/neutral correlation preferred.",
    confidenceTier: worstConfidence(legs),
    riskTier: worstRiskTier(legs),
    whyThisParlay,
    whyItCouldFail,
    eligible: legs.every((l) => l.eligible),
    ineligibilityReasons: [],
    createdAt: null,
    modelVersion: MODEL_VERSION,
    published: false,
  };
}

export interface DailyParlayResult {
  date: string;
  parlays: SuggestedParlay[];
  notes: GenerationNote[];
}

const MAX_CARDS_PER_LEVEL = 5;
const MIN_CARDS_TARGET = 3;

/** Generate suggested parlays for all risk levels from a (single-sport or mixed) eligible-leg pool. */
export function generateDailyParlays(eligible: EligibleLeg[], date: string): DailyParlayResult {
  const parlays: SuggestedParlay[] = [];
  const notes: GenerationNote[] = [];

  for (const level of RISK_LEVEL_ORDER) {
    const spec = RISK_LEVELS[level];
    const pool = legsForLevel(eligible, level);
    const distinctGames = new Set(pool.map((l) => l.eventId)).size;

    if (pool.length < spec.minLegs || distinctGames < spec.minLegs) {
      notes.push({
        riskLevel: level, generated: 0, requested: MIN_CARDS_TARGET,
        reason: `not enough qualified legs across distinct games (have ${pool.length} legs / ${distinctGames} games, need ${spec.minLegs})`,
      });
      continue;
    }

    const combos = buildCombinations(pool, {
      legCount: spec.minLegs,
      maxCards: MAX_CARDS_PER_LEVEL,
      distinctGames: true,
      maxMeanCorrelation: spec.maxMeanCorrelation,
    });

    combos.forEach((legs, i) => parlays.push(assembleParlay(legs, { date, riskLevel: level, parlayType: "cross_game", index: i })));
    notes.push({
      riskLevel: level, generated: combos.length, requested: MIN_CARDS_TARGET,
      reason: combos.length >= MIN_CARDS_TARGET ? null : `only ${combos.length} non-correlated card(s) could be formed from the qualified pool`,
    });
  }

  return { date, parlays, notes };
}

/**
 * MIXED-sport suggested parlays: each card spans ≥2 sports with at least one World Cup leg, from
 * distinct games, pairwise non-correlated. Built per risk level from the SAME gated eligible pool —
 * never fabricated, never forced (a level with no valid cross-sport combo simply returns none).
 */
export function generateMixedParlays(eligible: EligibleLeg[], date: string): DailyParlayResult {
  const parlays: SuggestedParlay[] = [];
  const notes: GenerationNote[] = [];

  for (const level of RISK_LEVEL_ORDER) {
    const spec = RISK_LEVELS[level];
    const pool = legsForLevel(eligible, level);
    const soccer = pool.filter((l) => l.sport === "WORLD_CUP").sort((a, b) => b.legQualityScore - a.legQualityScore);
    const nonSoccer = pool.filter((l) => l.sport !== "WORLD_CUP").sort((a, b) => b.legQualityScore - a.legQualityScore);
    const cards: EligibleLeg[][] = [];
    const usedKeys = new Set<string>();

    // Greedy: one soccer anchor + (minLegs-1) non-soccer legs, all distinct games, non-correlated.
    for (const anchor of soccer) {
      if (cards.length >= MAX_CARDS_PER_LEVEL) break;
      const legs = [anchor];
      const games = new Set([anchor.eventId]);
      for (const cand of nonSoccer) {
        if (legs.length >= spec.minLegs) break;
        if (games.has(cand.eventId)) continue;
        if (!legs.every((l) => meanCorrelation([l, cand]) < spec.maxMeanCorrelation)) continue;
        legs.push(cand);
        games.add(cand.eventId);
      }
      if (legs.length < spec.minLegs) continue;
      if (meanCorrelation(legs) >= spec.maxMeanCorrelation) continue;
      const key = legs.map((l) => l.legId).sort().join("|");
      if (usedKeys.has(key)) continue;
      usedKeys.add(key);
      cards.push(legs);
    }

    cards.forEach((legs, i) => parlays.push(assembleParlay(legs, { date, riskLevel: level, parlayType: "cross_game", index: i })));
    notes.push({
      riskLevel: level, generated: cards.length, requested: MIN_CARDS_TARGET,
      reason: cards.length > 0 ? null : "no cross-sport combo with a World Cup leg cleared this risk band from distinct, non-correlated games",
    });
  }

  return { date, parlays, notes };
}
