/**
 * EPL settlement contract — the grading design for the second sport (Program 146 · evening R3).
 *
 * WHY THIS EXISTS. The EPL odds side landed in Program 062-065 and has been settlement-GATED ever
 * since: markets are ingested but nothing may publish because no grading path exists. This module
 * is that path's contract — the deterministic rules that turn an OFFICIAL full-time result into
 * graded outcomes — written against fixtures now so the sport-gate settlement stage moves
 * UNPROVEN → PARTIAL with a real receipt, and so the eventual source integration has a spec to
 * satisfy rather than inventing rules at ingestion time.
 *
 * RULES INHERITED FROM SETTLED HISTORY (not re-decided here):
 *   - 90-minute rule: team markets settle on FULL TIME (90' + stoppage), never extra time or
 *     penalties — the World Cup knockout lesson, already burned into the repo's memory. League
 *     play has no extra time, but the rule is encoded anyway so cup competitions cannot drift.
 *   - Official-only: a result may grade ONLY from an official source result with a FINAL status.
 *     Anything else — postponed, abandoned, suspended, in-play — quarantines the fixture's legs
 *     as VOID_PENDING_REVIEW rather than guessing (the StatsAPI postponed lesson: "Final" strings
 *     without scores lie).
 *   - De-vig discipline and market vocabulary follow the MLB pipeline; this contract only GRADES.
 */

export const EPL_SETTLEMENT_CONTRACT_VERSION = 1;

/** Grading outcomes — the same vocabulary the MLB settler writes. */
export const OUTCOMES = Object.freeze(["WIN", "LOSS", "PUSH", "VOID_PENDING_REVIEW"]);

/** Statuses an official result may carry; only FULL_TIME grades. */
export const RESULT_STATUSES = Object.freeze(["FULL_TIME", "POSTPONED", "ABANDONED", "SUSPENDED", "IN_PLAY", "NOT_STARTED"]);

/**
 * @typedef {{ fixtureId: string, status: string, homeGoalsFT: number|null, awayGoalsFT: number|null }} EplOfficialResult
 * @typedef {{ market: "match_result"|"total_goals", side: string, line?: number|null }} EplLeg
 */

/**
 * Grade one leg against one official result. Pure and total: every input combination returns an
 * outcome, and everything un-gradeable is VOID_PENDING_REVIEW — never a guess, never a throw that
 * a batch settler would have to remember to catch.
 *
 * @param {EplLeg} leg
 * @param {EplOfficialResult} result
 * @returns {{ outcome: string, reason: string }}
 */
export function gradeEplLeg(leg, result) {
  if (!result || result.status !== "FULL_TIME") {
    return { outcome: "VOID_PENDING_REVIEW", reason: `no gradeable result — status ${result?.status ?? "missing"} (only FULL_TIME grades)` };
  }
  const h = result.homeGoalsFT, a = result.awayGoalsFT;
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
    // The StatsAPI lesson: a "final" without real scores is a lie waiting to be graded.
    return { outcome: "VOID_PENDING_REVIEW", reason: "FULL_TIME status without integer goals — quarantined, never guessed" };
  }

  if (leg.market === "match_result") {
    const actual = h > a ? "home" : a > h ? "away" : "draw";
    if (!["home", "away", "draw"].includes(leg.side)) {
      return { outcome: "VOID_PENDING_REVIEW", reason: `unknown match_result side ${leg.side}` };
    }
    return leg.side === actual
      ? { outcome: "WIN", reason: `FT ${h}-${a}: ${actual}` }
      : { outcome: "LOSS", reason: `FT ${h}-${a}: ${actual}, leg took ${leg.side}` };
  }

  if (leg.market === "total_goals") {
    if (typeof leg.line !== "number" || !(leg.side === "over" || leg.side === "under")) {
      return { outcome: "VOID_PENDING_REVIEW", reason: "total_goals needs a numeric line and an over/under side" };
    }
    const total = h + a;
    if (total === leg.line) return { outcome: "PUSH", reason: `FT total ${total} lands exactly on ${leg.line}` };
    const overWon = total > leg.line;
    return (leg.side === "over") === overWon
      ? { outcome: "WIN", reason: `FT total ${total} vs ${leg.line}` }
      : { outcome: "LOSS", reason: `FT total ${total} vs ${leg.line}` };
  }

  return { outcome: "VOID_PENDING_REVIEW", reason: `market ${leg.market} has no grading rule in contract v${EPL_SETTLEMENT_CONTRACT_VERSION}` };
}

/**
 * Batch settle with the decisive-denominator rule: decisive = WIN + LOSS only; pushes and voids are
 * reported separately and the populations must reconcile exactly (the Sprint 052 accounting rule —
 * accounting starts from the GENERATED population, gap zero).
 */
export function settleEplSlate(legs, resultsByFixture) {
  const graded = legs.map((l) => ({ leg: l, ...gradeEplLeg(l, resultsByFixture[l.fixtureId]) }));
  const count = (o) => graded.filter((g) => g.outcome === o).length;
  const summary = {
    contractVersion: EPL_SETTLEMENT_CONTRACT_VERSION,
    total: graded.length,
    wins: count("WIN"),
    losses: count("LOSS"),
    pushes: count("PUSH"),
    voids: count("VOID_PENDING_REVIEW"),
    decisive: count("WIN") + count("LOSS"),
  };
  summary.reconciles = summary.wins + summary.losses + summary.pushes + summary.voids === summary.total;
  return { graded, summary };
}
