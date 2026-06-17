/**
 * Combination optimizer — pick leg combinations that satisfy game-distinctness + correlation
 * constraints, maximizing average leg quality. Deterministic + pure. Never forces a card: if the
 * pool can't fill `legCount` under the constraints, it returns fewer (or none).
 */
import type { EligibleLeg } from "./types";
import { correlate, meanCorrelation } from "./correlation";

export interface ComboOptions {
  legCount: number;
  maxCards: number;
  distinctGames: boolean;      // cross-game cards require distinct eventIds
  sameGameOnly?: boolean;      // same-game cards require one eventId
  maxMeanCorrelation: number;  // reject a card whose mean pairwise correlation exceeds this
}

function legSignature(legs: EligibleLeg[]): string {
  return legs.map((l) => l.legId).sort().join("|");
}

/** A card is valid if it has no conflicting pair and its mean correlation is within tolerance. */
export function cardIsValid(legs: EligibleLeg[], maxMeanCorrelation: number): { ok: boolean; reason: string | null } {
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const c = correlate(legs[i], legs[j]);
      if (c.correlationType === "conflicting") return { ok: false, reason: `conflicting legs: ${legs[i].legId} ↔ ${legs[j].legId}` };
      if (c.correlationType === "unknown") return { ok: false, reason: "unknown-scope leg in card" };
      if (c.correlationScore <= -0.5) return { ok: false, reason: "strong negative correlation" };
    }
  }
  const mc = meanCorrelation(legs);
  if (mc > maxMeanCorrelation) return { ok: false, reason: `mean correlation ${mc.toFixed(2)} > ${maxMeanCorrelation}` };
  return { ok: true, reason: null };
}

export function buildCombinations(pool: EligibleLeg[], opts: ComboOptions): EligibleLeg[][] {
  const sorted = [...pool].sort((a, b) => b.legQualityScore - a.legQualityScore);
  const cards: EligibleLeg[][] = [];
  const seen = new Set<string>();

  for (let start = 0; start < sorted.length && cards.length < opts.maxCards; start++) {
    const card: EligibleLeg[] = [sorted[start]];
    const games = new Set<string>([sorted[start].eventId]);

    for (let k = 0; k < sorted.length && card.length < opts.legCount; k++) {
      if (k === start) continue;
      const cand = sorted[k];
      if (opts.distinctGames && games.has(cand.eventId)) continue;
      if (opts.sameGameOnly && cand.eventId !== sorted[start].eventId) continue;
      const trial = [...card, cand];
      if (!cardIsValid(trial, opts.maxMeanCorrelation).ok) continue;
      card.push(cand);
      games.add(cand.eventId);
    }

    if (card.length === opts.legCount) {
      const sig = legSignature(card);
      if (!seen.has(sig)) {
        seen.add(sig);
        cards.push(card);
      }
    }
  }
  return cards;
}
