/**
 * UFC settlement contract — bout-winner grading for official finals (Program 162 · Release I).
 *
 * THE SOURCE SHAPE SETS THE RULES. The proven corpus (1,716 finals, P153) is WINNER-ONLY: a
 * no-winner final carries both corners winner:false, which is a DRAW **or** a NO-CONTEST — the
 * shape cannot say which. Books settle those differently (a draw pushes a two-way winner market;
 * an NC voids), so contract v1 refuses to guess: any no-winner final is VOID_PENDING_REVIEW with
 * the ambiguity named. A richer official source that distinguishes them is the ONLY thing that
 * may ever split that outcome — never an inference from prose or odds.
 *
 * Same inherited discipline as the NFL/NBA/EPL contracts:
 *   - FINAL-only; anything else quarantines (postponed/cancelled/in-progress never grade).
 *   - Method/round/time markets are UNSUPPORTED (the live-input matrix already says so) — they
 *     refuse rather than fabricate.
 *   - An overturned result is a CORRECTION: this contract grades the official shape it is given,
 *     and no ledger writer may exist until it snapshots graded input + records correction lineage
 *     (the EPL runbook condition, sport-general).
 *   - Card↔bout separation: legs target providerBoutId; cards are grouping only.
 *   - This module writes no ledger — one settlement writer exists in this repo.
 */

export const UFC_SETTLEMENT_CONTRACT_VERSION = 1;

export const OUTCOMES = Object.freeze(["WIN", "LOSS", "PUSH", "VOID_PENDING_REVIEW"]);

/** v1 grades exactly one market. Method/round/time refuse — unsupported, never fabricated. */
export const MARKETS = Object.freeze(["bout_winner"]);

/**
 * @typedef {{ status: string, redWinner: boolean|null, blueWinner: boolean|null }} UfcOfficialResult
 * @typedef {{ market: "bout_winner", side: "red"|"blue" }} UfcLeg
 */

/** Grade one leg against one official bout result. Pure and total. */
export function gradeUfcBout(leg, result) {
  if (!result || !/^STATUS_FINAL/.test(result.status ?? "")) {
    return { outcome: "VOID_PENDING_REVIEW", reason: `no gradeable result — status ${result?.status ?? "missing"} (only STATUS_FINAL grades)` };
  }
  if (leg.market !== "bout_winner") {
    return { outcome: "VOID_PENDING_REVIEW", reason: `market ${leg.market} has no grading rule in contract v${UFC_SETTLEMENT_CONTRACT_VERSION} — method/round/time are unsupported by the winner-only source` };
  }
  if (leg.side !== "red" && leg.side !== "blue") {
    return { outcome: "VOID_PENDING_REVIEW", reason: `unknown bout_winner side ${leg.side}` };
  }
  const r = result.redWinner === true, b = result.blueWinner === true;
  if (r && b) {
    return { outcome: "VOID_PENDING_REVIEW", reason: "both corners marked winner — source defect, nothing settles" };
  }
  if (!r && !b) {
    return { outcome: "VOID_PENDING_REVIEW", reason: "no winner on a FINAL: draw or no-contest — the winner-only source cannot distinguish, and a draw pushes where an NC voids, so review resolves it" };
  }
  const winner = r ? "red" : "blue";
  return leg.side === winner
    ? { outcome: "WIN", reason: `official winner: ${winner}` }
    : { outcome: "LOSS", reason: `official winner: ${winner}, leg took ${leg.side}` };
}

/** Batch settle a card's legs with the decisive-denominator rule (gap-zero reconciliation). */
export function settleUfcCard(legs, resultsByBout) {
  const graded = legs.map((l) => ({ leg: l, ...gradeUfcBout(l, resultsByBout[l.providerBoutId]) }));
  const count = (o) => graded.filter((g) => g.outcome === o).length;
  const summary = {
    contractVersion: UFC_SETTLEMENT_CONTRACT_VERSION,
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
