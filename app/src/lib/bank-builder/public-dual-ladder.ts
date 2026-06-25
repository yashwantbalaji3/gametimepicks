/**
 * Public Dual Bank Builder ladder VIEW MODEL — turns a lane's engine state into a clean 5-step ladder
 * for the public /bank-builder board, with the hard rule that STOPPED / failed-step history never
 * surfaces. A stopped lane (publicVisible:false) is shown as a clean queued Step-1 starting path; its
 * real (lost) steps are NOT read here — they live only in priorLane / Mr. Dub. Pure + deterministic.
 */
import { BANK_BUILDER_LADDER } from "@/lib/bank-builder-ladder";
import type { LaneDisplay, LaneStepDisplay } from "@/lib/parlays/ui-loader";

export type PublicStepStatus = "cleared" | "active" | "awaiting" | "queued" | "upcoming";
export type PublicLaneStatus = "active" | "advanced" | "awaiting_next_card" | "queued_restart" | "completed";

export interface PublicLadderStep {
  step: number;            // 1..5
  startTarget: number;     // ladder target stake (e.g. 100)
  goalTarget: number;      // ladder target return (e.g. 200)
  multiplier: number;      // goal / start
  status: PublicStepStatus;
  actualStake: number | null;   // real stake when the step has a card
  actualReturn: number | null;  // settled or projected return when the step has a card
  result: string | null;        // "won" for a cleared step
  card: LaneStepDisplay | null; // the public card (legs) for this step — never a lost step
  candidate: LaneDisplay["nextCandidate"]; // next-step candidate / reason when no card placed (awaiting/queued)
}

export interface PublicDualLadderView {
  laneId: "lane-a" | "lane-b";
  label: string;
  headline: string;
  currentStatus: PublicLaneStatus;
  currentStep: number;
  currentStake: number;
  steps: PublicLadderStep[];
}

const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

export function buildPublicDualLadder(lane: LaneDisplay | null, laneId: "lane-a" | "lane-b"): PublicDualLadderView | null {
  if (!lane) return null;
  const label = laneId === "lane-a" ? "Lane A" : "Lane B";
  // A stopped lane is presented publicly as a clean queued Step-1 starting path — its real (lost) steps
  // are never read here. publicVisible:false OR a queued restart both mean "show the starting path".
  const isQueuedRestart = lane.publicVisible === false || lane.laneStatus === "stopped" || lane.restart?.status === "queued";

  if (isQueuedRestart) {
    const stake = lane.restart?.stake ?? 100;
    const steps: PublicLadderStep[] = BANK_BUILDER_LADDER.map((s) => ({
      step: s.step, startTarget: s.start, goalTarget: s.goal, multiplier: s.multiplier,
      status: s.step === 1 ? "queued" : "upcoming",
      actualStake: s.step === 1 ? stake : null, actualReturn: null, result: null, card: null,
      candidate: s.step === 1 ? lane.nextCandidate ?? null : null,
    }));
    return {
      laneId, label,
      headline: `Starting path · Step 1 next qualified card (${usd(stake)})`,
      currentStatus: "queued_restart", currentStep: 1, currentStake: stake, steps,
    };
  }

  // Active / advanced lane: map each ladder rung to the lane's real step, hiding any lost step.
  const byStep = new Map<number, LaneStepDisplay>();
  for (const s of lane.steps ?? []) byStep.set(s.step, s);
  const currentStep = lane.currentStep || 1;
  let clearedPayout = 0;

  const steps: PublicLadderStep[] = BANK_BUILDER_LADDER.map((rung) => {
    const real = byStep.get(rung.step);
    let status: PublicStepStatus = "upcoming";
    let card: LaneStepDisplay | null = null;
    let actualStake: number | null = null;
    let actualReturn: number | null = null;
    let result: string | null = null;

    if (real) {
      if (real.status === "settled" && real.result === "won") {
        status = "cleared"; card = real; actualStake = real.stake; actualReturn = real.payout; result = "won";
        clearedPayout = real.payout ?? clearedPayout;
      } else if (real.status === "pending") {
        status = "active"; card = real; actualStake = real.stake; actualReturn = real.payout;
      } else if (real.status === "evaluating") {
        status = "active"; card = real; actualStake = real.stake; actualReturn = real.payout;
      } else if ((real.status === "coming_soon" || (real.status as string) === "awaiting") && rung.step === currentStep) {
        status = "awaiting"; // the next rung this lane is riding toward, no card placed yet
      }
      // a settled LOST step is intentionally left as "upcoming" with no card — never surfaced.
    }
    return { step: rung.step, startTarget: rung.start, goalTarget: rung.goal, multiplier: rung.multiplier, status, actualStake, actualReturn, result, card, candidate: status === "awaiting" ? lane.nextCandidate ?? null : null };
  });

  const hasActiveCard = steps.some((s) => s.status === "active");
  const clearedCount = steps.filter((s) => s.status === "cleared").length;
  let awaiting = steps.find((s) => s.status === "awaiting");
  // When a lane has cleared its current rung but `currentStep` didn't advance past it (the next card
  // hasn't been generated yet), surface the NEXT rung as "awaiting next qualified card" — so a fully
  // cleared lane invites its next card instead of looking stale/done. No card is placed; no exposure.
  if (!awaiting && !hasActiveCard && clearedCount > 0) {
    const lastCleared = Math.max(0, ...steps.filter((s) => s.status === "cleared").map((s) => s.step));
    const next = steps.find((s) => s.step > lastCleared && s.status === "upcoming");
    if (next) { next.status = "awaiting"; next.candidate = lane.nextCandidate ?? null; awaiting = next; }
  }

  // A lane that cleared EVERY rung has COMPLETED the $10k ladder — the product's goal. Surface it as a
  // celebrated terminal state (banking is operator-gated), never the generic "active" fall-through.
  const isCompleted = lane.laneStatus === "completed" || (steps.length > 0 && clearedCount === steps.length);
  const finalStep = steps.filter((s) => s.status === "cleared").sort((a, b) => b.step - a.step)[0];
  const finalValue = finalStep?.actualReturn ?? finalStep?.actualStake ?? clearedPayout ?? 0;
  const advanced = lane.laneStatus === "advanced" || !!awaiting;
  const currentStatus: PublicLaneStatus = isCompleted
    ? "completed"
    : hasActiveCard ? "active"
    : awaiting ? "awaiting_next_card" : advanced ? "advanced" : "active";
  // Next stake = the rolled balance from the last cleared step (advanced) or the active step's stake.
  const activeStep = steps.find((s) => s.status === "active");
  const currentStake = activeStep?.actualStake ?? (clearedPayout || lane.restart?.stake || 100);

  const headline = isCompleted
    ? `🏆 $10K REACHED — ladder COMPLETE (final ${usd(finalValue)}). Banking the completed run is operator-gated.`
    : activeStep
      ? `Step ${activeStep.step} active · ${usd(activeStep.actualStake ?? 0)} riding`
      : awaiting
        ? `${clearedCount} step${clearedCount === 1 ? "" : "s"} cleared · Step ${awaiting.step} awaiting next qualified card`
        : `${clearedCount} step${clearedCount === 1 ? "" : "s"} cleared`;

  return { laneId, label, headline, currentStatus, currentStep, currentStake, steps };
}
