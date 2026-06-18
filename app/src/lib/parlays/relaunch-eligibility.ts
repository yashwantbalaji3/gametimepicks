/**
 * Same-step relaunch eligibility for a dual-lane parlay whose soccer leg lost.
 *
 * A lane may be RELAUNCHED at the same step (keep the surviving partner leg, swap only the failed
 * soccer leg for a not-started replacement) ONLY when every timing gate holds. Otherwise the lane
 * falls back to the queued $100 restart. Pure + deterministic so the decision is unit-tested; never
 * fabricates and never edits a card whose kept leg is already in-play.
 */
export interface RelaunchInputs {
  nowMs: number;
  failedLegSettled: boolean;       // the soccer leg is officially settled (a loss)
  keptLegStartMs: number | null;   // the partner (e.g. MLB) leg's event start
  replacementStartMs: number | null; // the chosen replacement soccer leg's kickoff (null = none chosen)
}

export interface RelaunchDecision {
  allowed: boolean;
  reason: string;
  fallback: "same_step_relaunch" | "queued_restart";
}

export function canSameStepRelaunch(i: RelaunchInputs): RelaunchDecision {
  if (!i.failedLegSettled) {
    return { allowed: false, reason: "Failed leg is not officially settled yet.", fallback: "queued_restart" };
  }
  if (i.keptLegStartMs != null && i.keptLegStartMs <= i.nowMs) {
    return { allowed: false, reason: "The kept partner leg has already started (in-play) — a card cannot be retroactively relaunched once a surviving leg is locked.", fallback: "queued_restart" };
  }
  if (i.replacementStartMs == null) {
    return { allowed: false, reason: "No qualified not-started replacement soccer leg available.", fallback: "queued_restart" };
  }
  if (i.replacementStartMs <= i.nowMs) {
    return { allowed: false, reason: "The replacement soccer leg has already kicked off.", fallback: "queued_restart" };
  }
  return { allowed: true, reason: "Failed leg settled; both the kept leg and the replacement are pre-event — same-step relaunch is valid.", fallback: "same_step_relaunch" };
}
