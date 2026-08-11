/**
 * NFL settlement contract — deterministic grading rules for official finals
 * (Program 161 · Release D; the roadmap item promoted when the schedule cadence receipts landed).
 *
 * WHY NOW. The NFL research corpus (1,001 finals, 7 ties preserved) proved the source class and
 * the result shapes; preseason is underway, so real finals start flowing through the results
 * capture this week. This contract is written BEFORE any of them grade, so the eventual pipeline
 * satisfies a spec instead of inventing rules at ingestion time — the same sequencing the EPL
 * contract used (Program 146) and validated against a full real season (P151).
 *
 * RULES INHERITED FROM SETTLED HISTORY (not re-decided here):
 *   - TIES ARE REAL AND EXPLICIT: an NFL game may end level after overtime (7 in the corpus).
 *     A two-way moneyline on a tied final is PUSH — never a guess, never a coin flip.
 *   - Official-only, FINAL-only: only a STATUS_FINAL result grades. Postponed, canceled,
 *     suspended, in-play — VOID_PENDING_REVIEW (the StatsAPI postponed lesson: "Final" strings
 *     without scores lie).
 *   - Integer scores or nothing: a FINAL without integer points quarantines.
 *   - This contract only GRADES. It writes no ledger — the repo has exactly ONE settlement
 *     writer (nightly-settle, MLB) and this module must never become a second one.
 */

export const NFL_SETTLEMENT_CONTRACT_VERSION = 1;

/** Grading outcomes — the same vocabulary every settled surface in the repo uses. */
export const OUTCOMES = Object.freeze(["WIN", "LOSS", "PUSH", "VOID_PENDING_REVIEW"]);

/** Markets this version grades. Anything else refuses with VOID_PENDING_REVIEW. */
export const MARKETS = Object.freeze(["moneyline", "point_spread", "total_points"]);

/**
 * @typedef {{ status: string, homePointsFT: number|null, awayPointsFT: number|null }} NflOfficialResult
 * @typedef {{ market: "moneyline"|"point_spread"|"total_points", side: string, line?: number|null }} NflLeg
 *
 * point_spread lines are SIDE-RELATIVE: `side: "home", line: -3.5` means the home team must win
 * by more than 3.5; `side: "away", line: +3.5` is the same position seen from the other side.
 * An integer line landing exactly is PUSH.
 */

/** Grade one leg against one official result. Pure and total — every input returns an outcome. */
export function gradeNflLeg(leg, result) {
  if (!result || !/^STATUS_FINAL/.test(result.status ?? "")) {
    return { outcome: "VOID_PENDING_REVIEW", reason: `no gradeable result — status ${result?.status ?? "missing"} (only STATUS_FINAL grades)` };
  }
  const h = result.homePointsFT, a = result.awayPointsFT;
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
    return { outcome: "VOID_PENDING_REVIEW", reason: "FINAL status without integer points — quarantined, never guessed" };
  }

  if (leg.market === "moneyline") {
    if (leg.side !== "home" && leg.side !== "away") {
      return { outcome: "VOID_PENDING_REVIEW", reason: `unknown moneyline side ${leg.side}` };
    }
    if (h === a) return { outcome: "PUSH", reason: `final ${h}-${a}: tie — a two-way moneyline pushes` };
    const winner = h > a ? "home" : "away";
    return leg.side === winner
      ? { outcome: "WIN", reason: `final ${h}-${a}: ${winner}` }
      : { outcome: "LOSS", reason: `final ${h}-${a}: ${winner}, leg took ${leg.side}` };
  }

  if (leg.market === "point_spread") {
    if ((leg.side !== "home" && leg.side !== "away") || typeof leg.line !== "number" || !Number.isFinite(leg.line)) {
      return { outcome: "VOID_PENDING_REVIEW", reason: "point_spread needs a home/away side and a finite numeric line" };
    }
    const margin = leg.side === "home" ? h - a : a - h; // the chosen side's winning margin
    const adjusted = margin + leg.line;
    if (adjusted === 0) return { outcome: "PUSH", reason: `margin ${margin} lands exactly on the ${leg.line} line` };
    return adjusted > 0
      ? { outcome: "WIN", reason: `margin ${margin} covers ${leg.line}` }
      : { outcome: "LOSS", reason: `margin ${margin} fails ${leg.line}` };
  }

  if (leg.market === "total_points") {
    if ((leg.side !== "over" && leg.side !== "under") || typeof leg.line !== "number" || !Number.isFinite(leg.line)) {
      return { outcome: "VOID_PENDING_REVIEW", reason: "total_points needs an over/under side and a finite numeric line" };
    }
    const total = h + a;
    if (total === leg.line) return { outcome: "PUSH", reason: `total ${total} lands exactly on ${leg.line}` };
    const overWon = total > leg.line;
    return (leg.side === "over") === overWon
      ? { outcome: "WIN", reason: `total ${total} vs ${leg.line}` }
      : { outcome: "LOSS", reason: `total ${total} vs ${leg.line}` };
  }

  return { outcome: "VOID_PENDING_REVIEW", reason: `market ${leg.market} has no grading rule in contract v${NFL_SETTLEMENT_CONTRACT_VERSION}` };
}

/**
 * Batch settle with the decisive-denominator rule: decisive = WIN + LOSS only; pushes and voids
 * reported separately and the populations must reconcile exactly (the Sprint 052 accounting rule —
 * accounting starts from the generated population, gap zero).
 */
export function settleNflSlate(legs, resultsByEvent) {
  const graded = legs.map((l) => ({ leg: l, ...gradeNflLeg(l, resultsByEvent[l.providerEventId]) }));
  const count = (o) => graded.filter((g) => g.outcome === o).length;
  const summary = {
    contractVersion: NFL_SETTLEMENT_CONTRACT_VERSION,
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
