/**
 * Per-card reconciliation of frozen pre-fight pairings (UFC model-vs-market). Pure.
 *
 * frozen = graded + void + pending + withdrawn. WITHDRAWN (founder decision 2026-10-13, U4/D3 option (b), confirmed):
 * a pairing absent from the card's FINAL PRE-START snapshot, with NO official result, on a card whose official results
 * are in for other bouts, more than 24h after the start. Never graded, never void, in no denominator; the snapshots that
 * froze it are untouched. Absence from a snapshot alone is not enough — a bout can skip a capture for missing odds.
 */
export const WITHDRAWN_AFTER_MS = 24 * 3_600_000;

export function reconcileCard({ slateDate, name = null, boutIds, startUtc = null, finalPreStart = null, ledgerById, resultsByBout, nowMs }) {
  let graded = 0, voided = 0;
  const pending = [], withdrawn = [];
  const cardHasResults = [...resultsByBout.keys()].some((k) => String(k).startsWith(`${slateDate}:`));
  const start = Date.parse(startUtc ?? "");
  const pastWindow = Number.isFinite(start) && nowMs - start > WITHDRAWN_AFTER_MS;
  for (const id of boutIds) {
    const row = ledgerById.get(id);
    if (!row) {
      const isWithdrawn = !!finalPreStart && !finalPreStart.has(id) && !resultsByBout.has(id) && cardHasResults && pastWindow;
      (isWithdrawn ? withdrawn : pending).push(id);
    } else if (row.void === true) voided += 1;
    else graded += 1;
  }
  return { slateDate, event: name, frozen: boutIds.size, graded, void: voided, pending: pending.length, pendingBoutIds: pending,
    withdrawn: withdrawn.length, withdrawnBoutIds: withdrawn,
    reconciles: boutIds.size === graded + voided + pending.length + withdrawn.length };
}
