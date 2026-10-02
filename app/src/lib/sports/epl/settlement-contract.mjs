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
 *
 * SESSION 6 · SOCCER CORE. The grading body moved to `lib/sports/soccer/settlement-contract.mjs`, which
 * every soccer competition shares and which reads the competition's format (extra time, legs) from the
 * registry. This file is now the Premier League's binding of it: the same exports, the same version, and
 * outputs pinned byte-for-byte to the pre-extraction implementation by a 1,680-row golden grid
 * (`lib/sports/soccer/__fixtures__/epl-settlement-golden.json`).
 */

import { gradeSoccerLeg, settleSoccerSlate, OUTCOMES, RESULT_STATUSES } from "../soccer/settlement-contract.mjs";

export const EPL_SETTLEMENT_CONTRACT_VERSION = 1;

/** Grading outcomes and result statuses — re-exported from the shared soccer contract. */
export { OUTCOMES, RESULT_STATUSES };

/**
 * @typedef {{ fixtureId: string, status: string, homeGoalsFT: number|null, awayGoalsFT: number|null }} EplOfficialResult
 * @typedef {{ market: "match_result"|"total_goals", side: string, line?: number|null }} EplLeg
 */

/**
 * Grade one Premier League leg against one official result. Pure and total — see the shared contract.
 *
 * @param {EplLeg} leg
 * @param {EplOfficialResult} result
 * @returns {{ outcome: string, reason: string }}
 */
export function gradeEplLeg(leg, result) {
  return gradeSoccerLeg(leg, result, { competition: "epl" });
}

/** Batch settle with the decisive-denominator rule (shared contract), stamped with this contract's version. */
export function settleEplSlate(legs, resultsByFixture) {
  return settleSoccerSlate(legs, resultsByFixture, { competition: "epl", contractVersion: EPL_SETTLEMENT_CONTRACT_VERSION });
}
