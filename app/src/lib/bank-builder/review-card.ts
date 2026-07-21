/**
 * Bank Builder REVIEW CARD reader — surfaces a lane's ACTIVE review-mode Step card directly from the
 * dual-bank-builder ladder artifact, LOSSLESSLY. The generic ui-loader (`minimalLeg`) hardcodes
 * marketImpliedProbability/edge to null and drops the matchup, but a review card needs model prob,
 * market prob, edge, line + game to render leg-level clarity. A review card is PAPER · $0 — nothing is
 * placed; its legs are shown for founder/public review only.
 *
 * Hard rules: NEVER read `priorLane` (stopped history is never surfaced as active). Fail-closed → null
 * on any read/parse error, or when the active step has no legs (that is an "awaiting" lane). Pure read.
 */
import fs from "node:fs";
import path from "node:path";
import type { ClimbLeg } from "@/components/bank-builder/climb-hero";

export interface LaneReviewCard {
  step: number;
  combinedOdds: number | null;
  reviewNote: string | null;
  legs: ClimbLeg[];
}

/** Read a lane's active review card ($0 paper) from `methodology/launch/dual-bank-builder-active.json`.
 *  `root` is the public data dir (…/public/data). Returns null unless the lane has an ACTIVE reviewMode
 *  step carrying ≥1 leg. */
export function readLaneReviewCard(root: string, laneKey: "laneA" | "laneB"): LaneReviewCard | null {
  try {
    const raw = JSON.parse(
      fs.readFileSync(path.join(root, "methodology", "launch", "dual-bank-builder-active.json"), "utf8"),
    );
    const lane = raw?.run?.[laneKey];
    if (!lane) return null;
    const steps: any[] = Array.isArray(lane.steps) ? lane.steps : [];
    // The active review step: status active + reviewMode + carries legs. (No legs → the lane is awaiting.)
    const s = steps.find(
      (x) => x?.status === "active" && x?.reviewMode === true && Array.isArray(x?.legs) && x.legs.length > 0,
    );
    if (!s) return null;
    const legs: ClimbLeg[] = s.legs.map((l: any) => ({
      selection: String(l.label ?? l.displaySelection ?? l.participantName ?? ""),
      market: String(l.marketLabel ?? l.marketType ?? ""),
      odds: typeof l.odds === "number" ? l.odds : null,
      kickoff: l.kickoffEt ?? null,
      game: l.matchup ?? null,
      why: Array.isArray(l.reasonBullets) && l.reasonBullets.length ? String(l.reasonBullets[0]) : null,
      player: l.participantName ?? null,
      line: typeof l.line === "number" ? l.line : null,
      side: l.side ?? null,
      modelProb: typeof l.modelProbability === "number" ? l.modelProbability : null,
      marketProb: typeof l.marketImpliedProbability === "number" ? l.marketImpliedProbability : null,
      edgePct: typeof l.modelEdgePct === "number" ? l.modelEdgePct : null,
    }));
    return {
      step: Number(s.step ?? 1),
      combinedOdds: typeof s.combinedOdds === "number" ? s.combinedOdds : null,
      reviewNote: s.reviewNote ?? null,
      legs,
    };
  } catch {
    return null;
  }
}
