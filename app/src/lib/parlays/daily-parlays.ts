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
import { getRiskBucketForCombinedOdds } from "./risk-odds-bands";

/**
 * Leg counts we try when building a BALANCED card inventory. More legs ⇒ higher combined odds, so a
 * spread of 2→6 lets the combined-odds bucketer fill High (+300..+600) and Longshot (>+600) instead of
 * clustering every card in Medium. Each bucket is capped so no single tier floods the board.
 */
const LEG_COUNT_SPREAD = [2, 3, 4, 5, 6];
const BALANCED_QUALITY = ["elite", "strong", "playable"] as const;
/** Cap of suggested cards per risk bucket (the matrix shows this capped count, not raw inventory). */
const PER_BUCKET_CAP = 5;

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
  // Balanced inventory: build a deduplicated spread of cross-game cards across leg counts 2→6, then
  // bucket each by its COMBINED odds. More legs reach the High/Longshot bands that 2-leg combos can't —
  // never forced: a band with no real card simply stays empty with a reason.
  const pool = eligible.filter((l) => l.eligible && BALANCED_QUALITY.includes(l.legQualityTier as typeof BALANCED_QUALITY[number]));
  const byBucket: Record<RiskLevel, EligibleLeg[][]> = { low: [], medium: [], high: [], longshot: [] };
  const attempted: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, longshot: 0 };
  const seen = new Set<string>();
  const distinctGames = new Set(pool.map((l) => l.eventId)).size;

  for (const legCount of LEG_COUNT_SPREAD) {
    if (legCount > distinctGames) break; // cross-game cards need a distinct game per leg
    const combos = buildCombinations(pool, { legCount, maxCards: 24, distinctGames: true, maxMeanCorrelation: 0.6 });
    for (const legs of combos) {
      const key = legs.map((l) => l.legId).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const combined = combinedAmerican(legs.map((l) => l.odds));
      if (combined == null) continue;
      const bucket = getRiskBucketForCombinedOdds(combined);
      if (!bucket) continue; // combined shorter than -200 → too short to be a sensible parlay
      attempted[bucket]++;
      if (byBucket[bucket].length < PER_BUCKET_CAP) byBucket[bucket].push(legs);
    }
  }

  for (const level of RISK_LEVEL_ORDER) {
    byBucket[level].forEach((legs, i) => parlays.push(assembleParlay(legs, { date, riskLevel: level, parlayType: "cross_game", index: i })));
    notes.push({
      riskLevel: level, generated: byBucket[level].length, requested: PER_BUCKET_CAP,
      reason: byBucket[level].length > 0 ? null
        : attempted[level] > 0 ? "every candidate in this band was a duplicate or over-cap"
        : level === "low" ? "no_two_leg_combo_in_low_risk_band: no 2+-leg combo priced into -200..+100 after the -500 leg guard"
        : distinctGames < 2 ? "not_enough_distinct_games: fewer than two pre-event games available"
        : "no combo priced into this band from the qualified pool",
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

  const pool = eligible.filter((l) => l.eligible && BALANCED_QUALITY.includes(l.legQualityTier as typeof BALANCED_QUALITY[number]));
  const soccer = pool.filter((l) => l.sport === "WORLD_CUP").sort((a, b) => b.legQualityScore - a.legQualityScore);
  const nonSoccer = pool.filter((l) => l.sport !== "WORLD_CUP").sort((a, b) => b.legQualityScore - a.legQualityScore);
  const byBucket: Record<RiskLevel, EligibleLeg[][]> = { low: [], medium: [], high: [], longshot: [] };
  const attempted: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, longshot: 0 };
  const seen = new Set<string>();

  // Balanced cross-sport inventory: each card = ≥1 World Cup anchor + (legCount-1) non-soccer legs from
  // distinct games, non-correlated. Spread leg counts 2→6 so the combined-odds bucketer fills every band.
  for (const legCount of LEG_COUNT_SPREAD) {
    for (const anchor of soccer) {
      const legs = [anchor];
      const games = new Set([anchor.eventId]);
      for (const cand of nonSoccer) {
        if (legs.length >= legCount) break;
        if (games.has(cand.eventId)) continue;
        if (!legs.every((l) => meanCorrelation([l, cand]) < 0.6)) continue;
        legs.push(cand);
        games.add(cand.eventId);
      }
      if (legs.length < legCount || legs.length < 2) continue;
      if (!legs.some((l) => l.sport !== "WORLD_CUP")) continue; // must span ≥2 sports
      const key = legs.map((l) => l.legId).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const combined = combinedAmerican(legs.map((l) => l.odds));
      if (combined == null) continue;
      const bucket = getRiskBucketForCombinedOdds(combined);
      if (!bucket) continue;
      attempted[bucket]++;
      if (byBucket[bucket].length < PER_BUCKET_CAP) byBucket[bucket].push(legs);
    }
  }

  for (const level of RISK_LEVEL_ORDER) {
    byBucket[level].forEach((legs, i) => parlays.push(assembleParlay(legs, { date, riskLevel: level, parlayType: "cross_game", index: i })));
    notes.push({
      riskLevel: level, generated: byBucket[level].length, requested: PER_BUCKET_CAP,
      reason: byBucket[level].length > 0 ? null
        : attempted[level] > 0 ? "every cross-sport candidate in this band was a duplicate or over-cap"
        : level === "low" ? "no_two_leg_combo_in_low_risk_band: no cross-sport 2-leg combo priced into -200..+100"
        : (soccer.length === 0 || nonSoccer.length === 0) ? "missing one sport's eligible legs for a cross-sport card"
        : "no cross-sport combo priced into this band from distinct, non-correlated games",
    });
  }

  return { date, parlays, notes };
}
