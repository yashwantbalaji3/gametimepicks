/**
 * NBA settlement contract — deterministic grading rules for official finals
 * (Program 162 · Release A).
 *
 * NOT A BLIND NFL COPY. The sports disagree on one load-bearing rule: an NFL game may end tied
 * after overtime (7 real ties in its corpus; two-way moneyline = PUSH), but an NBA game CANNOT —
 * overtime repeats until someone leads. A tied NBA "final" is therefore a SOURCE DEFECT and must
 * QUARANTINE (VOID_PENDING_REVIEW), never settle as a push. The corpus builder already refuses
 * ties (Program 152); this contract encodes the same physics at grading time.
 *
 * Shared discipline (inherited, not re-decided):
 *   - Official-only, FINAL-only: only STATUS_FINAL grades; postponed/canceled/in-play/unknown
 *     quarantine (the StatsAPI postponed lesson: "Final" strings without scores lie).
 *   - Integer scores or nothing.
 *   - Season types are metadata the ADAPTER preserves (preseason evaluation must never blend into
 *     regular-season claims); grading itself is per-result and season-blind by design.
 *   - This contract only GRADES. It writes no ledger — the repo has exactly ONE settlement writer
 *     (nightly-settle, MLB) and a guard greps this module to keep it that way.
 */

export const NBA_SETTLEMENT_CONTRACT_VERSION = 1;

/** Grading outcomes — the same vocabulary every settled surface in the repo uses. */
export const OUTCOMES = Object.freeze(["WIN", "LOSS", "PUSH", "VOID_PENDING_REVIEW"]);

/** Markets this version grades. Anything else refuses with VOID_PENDING_REVIEW. */
export const MARKETS = Object.freeze(["moneyline", "point_spread", "total_points"]);

/**
 * @typedef {{ status: string, homePointsFT: number|null, awayPointsFT: number|null }} NbaOfficialResult
 * @typedef {{ market: "moneyline"|"point_spread"|"total_points", side: string, line?: number|null }} NbaLeg
 *
 * point_spread lines are SIDE-RELATIVE (side "home", line -6.5 → home must win by more than 6.5);
 * an integer line landing exactly is PUSH. Spread/total pushes are legitimate in NBA — only the
 * tied FINAL itself is impossible.
 */

/** Grade one leg against one official result. Pure and total — every input returns an outcome. */
export function gradeNbaLeg(leg, result) {
  if (!result || !/^STATUS_FINAL/.test(result.status ?? "")) {
    return { outcome: "VOID_PENDING_REVIEW", reason: `no gradeable result — status ${result?.status ?? "missing"} (only STATUS_FINAL grades)` };
  }
  const h = result.homePointsFT, a = result.awayPointsFT;
  if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) {
    return { outcome: "VOID_PENDING_REVIEW", reason: "FINAL status without integer points — quarantined, never guessed" };
  }
  if (h === a) {
    // The sport-specific rule: overtime repeats until a leader exists, so this row lies.
    return { outcome: "VOID_PENDING_REVIEW", reason: `final ${h}-${a}: an NBA game cannot end tied — source defect, quarantined for review` };
  }

  if (leg.market === "moneyline") {
    if (leg.side !== "home" && leg.side !== "away") {
      return { outcome: "VOID_PENDING_REVIEW", reason: `unknown moneyline side ${leg.side}` };
    }
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

  return { outcome: "VOID_PENDING_REVIEW", reason: `market ${leg.market} has no grading rule in contract v${NBA_SETTLEMENT_CONTRACT_VERSION}` };
}

/**
 * Batch settle with the decisive-denominator rule: decisive = WIN + LOSS only; pushes and voids
 * reported separately; populations must reconcile exactly (Sprint 052: accounting starts from the
 * generated population, gap zero).
 */
export function settleNbaSlate(legs, resultsByEvent) {
  const graded = legs.map((l) => ({ leg: l, ...gradeNbaLeg(l, resultsByEvent[l.providerEventId]) }));
  const count = (o) => graded.filter((g) => g.outcome === o).length;
  const summary = {
    contractVersion: NBA_SETTLEMENT_CONTRACT_VERSION,
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
