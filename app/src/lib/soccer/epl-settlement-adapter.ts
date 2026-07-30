/**
 * EPL settlement adapter — lineage-gated, lifecycle-aware, and currently REFUSING TO RUN.
 *
 * WHAT THIS IS
 * An adapter OVER `lib/settlement/soccer-markets.ts`, which stays the single soccer grading engine.
 * Nothing here re-implements a grade: the adapter's whole job is to decide whether grading is
 * permitted and to hand the canonical engine an official bundle it can trust. Six grader
 * implementations across two languages is what the previous soccer era produced; a seventh would be
 * a defect, not redundancy.
 *
 * WHY IT REFUSES
 * No official EPL results source has been approved. `EPL_APPROVED_RESULTS_SOURCES` is EMPTY, so
 * every call returns `RESULTS_SOURCE_PENDING` and grades nothing. That is the honest state, not a
 * temporary stub: choosing a paid vendor is a founder decision (see
 * `docs/EPL_RESULTS_SOURCE_DECISION.md`), and an adapter that graded from an unapproved feed while
 * the decision was open would be settling results nobody agreed to trust.
 *
 * Tests exercise the grading path by passing an explicit synthetic source list. The default staying
 * empty is itself asserted, so the blocked state cannot be lifted by accident.
 *
 * MONEY BOUNDARY
 * This adapter grades and returns. It never writes a ledger, never reaches the Bank Builder, and
 * never invokes the money-mutating steps of `scripts/settle_soccer_day.sh`.
 */
import {
  gradeLeg,
  type GradeableLeg,
  type GradedLeg,
  type OfficialMatch,
  type OfficialResults,
} from "@/lib/settlement/soccer-markets";
import {
  validateSettlementLineage,
  type LineageViolation,
  type SettlementLineage,
} from "@/lib/identity/settlement-lineage";
import { readLifecycle, type FixtureLifecycleState, type LifecycleReading } from "./epl-lifecycle";

/**
 * Results sources approved to settle an EPL fixture.
 *
 * EMPTY BY DESIGN. Adding an entry is the engineering half of a founder decision, and it is the one
 * change that turns this adapter from reporting to grading.
 */
export const EPL_APPROVED_RESULTS_SOURCES: readonly string[] = [];

export type EplSettlementBlockerCode =
  /** No approved official results source exists. The standing state today. */
  | "RESULTS_SOURCE_PENDING"
  /** The cited source is real but not on the EPL approved list. */
  | "SOURCE_NOT_APPROVED"
  /** The fixture's lifecycle state does not permit grading (postponed, abandoned, unknown, …). */
  | "LIFECYCLE_NOT_GRADEABLE"
  /** The prediction → event → market → source chain does not validate. */
  | "LINEAGE_VIOLATION"
  /** A leg points at a fixture this official result is not about. */
  | "LEG_EVENT_MISMATCH";

export interface EplSettlementReadiness {
  readonly state: "BLOCKED" | "READY";
  readonly blocker: EplSettlementBlockerCode | null;
  readonly detail: string;
}

/** Copy the preview surface renders for the settlement panel. Honest about why nothing is graded. */
export const RESULTS_SOURCE_PENDING_NOTE =
  "No official EPL results source has been approved, so no fixture is graded. " +
  "Odds capture and provenance run today; settlement stays switched off until a source is chosen.";

/** Is settlement permitted at all right now? Reads the approved-source list and nothing else. */
export function eplSettlementReadiness(
  approvedSources: readonly string[] = EPL_APPROVED_RESULTS_SOURCES,
): EplSettlementReadiness {
  if (approvedSources.length === 0) {
    return { state: "BLOCKED", blocker: "RESULTS_SOURCE_PENDING", detail: RESULTS_SOURCE_PENDING_NOTE };
  }
  return {
    state: "READY",
    blocker: null,
    detail: `settlement permitted from: ${[...approvedSources].sort().join(", ")}`,
  };
}

/** An official EPL result, in the minimum shape the canonical engine needs. */
export interface EplOfficialResult {
  readonly eventId: string;
  /** "Home vs Away" using canonical club names — the engine parses home/away from this string. */
  readonly match: string;
  /** 90-minute regulation goals. EPL league play has no extra time, so this is the final score. */
  readonly homeGoals: number;
  readonly awayGoals: number;
  readonly lifecycle: FixtureLifecycleState;
  /** The official source consulted. Must be on the approved list for anything to grade. */
  readonly source: string;
  /** When the result was read. */
  readonly settledAt: string;
  readonly kickoffIso: string;
}

export interface EplSettlementRequest {
  readonly result: EplOfficialResult;
  /** Legs to grade, in the canonical engine's shape. `matchId` must be the canonical eventId. */
  readonly legs: readonly GradeableLeg[];
  /** The lineage chain for each leg, keyed by leg id. */
  readonly lineage: readonly SettlementLineage[];
}

export interface EplSettlementOutcome {
  readonly eventId: string;
  readonly readiness: EplSettlementReadiness;
  readonly lifecycle: LifecycleReading;
  /** Graded legs. EMPTY whenever `readiness.state` is BLOCKED — never a partial grade. */
  readonly graded: readonly GradedLeg[];
  /** Legs voided by a terminal-without-result lifecycle state. */
  readonly voided: readonly GradeableLeg[];
  readonly lineageViolations: readonly LineageViolation[];
}

const blocked = (
  eventId: string,
  lifecycle: LifecycleReading,
  blocker: EplSettlementBlockerCode,
  detail: string,
  lineageViolations: readonly LineageViolation[] = [],
  voided: readonly GradeableLeg[] = [],
): EplSettlementOutcome => ({
  eventId,
  readiness: { state: "BLOCKED", blocker, detail },
  lifecycle,
  graded: [],
  voided,
  lineageViolations,
});

/**
 * Settle one fixture, or explain precisely why it did not.
 *
 * Order matters: source approval first, then lifecycle, then lineage, then grading. Each gate is
 * cheaper and more fundamental than the next, and reporting "no approved source" is more useful than
 * reporting a lineage problem in a run that was never going to grade anything.
 */
export function settleEplFixture(
  request: EplSettlementRequest,
  approvedSources: readonly string[] = EPL_APPROVED_RESULTS_SOURCES,
): EplSettlementOutcome {
  const { result, legs, lineage } = request;
  const lifecycle = readLifecycle(result.lifecycle);

  const readiness = eplSettlementReadiness(approvedSources);
  if (readiness.state === "BLOCKED") {
    return blocked(result.eventId, lifecycle, readiness.blocker!, readiness.detail);
  }
  if (!approvedSources.includes(result.source)) {
    return blocked(
      result.eventId,
      lifecycle,
      "SOURCE_NOT_APPROVED",
      `result cites "${result.source}", which is not on the EPL approved results source list`,
    );
  }

  if (lifecycle.disposition === "VOID_ALL") {
    return blocked(result.eventId, lifecycle, "LIFECYCLE_NOT_GRADEABLE", lifecycle.reason, [], legs);
  }
  if (lifecycle.disposition !== "GRADE") {
    return blocked(result.eventId, lifecycle, "LIFECYCLE_NOT_GRADEABLE", lifecycle.reason);
  }

  const foreign = legs.filter((leg) => String(leg.matchId) !== result.eventId);
  if (foreign.length > 0) {
    return blocked(
      result.eventId,
      lifecycle,
      "LEG_EVENT_MISMATCH",
      `${foreign.length} leg(s) reference a different fixture (${[...new Set(foreign.map((l) => String(l.matchId)))].join(", ")})`,
    );
  }

  const lineageViolations = validateSettlementLineage(lineage);
  if (lineageViolations.length > 0) {
    return blocked(
      result.eventId,
      lifecycle,
      "LINEAGE_VIOLATION",
      `${lineageViolations.length} lineage violation(s) — nothing grades until the chain reconstructs`,
      lineageViolations,
    );
  }

  // The canonical engine keys legs off `matchId`; EPL passes OUR eventId, so the grading source is
  // the identity itself rather than a provider id that two fixtures could share.
  const match: OfficialMatch = {
    matchId: result.eventId,
    match: result.match,
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    status: "FT",
  };
  const official: OfficialResults = {
    date: result.kickoffIso.slice(0, 10),
    source: result.source,
    matches: [match],
    players: [],
  };

  const graded = legs.map((leg) => gradeLeg(leg, official));
  return { eventId: result.eventId, readiness, lifecycle, graded, voided: [], lineageViolations: [] };
}
