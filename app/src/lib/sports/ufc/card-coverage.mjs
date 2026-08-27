/**
 * UFC CARD COVERAGE — the card is the denominator, and every bout on it is priced or typed.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * The Aug-29 Shanghai card carried thirteen bouts. Eight were priced. The other five appeared in
 * the published artifact as a list of five SENTENCES — "Kai Asakura vs Aoriqileng" — under a field
 * called `unjoinedBouts`, beside `oddsReady: true` and `blockers: []`.
 *
 * Three things were wrong with that, and each is a different kind of wrong:
 *
 *   1. `oddsReady` was `bouts.length > 0`. One priced fight out of thirteen would have published as
 *      a ready, unblocked card. Readiness has to be a statement about the card, not about whether
 *      the array is non-empty.
 *
 *   2. A sentence is not an identity. Nothing downstream can join "Kai Asakura vs Aoriqileng" to a
 *      bout, so an unpriced fight was unreachable to every consumer that might have explained it.
 *
 *   3. MARKET_NOT_OPEN and JOIN_FAILED were one bucket. They are opposite facts: the first is a
 *      book that has not opened an undercard fight yet and will, the second is a book that HAS the
 *      fight while we failed to recognise it — a defect, on a market we already paid for.
 *
 *      They are told apart by an unconsumed provider event NEAR THIS CARD'S START. The first
 *      version of this asked only whether ANY provider event went unmatched, which the live run
 *      immediately falsified: the authorised call is the BULK MMA endpoint, so it returns every
 *      upcoming fight the book lists — 62 of them, nearly all belonging to cards weeks away. Under
 *      that rule every unpriced bout on every card is a join failure forever, which is a constant
 *      dressed as a diagnosis. Only an unmatched event commencing inside this card's window is
 *      evidence about this card.
 *
 * Pure and clock-free, so the guards can drive every combination without a network or a card.
 */

/**
 * Classify a card's pricing coverage.
 *
 * @param {object}   args
 * @param {Array}    args.cardBouts   the card's bouts, each `{ boutId, red:{name}, blue:{name}, … }`
 * @param {Map}      args.pricedByKey provider events keyed by the sorted fighter-name key
 * @param {Set}      args.matchedKeys the keys that actually matched a bout on this card
 * @param {Function} args.keyOf       `(bout) => key`, the same fold used to build `pricedByKey`
 * @param {number}   args.cardStartMs epoch ms of the card's own start, or NaN if unknown
 * @param {number}   [args.windowHours=18] how far either side of the card start still counts as
 *   "this card". Generous enough to cover prelims through main card in any timezone, tight enough
 *   to exclude next week's event.
 */
export function classifyCardCoverage({ cardBouts, pricedByKey, matchedKeys, keyOf, cardStartMs, windowHours = 18 }) {
  const bouts = Array.isArray(cardBouts) ? cardBouts : [];

  const span = windowHours * 3600_000;
  const nearThisCard = (commenceUtc) => {
    if (!Number.isFinite(cardStartMs)) return false; // no window ⇒ no claim about this card
    const t = Date.parse(commenceUtc);
    return Number.isFinite(t) && Math.abs(t - cardStartMs) <= span;
  };

  const unmatchedProviderEvents = [...pricedByKey.entries()]
    .filter(([key]) => !matchedKeys.has(key))
    .map(([key, p]) => ({ key, providerEventId: p?.providerEventId ?? null, commenceUtc: p?.commenceUtc ?? null }))
    .filter((e) => nearThisCard(e.commenceUtc));

  // The market demonstrably exists for something ON THIS CARD that we did not price, so no unpriced
  // bout can be called a closed book. Every one of them is a join suspect until that is resolved.
  const joinSuspect = unmatchedProviderEvents.length > 0;

  const unpriced = bouts
    .filter((b) => !pricedByKey.has(keyOf(b)))
    .map((b) => ({
      boutId: b.boutId ?? null,
      red: b.red?.name ?? null,
      blue: b.blue?.name ?? null,
      matchup: `${b.red?.name ?? "?"} vs ${b.blue?.name ?? "?"}`,
      weightClass: b.weightClass ?? null,
      startUtc: b.startUtc ?? null,
      state: joinSuspect ? "JOIN_FAILED" : "MARKET_NOT_OPEN",
      reason: joinSuspect
        ? `${unmatchedProviderEvents.length} provider event(s) inside this card's window matched no bout — this bout may be one of them`
        : "no posted h2h market for this bout at capture time",
      nextCheck: "the next scheduled ufc-odds-refresh slot",
    }));

  const pricedCount = bouts.length - unpriced.length;
  const coverage = {
    cardBouts: bouts.length,
    priced: pricedCount,
    marketNotOpen: unpriced.filter((u) => u.state === "MARKET_NOT_OPEN").length,
    joinFailed: unpriced.filter((u) => u.state === "JOIN_FAILED").length,
    unmatchedProviderEvents: unmatchedProviderEvents.length,
  };

  const blockers = [];
  if (!pricedCount) blockers.push("the provider returned no h2h market that joined to this card");
  if (coverage.joinFailed) {
    blockers.push(
      `${coverage.joinFailed} bout(s) could not be joined to a provider event that exists — a defect, not a closed market`,
    );
  }
  if (coverage.marketNotOpen) {
    blockers.push(`${coverage.marketNotOpen} of ${coverage.cardBouts} bouts have no posted h2h market yet`);
  }

  return {
    coverage,
    unpriced,
    unmatchedProviderEvents,
    blockers,
    // Ready means the WHOLE card is priced. A partially priced card still publishes the fights it
    // has; it is simply not a state anything downstream may treat as complete.
    oddsReady: pricedCount > 0 && pricedCount === bouts.length,
    partiallyPriced: pricedCount > 0 && pricedCount < bouts.length,
  };
}

/**
 * The identity every artifact of this kind must satisfy: priced + not-open + join-failed = the card.
 * Returned rather than thrown so the caller decides whether to refuse — but it is checked at the
 * write, because a coverage block that does not add up is worse than no coverage block.
 */
export function coverageReconciles(coverage) {
  return coverage.priced + coverage.marketNotOpen + coverage.joinFailed === coverage.cardBouts;
}
