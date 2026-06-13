/**
 * Bank Builder Step 5 target-structure status — the user's intended final rung is a
 * cross-sport 2-leg card: ONE Brazil-vs-Morocco World Cup leg + ONE NBA Finals Game 5 leg.
 *
 * This computes each leg's REAL readiness from on-disk artifacts (no fabrication), so the
 * /bank-builder review-pending panel can show exactly what is and isn't available and what
 * unblocks the card. A leg is "ready" only with real odds AND a real model recommendation;
 * "pending" when the model has no recommendation yet; "blocked" when the data source is
 * unavailable. The Step 5 card publishes ONLY when both legs are "ready".
 *
 * Pure (fs reads via existing loaders) — safe to unit-test.
 */
import { getBoardForDate, getAvailableBoardDates } from "@/lib/data";
import { loadWorldCupProjections } from "@/lib/world-cup/projections";
import { currentEtDate } from "@/lib/freshness";

export type LegState = "ready" | "pending" | "blocked";

export interface Step5LegStatus {
  label: string;
  sport: "world_cup" | "nba";
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

/** The NBA Finals Game 5 leg: ready only if the active NBA board has a real recommendation
 *  (a lean of Over/Under — not "No Play / insufficient_data"). */
function nbaLegStatus(): Step5LegStatus {
  // Target TODAY's slate (the Game 5 board), not a later empty future schedule date.
  // Prefer the date matching today's ET; else the latest board that actually has props.
  const dates = getAvailableBoardDates();
  const today = currentEtDate();
  const withProps = dates.filter((d) => (getBoardForDate(d).leans?.length ?? 0) > 0);
  const date = (dates.includes(today) && (getBoardForDate(today).leans?.length ?? 0) > 0)
    ? today
    : withProps.length ? withProps[withProps.length - 1] : (dates[dates.length - 1] ?? "");
  const board = date ? getBoardForDate(date) : null;
  const leans = (board?.leans ?? []) as Array<{ lean?: string }>;
  const recommended = leans.filter((l) => l.lean === "Over" || l.lean === "Under");
  if (!board || leans.length === 0) {
    return { label: "NBA Finals Game 5", sport: "nba", state: "pending", recommendedCount: 0,
      detail: "No NBA board for the current slate yet." };
  }
  if (recommended.length === 0) {
    return { label: "NBA Finals Game 5", sport: "nba", state: "pending", recommendedCount: 0,
      detail: `Model has no recommended Game 5 prop yet — ${leans.length} props are on the board but flagged no-play (insufficient game-log data).` };
  }
  return { label: "NBA Finals Game 5", sport: "nba", state: "ready", recommendedCount: recommended.length,
    detail: `${recommended.length} model-recommended Game 5 prop${recommended.length === 1 ? "" : "s"} with real odds.` };
}

/** The Brazil-vs-Morocco World Cup leg: ready only if real WC projections (odds + model)
 *  exist for a Brazil match. Blocked when the World Cup data source isn't configured. */
function brazilLegStatus(): Step5LegStatus {
  let proj: ReturnType<typeof loadWorldCupProjections> = null;
  try {
    proj = loadWorldCupProjections();
  } catch {
    proj = null;
  }
  const matches = (proj as { matches?: Array<{ home?: string; away?: string }> } | null)?.matches ?? [];
  const brazil = matches.find(
    (m) => /brazil/i.test(`${m.home ?? ""} ${m.away ?? ""}`) && /morocco/i.test(`${m.home ?? ""} ${m.away ?? ""}`),
  );
  if (!brazil) {
    return { label: "Brazil vs Morocco (World Cup)", sport: "world_cup", state: "blocked", recommendedCount: 0,
      detail: "World Cup projections aren't generated for this slate — the World Cup model needs an API-Football credential that isn't configured, so Brazil odds + model probability can't be produced honestly." };
  }
  return { label: "Brazil vs Morocco (World Cup)", sport: "world_cup", state: "ready", recommendedCount: 1,
    detail: "Real World Cup odds + model projection available for the Brazil match." };
}

export function loadStep5TargetStatus(): Step5TargetStatus {
  const brazil = brazilLegStatus();
  const nba = nbaLegStatus();
  const legs = [brazil, nba];
  const canPublish = legs.every((l) => l.state === "ready");
  let nextAction: string;
  if (canPublish) {
    nextAction = "Both legs are ready — the final card can be reviewed for publication.";
  } else if (brazil.state === "blocked") {
    nextAction = "Add an API-Football credential and generate the June 13 World Cup slate to unblock the Brazil leg.";
  } else if (nba.state === "pending") {
    nextAction = "Waiting on a model-recommended NBA Game 5 prop (the board currently has none).";
  } else {
    nextAction = "Both target legs must clear the model and market gates before the final card publishes.";
  }
  return {
    targetLabel: "Brazil vs Morocco (World Cup) + NBA Finals Game 5",
    legs,
    canPublish,
    nextAction,
  };
}
