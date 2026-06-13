/**
 * Bank Builder Step 5 target-structure status. The owner-authorized final rung is the best
 * real 2-leg card from tonight's slate:
 *   1. one NBA Finals Game 5 leg + one MLB June-13 leg (cross-sport), or
 *   2. two NBA Finals Game 5 legs (same-game, correlation-screened).
 * (An earlier soccer-dependent target was retired; no soccer/credential dependency remains.)
 *
 * This computes each sport's REAL readiness from on-disk artifacts (no fabrication), so the
 * /bank-builder review panel — shown only when no official candidate is published — reflects
 * what the model is working with. A sport is "ready" when its board carries real
 * model-recommended legs (Over/Under, not no-play); "pending" otherwise.
 *
 * Pure (fs reads via existing loaders) — safe to unit-test.
 */
import { getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import { getMlbBoardForDate, activeMlbDate } from "@/lib/data-mlb";
import { currentEtDate } from "@/lib/freshness";

export type LegState = "ready" | "pending";

export interface Step5LegStatus {
  label: string;
  sport: "nba" | "mlb";
  state: LegState;
  detail: string;
  recommendedCount: number;
}

export interface Step5TargetStatus {
  targetLabel: string;
  legs: Step5LegStatus[];
  canPublish: boolean;
  nextAction: string;
}

/** NBA Finals Game 5: ready when the active board has real model-recommended legs. */
function nbaLegStatus(): Step5LegStatus {
  // Target TODAY's slate (the Game 5 board), not a later empty future schedule date.
  const dates = getAvailableBoardDates();
  const today = currentEtDate();
  const withProps = dates.filter((d) => (getBoardForDate(d).leans?.length ?? 0) > 0);
  const date = (dates.includes(today) && (getBoardForDate(today).leans?.length ?? 0) > 0)
    ? today
    : withProps.length ? withProps[withProps.length - 1] : (dates[dates.length - 1] ?? "");
  const leans = (date ? getBoardForDate(date).leans ?? [] : []) as Array<{ lean?: string }>;
  const recommended = leans.filter((l) => l.lean === "Over" || l.lean === "Under");
  if (recommended.length === 0) {
    return { label: "NBA Finals Game 5", sport: "nba", state: "pending", recommendedCount: 0,
      detail: "No model-recommended Game 5 prop on the board yet." };
  }
  return { label: "NBA Finals Game 5", sport: "nba", state: "ready", recommendedCount: recommended.length,
    detail: `${recommended.length} model-recommended Game 5 prop${recommended.length === 1 ? "" : "s"} with real odds.` };
}

/** MLB June 13: ready when the active board has real model-recommended legs. */
function mlbLegStatus(): Step5LegStatus {
  const date = activeMlbDate();
  const leans = (date ? getMlbBoardForDate(date).leans ?? [] : []) as Array<{ lean?: string }>;
  const recommended = leans.filter((l) => l.lean === "Over" || l.lean === "Under");
  if (recommended.length === 0) {
    return { label: "MLB June 13 slate", sport: "mlb", state: "pending", recommendedCount: 0,
      detail: "No model-recommended MLB prop on the board yet." };
  }
  return { label: "MLB June 13 slate", sport: "mlb", state: "ready", recommendedCount: recommended.length,
    detail: `${recommended.length} model-recommended MLB prop${recommended.length === 1 ? "" : "s"} with real odds.` };
}

export function loadStep5TargetStatus(): Step5TargetStatus {
  const nba = nbaLegStatus();
  const mlb = mlbLegStatus();
  const legs = [nba, mlb];
  // The model can build a 2-leg card as long as the NBA Finals board has recommended legs
  // (NBA+NBA), and a cross-sport pair is also available when MLB has recommended legs.
  const canPublish = nba.state === "ready";
  const nextAction = canPublish
    ? "The model is evaluating NBA Finals and MLB legs for a 2-leg card that can take $3,623.97 to $10,000+."
    : "Waiting on model-recommended Game 5 legs before the final 2-leg card can be built.";
  return {
    targetLabel: "Best real 2-leg card from NBA Finals + MLB, or two NBA Finals legs",
    legs,
    canPublish,
    nextAction,
  };
}
