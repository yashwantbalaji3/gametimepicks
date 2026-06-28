/**
 * Cross-lane Bank Builder selector — picks Lane A + Lane B so the two lanes stay INDEPENDENT (no shared
 * game across lanes, so one game script can't swing both). Lane A is the SURVIVAL lane (the safest card
 * that reaches its rung goal); its games are then excluded and Lane B is the VALUE lane (the most
 * survivable card inside the +200..+700 band that still clears its rung goal — a bigger jump per win).
 * Both clear the same ladder rung goals, so the canonical money model is untouched. If the pool can't
 * fill the value band, Lane B falls back to the safest target-fit card (never a forced long-odds card).
 * Cross-sport (MLB + World Cup) supported end-to-end. Pure + deterministic. Never places exposure.
 */
import type { ModelPick } from "../world-cup/model-qualified-picks";
import { selectSafestTargetFitCard, selectValueTargetFitCard, type GeneratedLane, type LaneRung } from "./bank-builder-generation";

function withCrossLaneNote(lane: GeneratedLane, otherLane: "A" | "B"): GeneratedLane {
  return {
    ...lane,
    correlationNote: `Correlation checked: no shared game with Lane ${otherLane} — the two lanes can advance independently.`,
  };
}

export function selectCrossLaneBankBuilder(pool: ModelPick[], rungA: LaneRung, rungB: LaneRung): { laneA: GeneratedLane; laneB: GeneratedLane } {
  // Reserve enough distinct games for Lane B so a small slate still fields BOTH lanes: cap Lane A's
  // legs at (distinct games − 2) when games are scarce (no effect once the slate has ≥6 games). With a
  // 4-game window this yields the natural 2+2 split instead of Lane A grabbing 3 games and starving B.
  const distinctGames = new Set(
    pool.filter((p) => p.odds >= -650 && p.odds <= 400 && p.modelProbability > 0).map((p) => p.gameId),
  ).size;
  const laneAMaxLegs = Math.min(4, Math.max(2, distinctGames - 2));
  // Lane A first (survival: safest card at its target); then exclude Lane A's games so Lane B shares none.
  const laneA = selectSafestTargetFitCard(pool, rungA, new Set(), undefined, laneAMaxLegs);
  const usedGames = new Set(laneA.legs.map((l) => l.gameId));
  // Lane B: value lane (+200..+700, survivability-first), independent of Lane A's games.
  const laneB = selectValueTargetFitCard(pool, rungB, new Set(), usedGames);
  return {
    laneA: withCrossLaneNote(laneA, "B"),
    laneB: withCrossLaneNote(laneB, "A"),
  };
}
