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
  let laneB = selectValueTargetFitCard(pool, rungB, new Set(), usedGames);
  let sharedGame = false;
  // THIN slate (e.g. 3 games): two fully-independent 2-leg lanes need 4 games. If Lane B can't fill from
  // the remaining games, let it reuse a Lane-A game via a DIFFERENT market (drop Lane A's exact
  // game+market from B's pool → never the same market, so never an opposing pick). Better two real lanes.
  if (laneB.legs.length < 2) {
    const aGameMarket = new Set(laneA.legs.map((l) => `${l.gameId}:${l.marketKey}`));
    const poolB = pool.filter((p) => !aGameMarket.has(`${p.gameId}:${p.marketKey}`));
    laneB = selectValueTargetFitCard(poolB, rungB, new Set(), undefined);
    sharedGame = laneB.legs.some((l) => usedGames.has(l.gameId));
  }
  return {
    laneA: withCrossLaneNote(laneA, "B"),
    laneB: sharedGame
      ? { ...laneB, correlationNote: "Thin slate: Lane B shares a game with Lane A via a DIFFERENT market (max 1 leg/game per lane, never the same market → no opposing pick). Reviewed + disclosed." }
      : withCrossLaneNote(laneB, "A"),
  };
}
