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
 * LEDGER PAYOUT UNDER REVIEW. settle-lab-cards.mjs multiplies EVERY leg's price into `combinedDecimal` before voids
 * are removed, so a card that won on its remaining legs after a void is recorded at the full card's price and the
 * ledger's `returned` overstates it. Restating published payouts needs founder approval; until then any tier with
 * such a card is flagged here and the UI says so. Nothing published is changed.
 */
export const SMALL_SAMPLE_N = 30;
export const PAYOUT_REVIEW_NOTE = "Ledger payout under review: some winning cards in this risk level had a voided or pushed leg, and their recorded payout still includes that leg's price. Win–loss counts are unaffected.";
export const SMALL_SAMPLE_NOTE = "Small sample: fewer than 30 settled cards, so this record says little about what to expect.";

const TIERS = ["low", "medium", "high", "longshot"];

/** A settled card won on its remaining legs after at least one void — the case whose payout is overstated. */
export const isReducedWin = (card) => card?.result === "win" && Array.isArray(card?.legs) && card.legs.some((r) => r === "void" || r === "push");

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
        if (isReducedWin(c)) reducedWins += 1;
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
const dec = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));

/** What settle-lab-cards.mjs does TODAY (~line 335): every priced leg multiplies in, voided or not. */
export function combinedDecimalAsSettled(legOdds) {
  let combined = 1;
  for (const o of legOdds) if (o != null) combined *= dec(o);
  return Number(combined.toFixed(6));
}

/** The intended reduced-card price: void and push legs drop out, only decisive legs multiply in. */
export function combinedDecimalReduced(legOdds, results) {
  let combined = 1;
  legOdds.forEach((o, i) => { if (o != null && results[i] !== "void" && results[i] !== "push") combined *= dec(o); });
  return Number(combined.toFixed(6));
}
