/**
 * COMPACT PREDICTION RENDERINGS (Sprint 009 · Phase 9). Small, surface-agnostic strings derived from the ONE
 * canonical decision object, so /today, the homepage, and social drafts all state the SAME answer as the Game
 * Report hero. Pure formatting — no new decision logic lives here.
 */
import type { GamePredictionDecision } from "./types";

/**
 * A one-line prediction for compact surfaces: "SF · UNDER 8.5 · LAA +1.5". Returns null when the game has no
 * directional prediction (unavailable). Never invents a market family that is unavailable.
 */
export function compactPredictionLine(d: GamePredictionDecision | null | undefined): string | null {
  if (!d || !d.predictedWinner) return null;
  const parts: string[] = [d.predictedWinner.team];
  if (d.total && d.total.pick !== "UNAVAILABLE") parts.push(`${d.total.pick} ${d.total.line}`);
  if (d.runLine) parts.push(d.runLine.pick);
  return parts.join(" · ");
}
