/**
 * Game-specific (same-game) parlay generator. Builds suggested combinations from legs of ONE event,
 * where justified positive correlation is allowed but conflicting combinations are rejected. Pure.
 */
import type { EligibleLeg, SuggestedParlay, RiskLevel } from "./types";
import { buildCombinations, cardIsValid } from "./combination-optimizer";
import { assembleParlay } from "./daily-parlays";
import { RISK_LEVELS, RISK_LEVEL_ORDER } from "./risk-levels";
import { combinedAmerican } from "./odds-math";
import { getRiskBucketForCombinedOdds } from "./risk-odds-bands";

/** Same-game leg-count spread → bigger stacks (team anchor + attacking props) reach High / Longshot. */
const SAME_GAME_SPREAD = [2, 3, 4, 5];
const SAME_GAME_BUCKET_CAP = 2; // per game, per risk bucket — keeps each game's drawer readable

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
export function generateSameGameParlays(gameLegs: EligibleLeg[], date: string, _level: RiskLevel = "medium"): SameGameResult {
  const eligible = gameLegs.filter((l) => l.eligible);
  const gameId = gameLegs[0]?.eventId ?? "";
  const sport = gameLegs[0]?.sport ?? "MLB";

  if (eligible.length < 2) {
    return { gameId, sport, parlays: [], note: `not enough eligible legs in this game (have ${eligible.length}, need 2)` };
  }

  // Balanced same-game inventory: build a deduplicated spread of stacks (2→5 legs), bucket each by its
  // COMBINED odds, and cap per bucket. Bigger stacks (team anchor + attacking props) reach High / Longshot
  // — same-game positive correlation is allowed (justified, disclosed), but conflicts are still blocked.
  const byBucket: Record<RiskLevel, EligibleLeg[][]> = { low: [], medium: [], high: [], longshot: [] };
  const seen = new Set<string>();
  for (const legCount of SAME_GAME_SPREAD) {
    if (legCount > eligible.length) break;
    const combos = buildCombinations(eligible, { legCount, maxCards: 12, distinctGames: false, sameGameOnly: true, maxMeanCorrelation: 0.9 });
    for (const legs of combos) {
      if (!cardIsValid(legs, 0.9).ok) continue;
      const key = legs.map((l) => l.legId).sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      const combined = combinedAmerican(legs.map((l) => l.odds));
      if (combined == null) continue;
      const bucket = getRiskBucketForCombinedOdds(combined);
      if (!bucket) continue;
      if (byBucket[bucket].length < SAME_GAME_BUCKET_CAP) byBucket[bucket].push(legs);
    }
  }

  const parlays: SuggestedParlay[] = [];
  for (const level of RISK_LEVEL_ORDER) {
    byBucket[level].forEach((legs, i) => {
      const p = assembleParlay(legs, { date, riskLevel: level, parlayType: "same_game", index: i });
      // Scope the id by gameId so it is globally unique (prevents cross-fixture collisions / React-key dupes).
      parlays.push({ ...p, parlayId: `${p.parlayId}:${gameId}` });
    });
  }

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
