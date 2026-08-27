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
 *      Telling them apart took three attempts against live data, and the first two were wrong in
 *      instructive ways. The authorised call is the BULK MMA endpoint, so the provider map holds
 *      every upcoming fight the book lists:
 *
 *        · "ANY unmatched provider event" ⇒ 62 of them, nearly all on cards weeks away. A rule that
 *          fires on every card forever is a constant dressed as a diagnosis.
 *        · "unmatched, inside this card's time window" ⇒ 11 left, and they were Akbarjon Islomboev
 *          vs Elvis Silva and friends — other promotions running the same weekend. Time says when a
 *          fight happens, not whose card it is on.
 *
 *      The discriminator is FIGHTER IDENTITY. A real join failure is a fight we have on the card
 *      whose name fold missed on one side — a diacritic, a nickname, a transliteration — so at
 *      least one of its two fighters still matches a fighter we know is fighting. A different
 *      promotion's bout shares nobody with our card, however close its start time.
 *
 *      HONEST LIMIT: a join failure where BOTH sides fail to fold is undetectable this way, and is
 *      reported as MARKET_NOT_OPEN. That is the conservative direction — it under-claims defects
 *      rather than inventing them — and it is stated rather than hidden.
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
 * @param {Function} args.fighterKeys `(bout) => [keyA, keyB]`, the per-FIGHTER fold. This is what
 *   separates a missed join on our own card from another promotion's fight in the same payload.
 */
export function classifyCardCoverage({ cardBouts, pricedByKey, matchedKeys, keyOf, fighterKeys }) {
  const bouts = Array.isArray(cardBouts) ? cardBouts : [];

  // Everyone we know is fighting on this card, as individual folded names.
  const onThisCard = new Set();
  if (typeof fighterKeys === "function") {
    for (const b of bouts) for (const k of fighterKeys(b) ?? []) if (k) onThisCard.add(k);
  }
  // The provider key is the two folded fighter names joined by "|" — the same fold, so a side that
  // folded correctly is directly comparable.
  const touchesThisCard = (key) => String(key).split("|").some((side) => onThisCard.has(side));

  const unmatchedProviderEvents = [...pricedByKey.entries()]
    .filter(([key]) => !matchedKeys.has(key))
    .filter(([key]) => touchesThisCard(key))
    .map(([key, p]) => ({ key, providerEventId: p?.providerEventId ?? null, commenceUtc: p?.commenceUtc ?? null }));

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
        ? `${unmatchedProviderEvents.length} provider event(s) naming a fighter from this card matched no bout — this bout may be one of them`
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
