/**
 * Correlation engine — score each leg pair so the parlay/Bank-Builder layers can allow justified
 * positive correlation (same-game) and BLOCK conflicting / strong-negative / unknown-heavy combos.
 * Critically: a World Cup 90-minute result and an advancement market are NEVER treated as the same
 * market (marketScopeConflict), and same-match opposite outcomes are conflicting.
 */
import type { EligibleLeg, CorrelationResult, CorrelationType } from "./types";

function tag(leg: EligibleLeg, prefix: string): string | undefined {
  return leg.correlationTags.find((t) => t.startsWith(prefix + ":"));
}

/** Opposite over/under (or yes/no) sides — a direct conflict. Uses the resolved leg `side`. */
function opposingSides(a: EligibleLeg, b: EligibleLeg): boolean {
  const oppose = (x: string | null, y: string | null) =>
    (x === "over" && y === "under") || (x === "under" && y === "over") ||
    (x === "yes" && y === "no") || (x === "no" && y === "yes");
  return oppose(a.side, b.side);
}

const POSITIVE_PAIRS: Array<[RegExp, RegExp]> = [
  [/assist/i, /points|goal/i],
  [/team_total|match_total|total_goals/i, /points|total_bases|rbi|goal|shots/i],
  [/total_bases/i, /team_total|rbi/i],
  [/shots/i, /corners|team_total|goal/i],
  [/goal_scorer|anytime/i, /team_total|match_total|goal/i],
  [/distance|goes_distance/i, /over.*round|round.*over/i],
];

const NEGATIVE_PAIRS: Array<[RegExp, RegExp]> = [
  [/pitcher_strikeouts/i, /hits|total_bases|rbi/i], // pitcher Ks vs opposing batter production
  [/pitcher_outs/i, /team_total/i],
  [/goalkeeper_saves/i, /shots_on_target|shots/i],
  [/under.*round|round.*under/i, /significant_strikes|strikes/i],
];

export function correlate(a: EligibleLeg, b: EligibleLeg): CorrelationResult {
  const sameGameFlag = a.eventId === b.eventId && !!a.eventId;
  const sameSportFlag = a.sport === b.sport;
  const samePlayerFlag = !!a.participantName && a.participantName === b.participantName;
  const teamA = tag(a, "team");
  const teamB = tag(b, "team");
  const sameTeamFlag = !!teamA && teamA === teamB;
  const marketScopeConflictFlag = sameGameFlag && a.marketScope !== b.marketScope &&
    (a.marketScope === "advancement" || b.marketScope === "advancement");

  // Same participant, opposite side (over & under of the same stat) → hard conflict.
  const samePlayerOppositeSide = samePlayerFlag && opposingSides(a, b);

  let correlationType: CorrelationType = sameGameFlag ? "neutral" : "neutral";
  let correlationScore = 0;
  let explanation = "Different events — treated as independent (neutral).";
  let marketConflictFlag = false;

  if (a.marketScope === "unknown" || b.marketScope === "unknown") {
    correlationType = "unknown";
    correlationScore = 0;
    explanation = "At least one leg has an unknown market scope — correlation is unknown and penalized.";
  } else if (samePlayerOppositeSide) {
    correlationType = "conflicting";
    correlationScore = -0.95;
    marketConflictFlag = true;
    explanation = "Same participant, opposite side of the same market — directly conflicting.";
  } else if (marketScopeConflictFlag) {
    // 90-minute result vs advancement on the same match are DIFFERENT markets — never equivalent.
    correlationType = "fragile";
    correlationScore = 0.2;
    explanation = "Same match but mixed scope (90-minute vs advancement) — not the same market; flagged, not equivalent.";
  } else if (sameGameFlag) {
    const posHit = POSITIVE_PAIRS.some(([x, y]) => (x.test(a.marketType) && y.test(b.marketType)) || (x.test(b.marketType) && y.test(a.marketType)));
    const negHit = NEGATIVE_PAIRS.some(([x, y]) => (x.test(a.marketType) && y.test(b.marketType)) || (x.test(b.marketType) && y.test(a.marketType)));
    const opposingTotals = opposingSides(a, b);
    if (negHit) {
      correlationType = "conflicting";
      correlationScore = -0.7;
      marketConflictFlag = true;
      explanation = "Same game, markets that fight each other (one side needs what the other denies).";
    } else if (opposingTotals && sameTeamFlag) {
      correlationType = "negative";
      correlationScore = -0.5;
      explanation = "Same team, opposite total directions — negatively correlated.";
    } else if (posHit) {
      correlationType = "positive";
      correlationScore = 0.55;
      explanation = "Same game, mutually reinforcing markets — justified positive correlation.";
    } else {
      correlationType = "positive";
      correlationScore = 0.3;
      explanation = "Same game — mild shared-game correlation.";
    }
  }

  const opposingTeamFlag = sameGameFlag && !sameTeamFlag && !!teamA && !!teamB;
  const exposureConflictFlag = samePlayerFlag && a.marketType === b.marketType && a.line === b.line;

  return {
    correlationScore,
    correlationType,
    correlationExplanation: explanation,
    sameGameFlag,
    sameTeamFlag,
    samePlayerFlag,
    opposingTeamFlag,
    marketConflictFlag,
    exposureConflictFlag,
    sameSportFlag,
    marketScopeConflictFlag,
  };
}

/** Worst (most negative / most fragile) pairwise correlation across a set of legs. */
export function setCorrelation(legs: EligibleLeg[]): { worst: CorrelationResult | null; maxAbsScore: number; anyConflict: boolean; anyUnknown: boolean } {
  let worst: CorrelationResult | null = null;
  let maxAbsScore = 0;
  let anyConflict = false;
  let anyUnknown = false;
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const c = correlate(legs[i], legs[j]);
      if (c.correlationType === "conflicting") anyConflict = true;
      if (c.correlationType === "unknown") anyUnknown = true;
      if (Math.abs(c.correlationScore) > maxAbsScore || (c.correlationType === "conflicting" && (!worst || worst.correlationType !== "conflicting"))) {
        maxAbsScore = Math.max(maxAbsScore, Math.abs(c.correlationScore));
        worst = c;
      }
    }
  }
  return { worst, maxAbsScore, anyConflict, anyUnknown };
}

/** Mean pairwise correlation score (signed) — used for summaries. */
export function meanCorrelation(legs: EligibleLeg[]): number {
  const scores: number[] = [];
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) scores.push(correlate(legs[i], legs[j]).correlationScore);
  if (scores.length === 0) return 0;
  return scores.reduce((s, x) => s + x, 0) / scores.length;
}
