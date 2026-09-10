/**
 * Public Dual Bank Builder ladder VIEW MODEL — turns a lane's engine state into a clean 5-step ladder
 * for the public /bank-builder board, with the hard rule that STOPPED / failed-step history never
 * surfaces. A stopped lane (publicVisible:false) is shown as a clean queued Step-1 starting path; its
 * real (lost) steps are NOT read here — they live only in priorLane / Mr. Dub. Pure + deterministic.
 */
import { BANK_BUILDER_LADDER } from "@/lib/bank-builder-ladder";
import { BANK_BUILDER_SEED, requiredAmericanForRung, rungProjection } from "@/lib/bank-builder/rung-economics.mjs";
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
  /**
   * The money the run CARRIES INTO this rung — the ladder's number, not the card's.
   *
   * The board shipped "Step 2 · from $200" beside "$100.00 Stake" because the stake was read off
   * the daily card, which is generated at a flat $100 whatever rung the lane stands on. A ladder
   * that compounds cannot stake the seed twice. Truth beats design: when the rung below actually
   * settled, its real payout is carried; otherwise the rung's own entry amount is used.
   */
  carriedStake: number;
  /** What today's card returns on `carriedStake`, and whether that reaches `goalTarget`. */
  projectedReturn: number | null;
  reachesTarget: boolean | null;
  shortfall: number | null;
  /** The price this rung needs to clear its target from `carriedStake` — what the selector must find. */
  requiredAmerican: number | null;
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
      // A restarting run is back at the seed by definition; every rung above shows its design entry.
      carriedStake: s.step === 1 ? BANK_BUILDER_SEED : s.start,
      projectedReturn: null, reachesTarget: null, shortfall: null,
      requiredAmerican: requiredAmericanForRung({ stake: s.step === 1 ? BANK_BUILDER_SEED : s.start, goalTarget: s.goal }),
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
    return {
      step: rung.step, startTarget: rung.start, goalTarget: rung.goal, multiplier: rung.multiplier,
      status, actualStake, actualReturn, result, card,
      candidate: status === "awaiting" ? lane.nextCandidate ?? null : null,
      // Filled in the coherence pass below, which needs every rung's status decided first.
      carriedStake: rung.start, projectedReturn: null, reachesTarget: null, shortfall: null, requiredAmerican: null,
    };
  });

  /*
   * ── COHERENCE PASS: A RUNG IS ONLY REACHED BY CLEARING THE ONE BELOW IT ──────────────────────
   *
   * The mapping above leaves a settled LOST step as "upcoming" so the public board never shows a
   * loss. That intent is right and its result was not: on 2026-09-10 Lane B rendered an ACTIVE
   * step 2 sitting above an "Upcoming" step 1, which is not a state the product has. Under the
   * ladder's own rule a lost card ends the run and the next one restarts at the seed — so there is
   * no way to stand on rung 2 with rung 1 unfinished.
   *
   * Hiding the loss is still correct; leaving the rung beneath looking unplayed is not. Every rung
   * below the one a lane is standing on is marked cleared, because that is the only way the lane
   * got there. The cleared DETAIL still comes from the ledger and stays absent when the ledger has
   * none — this asserts that the rung was passed, never how.
   */
  const standingIdx = steps.findIndex((s) => s.status === "active" || s.status === "awaiting");
  if (standingIdx > 0) {
    for (const below of steps.slice(0, standingIdx)) {
      if (below.status !== "cleared") { below.status = "cleared"; below.result = below.result ?? "won"; }
    }
  }

  /*
   * ── THE LADDER OWNS THE STAKE ────────────────────────────────────────────────────────────────
   *
   * Truth beats design: when the rung below actually settled, the run carries what it really paid.
   * Otherwise the rung's own entry amount stands, which is the number the board already promises.
   * Either way the seed is never staked twice.
   */
  let carried = BANK_BUILDER_SEED;
  for (const s of steps) {
    s.carriedStake = Number(carried.toFixed(2));
    s.requiredAmerican = requiredAmericanForRung({ stake: s.carriedStake, goalTarget: s.goalTarget });
    const odds = s.card?.combinedOdds ?? null;
    if (odds != null && (s.status === "active" || s.status === "cleared")) {
      const p = rungProjection({ stake: s.carriedStake, americanOdds: odds, goalTarget: s.goalTarget });
      s.projectedReturn = p.projectedReturn;
      s.reachesTarget = p.reachesTarget;
      s.shortfall = p.shortfall;
    }
    // What the NEXT rung inherits: the real settled payout when there is one, else this rung's target.
    carried = s.status === "cleared" && Number.isFinite(s.actualReturn as number)
      ? (s.actualReturn as number)
      : s.goalTarget;
  }

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
