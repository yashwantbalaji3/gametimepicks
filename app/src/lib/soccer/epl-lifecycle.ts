/**
 * Fixture lifecycle — what a fixture's status permits settlement to do.
 *
 * WHY THIS FILE EXISTS
 * No postponement or abandonment state exists anywhere in soccer settlement today. A called-off
 * fixture therefore pends forever: the legacy path left 192 of 385 graded legs permanently pending,
 * and nothing counted them. EPL winter rounds produce postponements on the league's schedule, not
 * ours, so this is a prerequisite rather than a follow-up.
 *
 * The rule is fail-closed in both directions. An unrecognised status never grades, and a state that
 * cannot grade is a NAMED, counted state rather than a silent omission — "we do not know" has to be
 * visible or it reads as "nothing happened".
 */

/**
 * Where a fixture sits.
 *
 * `FINAL_AET` / `FINAL_PEN` are unreachable in league play and are named anyway: the frozen
 * `pipeline/world_cup/settle.py` graded 90-minute markets off the extra-time aggregate precisely
 * because extra time had no state of its own. A future cup adapter inherits the name and the refusal
 * instead of re-deriving the defect.
 */
export type FixtureLifecycleState =
  | "SCHEDULED"
  | "FINAL_FT"
  | "POSTPONED"
  | "ABANDONED"
  | "REPLAYED"
  | "FINAL_AET"
  | "FINAL_PEN"
  | "UNKNOWN";

/** What settlement may do with a fixture in a given state. */
export type SettlementDisposition =
  /** Not yet played. Nothing to grade, and that is not a failure. */
  | "NO_SETTLEMENT"
  /** Regulation result is official. Markets grade through the canonical engine. */
  | "GRADE"
  /** Every market on this fixture voids. Stakes return; nothing rolls over to a replacement. */
  | "VOID_ALL"
  /** This record is a replacement fixture and settles under its own event identity. */
  | "NEW_IDENTITY_REQUIRED"
  /** Ungradeable and worth someone's attention. Counted, never silent. */
  | "PEND_AND_ALARM";

export interface LifecycleReading {
  readonly state: FixtureLifecycleState;
  readonly disposition: SettlementDisposition;
  /** A sentence a human can check against the fixture. Present for every state. */
  readonly reason: string;
}

const DISPOSITIONS: Record<FixtureLifecycleState, { disposition: SettlementDisposition; reason: string }> = {
  SCHEDULED: {
    disposition: "NO_SETTLEMENT",
    reason: "fixture has not kicked off — nothing to grade",
  },
  FINAL_FT: {
    disposition: "GRADE",
    reason: "regulation finish with an official score — 90-minute markets grade on it",
  },
  POSTPONED: {
    disposition: "VOID_ALL",
    reason:
      "called off before or at kickoff; the rescheduled fixture is a new event identity, so markets void rather than roll over",
  },
  ABANDONED: {
    disposition: "VOID_ALL",
    reason:
      "kicked off and not completed; absent an official completed result every market voids — league-rules speculation is not encoded",
  },
  REPLAYED: {
    disposition: "NEW_IDENTITY_REQUIRED",
    reason:
      "replacement for a postponed or abandoned fixture; kickoff-to-minute identity makes it a distinct event, and the original keeps its terminal state",
  },
  FINAL_AET: {
    disposition: "PEND_AND_ALARM",
    reason:
      "extra time is not reachable in league play — a feed reporting it against an EPL fixture is wrong, so nothing grades",
  },
  FINAL_PEN: {
    disposition: "PEND_AND_ALARM",
    reason:
      "penalties are not reachable in league play — a feed reporting them against an EPL fixture is wrong, so nothing grades",
  },
  UNKNOWN: {
    disposition: "PEND_AND_ALARM",
    reason: "status not recognised — fail closed, count it, and never grade on a guess",
  },
};

/** Provider status strings, mapped conservatively. Anything unlisted becomes `UNKNOWN`, not a guess. */
export function mapFixtureLifecycle(raw: string | null | undefined): FixtureLifecycleState {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "UNKNOWN";
  if (s === "ft" || s === "final" || s === "match finished" || s === "full time" || s === "final_ft") {
    return "FINAL_FT";
  }
  if (s === "aet" || s === "after extra time" || s === "final_aet") return "FINAL_AET";
  if (s === "pen" || s === "penalties" || s === "final_pen") return "FINAL_PEN";
  if (s === "pst" || s === "postponed" || s === "match postponed") return "POSTPONED";
  if (s === "abd" || s === "abandoned" || s === "match abandoned" || s === "susp" || s === "suspended") {
    return "ABANDONED";
  }
  if (s === "replay" || s === "replayed" || s === "rescheduled fixture") return "REPLAYED";
  if (s === "ns" || s === "scheduled" || s === "not started" || s === "tbd") return "SCHEDULED";
  return "UNKNOWN";
}

/** The full reading for a state. Total over the union — a new state cannot be added without a rule. */
export function readLifecycle(state: FixtureLifecycleState): LifecycleReading {
  const entry = DISPOSITIONS[state] ?? DISPOSITIONS.UNKNOWN;
  return { state: DISPOSITIONS[state] ? state : "UNKNOWN", ...entry };
}

/** Convenience: read straight from a provider status string. */
export function readLifecycleFromStatus(raw: string | null | undefined): LifecycleReading {
  return readLifecycle(mapFixtureLifecycle(raw));
}

/** Only `FINAL_FT` grades. Written as one predicate so no caller re-derives the list. */
export function isGradeable(state: FixtureLifecycleState): boolean {
  return readLifecycle(state).disposition === "GRADE";
}

/** States a surface must render as a first-class outcome rather than a blank row. */
export function isTerminalWithoutResult(state: FixtureLifecycleState): boolean {
  return readLifecycle(state).disposition === "VOID_ALL";
}
