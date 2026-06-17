/**
 * Eligible-leg pool — convert methodology AdaptedPredictions into EligibleLegs with eligibility +
 * quality resolved. A leg is eligible ONLY if it passed leakage, is not No Bet, the event has not
 * started, odds/line are valid (market-aware), the market scope is valid, the sport extractor is
 * wired, and no critical data is missing/stale. Pure (caller supplies `nowIso`).
 */
import type { AdaptedPrediction, SportExtractionResult, MarketScope } from "../methodology/adapter";
import type { EligibleLeg, LegContext, RiskTier, Sport } from "./types";
import { scoreLeg } from "./leg-scoring";

export function riskTierOf(riskScore: number): RiskTier {
  return riskScore >= 0.6 ? "high" : riskScore >= 0.35 ? "elevated" : "low";
}

/** Derive the market scope from sport + market type. WC distinguishes 90-min vs advancement. */
export function deriveMarketScope(sport: Sport, marketType: string): MarketScope {
  if (sport === "WORLD_CUP") {
    if (/advancement|to_qualify|to_win_outright|reach_|to_advance|to_lift|outright/i.test(marketType)) return "advancement";
    if (/_90$|moneyline_90|double_chance|match_total|btts|draw_no_bet|^player_|corners|team_total|over|under/i.test(marketType)) return "90_minutes";
    return "unknown";
  }
  if (sport === "UFC") return "full_fight";
  return "full_game"; // MLB / NBA
}

/** Normalize a pick/side into an opposable token (over/under/yes/no) or null. */
export function normalizeSide(raw: string | null | undefined, marketType: string, participant: string): string | null {
  const hay = `${raw ?? ""} ${marketType} ${participant}`.toLowerCase();
  if (/(?:^|[_\s])over(?:$|[_\s])|\bover\b/.test(hay)) return "over";
  if (/(?:^|[_\s])under(?:$|[_\s])|\bunder\b/.test(hay)) return "under";
  if (/\byes\b/.test(hay)) return "yes";
  if (/\bno\b/.test(hay)) return "no";
  return null;
}

function eventStarted(startTime: string | null, nowIso: string): boolean {
  if (!startTime) return true; // unknown start = treat as ineligible (cannot prove pre-event)
  const s = Date.parse(startTime);
  const n = Date.parse(nowIso);
  if (Number.isNaN(s) || Number.isNaN(n)) return true;
  return s <= n;
}

export function toEligibleLeg(adapted: AdaptedPrediction, ctx: LegContext): EligibleLeg {
  const o = adapted.output;
  const snap = adapted.snapshot;
  const marketScope = deriveMarketScope(o.sport, o.predictionTarget);
  const riskTier = riskTierOf(o.riskScore);
  const startTime = snap.eventStartTime || null;

  const missingCritical = o.missingDataFlags.some((f) => f.critical);
  const staleCritical = o.staleDataFlags.length > 0; // any stale feed treated as critical for legs
  const smallSample = o.smallSampleFlags.length > 0;
  const dnpRisk = o.missingDataFlags.some((f) => f.field === "confirmed_lineup");
  const started = eventStarted(startTime, ctx.nowIso);
  const validOdds = !ctx.marketAware || (o.marketOdds != null && o.marketImpliedProbability != null);

  // ── Eligibility gates ──────────────────────────────────────────────────────────────────────
  const reasons: string[] = [];
  if (ctx.extractorStatus !== "wired") reasons.push(`sport extractor status ${ctx.extractorStatus}`);
  if (!o.leakageValidationPassed) reasons.push("leakage validation failed");
  if (o.confidenceScore === "No Bet") reasons.push("confidence No Bet");
  if (missingCritical) reasons.push("critical data missing");
  if (staleCritical) reasons.push("critical data stale");
  if (!validOdds) reasons.push("missing/invalid odds for market-aware leg");
  if (started) reasons.push("event already started / completed");
  if (marketScope === "unknown") reasons.push("market scope unknown");
  const eligible = reasons.length === 0;

  const quality = scoreLeg({
    confidenceTier: o.confidenceScore,
    riskScore: o.riskScore,
    dataQualityGrade: o.dataQuality,
    edge: o.edge,
    marketAware: ctx.marketAware,
    hasOdds: o.marketOdds != null,
    marketScopeUnknown: marketScope === "unknown",
    staleCritical,
    missingCritical,
    smallSample,
    dnpRisk,
    baseEligible: eligible,
  });

  const correlationTags = [
    `sport:${o.sport}`,
    `game:${o.eventId}`,
    `participant:${o.participant}`,
    `market:${o.predictionTarget}`,
    `scope:${marketScope}`,
  ];
  const exposureTags = [`game:${o.eventId}`, `participant:${o.participant}`, `market:${o.predictionTarget}`];

  return {
    legId: `${o.sport}:${o.eventId}:${o.predictionTarget}:${o.participant}:${o.line ?? ""}`,
    sport: o.sport,
    eventId: o.eventId,
    gameId: o.eventId,
    marketType: o.predictionTarget,
    marketScope,
    side: normalizeSide(adapted.side, o.predictionTarget, o.participant),
    participantId: null,
    participantName: o.participant,
    teamId: null,
    teamName: null,
    opponentId: null,
    opponentName: null,
    line: o.line,
    odds: o.marketOdds,
    book: null,
    modelProjection: o.modelProjection,
    modelProbability: o.modelProbability,
    marketImpliedProbability: o.marketImpliedProbability,
    edge: o.edge,
    confidenceScore: o.confidenceScore,
    confidenceTier: o.confidenceScore,
    riskScore: o.riskScore,
    riskTier,
    dataQualityGrade: o.dataQuality,
    leakageValidationPassed: o.leakageValidationPassed,
    missingDataFlags: o.missingDataFlags,
    staleDataFlags: o.staleDataFlags,
    smallSampleFlags: o.smallSampleFlags,
    topPositiveFactors: o.topPositiveFactors,
    topNegativeFactors: o.topNegativeFactors,
    correlationTags,
    exposureTags,
    startTime,
    snapshotTime: snap.predictionTime || null,
    eligible,
    ineligibilityReasons: reasons,
    legQualityScore: quality.score,
    legQualityTier: quality.tier,
  };
}

/** Build all legs for one sport's extraction result (eligibility resolved against `nowIso`). */
export function buildLegsForSport(result: SportExtractionResult, nowIso: string, marketAware: boolean): EligibleLeg[] {
  const ctx: LegContext = { nowIso, extractorStatus: result.extractorStatus, marketAware };
  return result.predictions.map((p) => toEligibleLeg(p, ctx));
}

/** Build the full cross-sport leg pool. Pass the per-sport extraction results. */
export function buildLegPool(results: SportExtractionResult[], nowIso: string, marketAware: boolean): EligibleLeg[] {
  return results.flatMap((r) => buildLegsForSport(r, nowIso, marketAware));
}

export function eligibleLegs(pool: EligibleLeg[]): EligibleLeg[] {
  return pool.filter((l) => l.eligible);
}
