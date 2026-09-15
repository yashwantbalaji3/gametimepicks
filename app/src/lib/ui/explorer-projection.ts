/**
 * EXPLORER PROJECTION (Phase 5F · /mlb weight). The player-props explorer is a client component, so every field of
 * every lean it receives is serialised into the page payload beside the HTML. It renders eighteen fields (sixteen on the cards, two in the ranked view); a full
 * `PublicProjection` carries twenty-six. This is the server-side projection to exactly what the explorer, its cards and
 * its grouping read — nothing rendered is lost, and a page that still hands the explorer full rows keeps working
 * (the type is a subset). Measured on /mlb: the explorer array was 656 KB of a 1,412 KB payload; the dropped fields
 * were ≈ 100 KB of it.
 */
import type { PublicProjection } from "@/lib/normalize";

export type ExplorerProjection = Pick<PublicProjection,
  "id" | "market" | "marketLabel" | "player" | "recentGames" | "projectionValue" | "pickLabel" | "line" | "americanOdds" |
  "bookmaker" | "modelProbability" | "marketProbability" | "edgePct" | "parlayEligible" | "lineupStatus" | "caveats" |
  "participantType" | "confidence">;

export const EXPLORER_FIELDS = ["id", "market", "marketLabel", "player", "recentGames", "projectionValue", "pickLabel", "line", "americanOdds", "bookmaker", "modelProbability", "marketProbability", "edgePct", "parlayEligible", "lineupStatus", "caveats", "participantType", "confidence"] as const;

export function toExplorerProjection(p: PublicProjection): ExplorerProjection {
  const out: Partial<PublicProjection> = {};
  for (const k of EXPLORER_FIELDS) if (p[k] !== undefined) (out as Record<string, unknown>)[k] = p[k];
  return out as ExplorerProjection;
}
