/**
 * PARLAY LAB V2 · PER-TIER HISTORY FROM THE EXISTING LAB RECEIPTS (read-only).
 *
 * Source: the published-card settlement receipts (parlays/lab-settled/<date>.json — the same receipts
 * build-lab-ledger.mjs re-derives lab-ledger.json from), filtered to the ledger's current policy (version + since).
 * Counts per tier: WIN / LOSS / PUSH / VOID / PENDING, plus NO PLAY — a settled lab day for this sport on which the
 * tier published no card. `n` is the number of settled cards (W + L + PUSH + VOID).
 *
 * A rate is never shown alone: `hitRate` carries its own numerator and denominator (wins of W + L), and a tier with
 * n < 30 carries a small-sample note.
 *
 * LEDGER PAYOUT UNDER REVIEW. Receipts written before the reduced-win fix carry no `payoutDecimal`, and the ledger
 * credits their winning cards at `combinedDecimal` — the FULL card price, voided legs included — so a card that won
 * on its remaining legs after a void is overstated in `returned`. The settler now writes `payoutDecimal` (decided
 * winning legs only, lib/parlays/settlement.mjs) on every receipt settled for the first time, and never touches a
 * published one. Restating the historical receipts needs founder approval; until then any tier holding such a
 * LEGACY reduced win is flagged here and the UI says so. Nothing published is changed.
 */
import { fullCardDecimal, payoutFor, cardResult } from "../settlement.mjs";
export const SMALL_SAMPLE_N = 30;
export const PAYOUT_REVIEW_NOTE = "Ledger payout under review: some winning cards in this risk level had a voided or pushed leg, and their recorded payout still includes that leg's price. Win–loss counts are unaffected.";
export const SMALL_SAMPLE_NOTE = "Small sample: fewer than 30 settled cards, so this record says little about what to expect.";

const TIERS = ["low", "medium", "high", "longshot"];

/** A settled card won on its remaining legs after at least one void or push. */
export const isReducedWin = (card) => card?.result === "win" && Array.isArray(card?.legs) && card.legs.some((r) => r === "void" || r === "push");
/** A reduced win whose receipt predates the fix (no `payoutDecimal`) — the case whose recorded return is overstated. */
export const isOverstatedReducedWin = (card) => isReducedWin(card) && !Object.prototype.hasOwnProperty.call(card, "payoutDecimal");

/**
 * @param {ReadonlyArray<{date: string, policyVersion?: number, cards: ReadonlyArray<{sport: string, tier: string, result: string, legs?: string[]}>}>} settledDocs
 * @param {any} ledger  parsed lab-ledger.json (for the policy window); null ⇒ every receipt counts
 * @param {{ sport?: string }} [opts]
 */
export function tierHistory(settledDocs, ledger, { sport = "mlb" } = {}) {
  const since = typeof ledger?.policy?.since === "string" ? ledger.policy.since : null;
  const version = Number.isInteger(ledger?.policy?.version) ? ledger.policy.version : null;
  const docs = (settledDocs ?? []).filter((d) => typeof d?.date === "string"
    && (since == null || d.date >= since)
    && (version == null || d.policyVersion == null || d.policyVersion === version));

  const out = {};
  const sportDays = docs.filter((d) => (d.cards ?? []).some((c) => c.sport === sport));
  for (const tier of TIERS) {
    const counts = { win: 0, loss: 0, push: 0, void: 0, pending: 0, noPlay: 0 };
    let reducedWins = 0;
    for (const d of sportDays) {
      const mine = (d.cards ?? []).filter((c) => c.sport === sport && c.tier === tier);
      if (!mine.length) { counts.noPlay += 1; continue; }
      for (const c of mine) {
        if (c.result in counts && c.result !== "noPlay") counts[c.result] += 1;
        if (isOverstatedReducedWin(c)) reducedWins += 1;
      }
    }
    const n = counts.win + counts.loss + counts.push + counts.void;
    const decisive = counts.win + counts.loss;
    out[tier] = {
      tier, sport, since, policyVersion: version, counts, n,
      hitRate: decisive ? { value: counts.win / decisive, wins: counts.win, of: decisive } : null,
      smallSample: n < SMALL_SAMPLE_N,
      smallSampleNote: n < SMALL_SAMPLE_N ? SMALL_SAMPLE_NOTE : null,
      payoutUnderReview: reducedWins > 0,
      reducedWinCards: reducedWins,
      payoutNote: reducedWins > 0 ? PAYOUT_REVIEW_NOTE : null,
    };
  }
  return out;
}

/* ── THE ARITHMETIC, BOTH WAYS (pinned by history.test.mjs) ─────────────────────────────────────────────────── */

/** What every legacy receipt records as `combinedDecimal` (and the ledger credited a win at): every priced leg. */
export function combinedDecimalAsSettled(legOdds) {
  return fullCardDecimal(legOdds);
}

/** The corrected return (settlement.mjs PAYOUT_POLICY): void and push legs drop out, the winning legs multiply in. */
export function combinedDecimalReduced(legOdds, results) {
  return payoutFor(cardResult(results), results, legOdds);
}
