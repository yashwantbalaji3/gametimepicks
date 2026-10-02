/**
 * Soccer settlement contract — ONE grading path for every competition in the soccer registry
 * (Session 6 · Soccer core). Extracted from `epl/settlement-contract.mjs`, which is now a thin wrapper
 * that reproduces its previous outputs byte-for-byte (pinned by a 1,680-row golden grid).
 *
 * WHAT IS SHARED AND WHAT IS NOT. Grading physics are the same in every competition: official FINAL only,
 * integer goals or quarantine, 1X2 and totals settle on the 90-minute score. What differs is the FORMAT,
 * and the format comes from the registry (`leagues.mjs` → `format`), never from this file:
 *   - extraTime: a cup tie can go to extra time and penalties, and the provider's "final" score then
 *     includes them. Such a competition grades a leg ONLY from a result that declares itself a 90-minute
 *     score (`regulationOnly: true`); anything else is VOID_PENDING_REVIEW — the World Cup knockout lesson.
 *   - legs: a two-legged tie's AGGREGATE is not a match result; this contract grades single matches only.
 *
 * WHAT IT IS NOT. Grading is not publication. This contract never reads a competition's `stage`: whether a
 * league may publish forecasts or carry paper cards is decided by the registry stage and the founder odds
 * receipts, and a gradeable leg in a HOLD competition is still a leg nobody may publish.
 */
import { SOCCER_LEAGUES } from "./leagues.mjs";

export const SOCCER_SETTLEMENT_CONTRACT_VERSION = 1;

/** Grading outcomes — the same vocabulary the MLB settler writes. */
export const OUTCOMES = Object.freeze(["WIN", "LOSS", "PUSH", "VOID_PENDING_REVIEW"]);

/** Statuses an official result may carry; only FULL_TIME grades. */
export const RESULT_STATUSES = Object.freeze(["FULL_TIME", "POSTPONED", "ABANDONED", "SUSPENDED", "IN_PLAY", "NOT_STARTED"]);

/**
 * @typedef {{ fixtureId: string, status: string, homeGoalsFT: number|null, awayGoalsFT: number|null, regulationOnly?: boolean }} SoccerOfficialResult
 * @typedef {{ market: "match_result"|"total_goals", side: string, line?: number|null }} SoccerLeg
 */

/** The registry entry for a competition key, or null (an unknown competition grades nothing). */
export function competitionFormat(competition) {
  const l = SOCCER_LEAGUES.find((x) => x.key === competition);
  return l ? { key: l.key, format: l.format ?? null } : null;
}

/**
 * Grade one leg against one official result in one competition. Pure and total: every input returns an
 * outcome, and everything un-gradeable is VOID_PENDING_REVIEW — never a guess, never a throw.
 *
 * @param {SoccerLeg} leg
 * @param {SoccerOfficialResult} result
 * @param {{ competition: string }} ctx
 */
export function gradeSoccerLeg(leg, result, { competition } = {}) {
  const comp = competitionFormat(competition);
  if (!comp || !comp.format) {
    return { outcome: "VOID_PENDING_REVIEW", reason: `unknown competition ${competition ?? "missing"} — no registered format, nothing grades` };
  }
  if (!result || result.status !== "FULL_TIME") {
    return { outcome: "VOID_PENDING_REVIEW", reason: `no gradeable result — status ${result?.status ?? "missing"} (only FULL_TIME grades)` };
  }
  if (comp.format.extraTime && result.regulationOnly !== true) {
    return { outcome: "VOID_PENDING_REVIEW", reason: `${comp.key} can go to extra time — only a result declared as the 90-minute score grades` };
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

  return { outcome: "VOID_PENDING_REVIEW", reason: `market ${leg.market} has no grading rule in contract v${SOCCER_SETTLEMENT_CONTRACT_VERSION}` };
}

/**
 * Batch settle with the decisive-denominator rule: decisive = WIN + LOSS only; pushes and voids are
 * reported separately and the populations must reconcile exactly (the Sprint 052 accounting rule).
 */
export function settleSoccerSlate(legs, resultsByFixture, { competition, contractVersion = SOCCER_SETTLEMENT_CONTRACT_VERSION } = {}) {
  const graded = legs.map((l) => ({ leg: l, ...gradeSoccerLeg(l, resultsByFixture[l.fixtureId], { competition }) }));
  const count = (o) => graded.filter((g) => g.outcome === o).length;
  const summary = {
    contractVersion,
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
