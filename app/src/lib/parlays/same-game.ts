/**
 * Game-specific (same-game) parlay generator. Builds suggested combinations from legs of ONE event,
 * where justified positive correlation is allowed but conflicting combinations are rejected. Pure.
 */
import type { EligibleLeg, SuggestedParlay, RiskLevel } from "./types";
import { buildCombinations, cardIsValid } from "./combination-optimizer";
import { assembleParlay } from "./daily-parlays";
import { RISK_LEVELS } from "./risk-levels";

export interface SameGameResult {
  gameId: string;
  sport: EligibleLeg["sport"];
  parlays: SuggestedParlay[];
  note: string | null;
}

/**
 * Same-game parlays for one event. Allows same-game positive correlation (so `maxMeanCorrelation`
 * is relaxed), but `cardIsValid` still blocks conflicting / strong-negative / unknown-scope pairs.
 */
export function generateSameGameParlays(gameLegs: EligibleLeg[], date: string, level: RiskLevel = "medium"): SameGameResult {
  const eligible = gameLegs.filter((l) => l.eligible);
  const gameId = gameLegs[0]?.eventId ?? "";
  const sport = gameLegs[0]?.sport ?? "MLB";
  const spec = RISK_LEVELS[level];

  if (eligible.length < 2) {
    return { gameId, sport, parlays: [], note: `not enough eligible legs in this game (have ${eligible.length}, need 2)` };
  }

  // Same-game tolerates positive correlation up to a high bound (justified), but never conflicts.
  const combos = buildCombinations(eligible, {
    legCount: Math.min(spec.maxLegs, Math.max(2, Math.min(3, eligible.length))),
    maxCards: 3,
    distinctGames: false,
    sameGameOnly: true,
    maxMeanCorrelation: 0.9,
  });
  // Defensive: drop any card that somehow contains a conflicting pair.
  const valid = combos.filter((c) => cardIsValid(c, 0.9).ok);

  const parlays = valid.map((legs, i) => {
    const p = assembleParlay(legs, { date, riskLevel: level, parlayType: "same_game", index: i });
    // Same-game cards across different fixtures share (date,risk,type,index,sport); scope the id by
    // gameId so it is globally unique (deterministic) — prevents cross-fixture collisions / React-key dupes.
    return { ...p, parlayId: `${p.parlayId}:${gameId}` };
  });

  return {
    gameId,
    sport,
    parlays,
    note: parlays.length === 0 ? "no non-conflicting same-game combination available" : null,
  };
}

/** Group an eligible-leg pool by game and produce same-game parlays per game. */
export function generateAllSameGameParlays(eligible: EligibleLeg[], date: string, level: RiskLevel = "medium"): SameGameResult[] {
  const byGame = new Map<string, EligibleLeg[]>();
  for (const l of eligible) {
    if (!byGame.has(l.eventId)) byGame.set(l.eventId, []);
    byGame.get(l.eventId)!.push(l);
  }
  return Array.from(byGame.values())
    .map((legs) => generateSameGameParlays(legs, date, level))
    .filter((r) => r.parlays.length > 0);
}
