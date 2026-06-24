/**
 * Cross-lane Bank Builder selector — picks Lane A + Lane B so the two lanes stay INDEPENDENT (no shared
 * game across lanes, so one game script can't swing both). It delegates to the probability-fit safest-card
 * selector (`selectSafestTargetFitCard`): Lane A is chosen first to maximize its combined hit probability
 * at its rung target; Lane A's games are then excluded and Lane B is chosen the same way. Cross-sport
 * (MLB + World Cup) is supported end-to-end. Pure + deterministic. Never places exposure ($100 seed/lane).
 */
import type { ModelPick } from "../world-cup/model-qualified-picks";
import { selectSafestTargetFitCard, type GeneratedLane, type LaneRung } from "./bank-builder-generation";

function withCrossLaneNote(lane: GeneratedLane, otherLane: "A" | "B"): GeneratedLane {
  return {
    ...lane,
    correlationNote: `Correlation checked: no shared game with Lane ${otherLane} — the two lanes can advance independently.`,
  };
}

export function selectCrossLaneBankBuilder(pool: ModelPick[], rungA: LaneRung, rungB: LaneRung): { laneA: GeneratedLane; laneB: GeneratedLane } {
  // Lane A first (safest card at its target); then exclude Lane A's games so Lane B shares none of them.
  const laneA = selectSafestTargetFitCard(pool, rungA, new Set());
  const usedGames = new Set(laneA.legs.map((l) => l.gameId));
  const laneB = selectSafestTargetFitCard(pool, rungB, new Set(), usedGames);
  return {
    laneA: withCrossLaneNote(laneA, "B"),
    laneB: withCrossLaneNote(laneB, "A"),
  };
}
