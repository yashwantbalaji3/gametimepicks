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
 * @param {string|null} args.cardEventId     the card's ESPN event id (`card.event.providerEventId`)
 * @param {string|null} args.snapshotEventId the ESPN event id the odds snapshot is written under. ESPN, never the
 *   odds provider's: see the identity note below.
 */
export function classifyCardCoverage({ cardBouts, pricedByKey, matchedKeys, keyOf, fighterKeys, cardEventId = null, snapshotEventId = null }) {
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

  /*
   * DO THE TWO ARTIFACTS DESCRIBE THE SAME EVENT?
   *
   * Readiness counted priced bouts and never asked. On 2026-09-06 the card builder rolled forward to
   * "Noche UFC: Silva vs. Delgado" (event 600060772) while odds-latest still held the finished
   * "UFC Fight Night: Hooker vs. Parnasse" (600059993) — the odds capture runs Tue/Thu/Sat and had
   * not reached the new card. Every bout id in one artifact was absent from the other, so every
   * join was vacuous; nothing joined, and only that accident kept a stale price off the page.
   *
   * A capture for a DIFFERENT event is not partial coverage of this one. It is no coverage, and it
   * is named as such rather than counted.
   *
   * ⚠ BOTH IDS ARE ESPN EVENT IDS. The odds provider has no id for a card: every FIGHT is its own
   * provider event with its own hash. From P264 (2026-09-11) to 2026-10-05 the capture passed one of
   * those per-fight hashes here, so "600061182" was compared with "4a469d6a…", the check fired whenever
   * a single bout was priced, and no UFC capture could ever read ready — the fully priced 12/12 card of
   * 2026-09-17 included. The fixtures had several fights sharing one provider id, which the provider
   * never does. A provider id is per-bout provenance (`bouts[].providerEventId`), not card identity.
   */
  const eventMismatch = Boolean(cardEventId && snapshotEventId && String(cardEventId) !== String(snapshotEventId));

  const blockers = [];
  if (eventMismatch) {
    blockers.push(
      `the odds artifact describes event ${snapshotEventId}, not this card (${cardEventId}) — no prices have been captured for it yet`,
    );
  }
  if (!pricedCount && !eventMismatch) blockers.push("the provider returned no h2h market that joined to this card");
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
    // Ready requires the whole card priced AND the prices to be for THIS card.
    oddsReady: !eventMismatch && pricedCount > 0 && pricedCount === bouts.length,
    partiallyPriced: !eventMismatch && pricedCount > 0 && pricedCount < bouts.length,
    eventMismatch,
  };
}

/**
 * The identity every artifact of this kind must satisfy: priced + not-open + join-failed = the card.
 * Returned rather than thrown so the caller decides whether to refuse — but it is checked at the
 * write, because a coverage block that does not add up is worse than no coverage block.
 */
export function coverageReconciles(coverage) {
  return coverage.priced + coverage.marketNotOpen + coverage.joinFailed + (coverage.addedAfterCapture ?? 0) === coverage.cardBouts;
}

/** A bout the free card refresh added after the last paid capture: not checked against any market. */
export const ADDED_AFTER_CAPTURE = "ADDED_AFTER_CAPTURE";

/**
 * RECOMPUTE COVERAGE AGAINST THE CURRENT CARD — FREE, AND PRICES UNTOUCHED (Session 9 · main-health).
 *
 * ⚠ THE STALE DENOMINATOR. The card is rebuilt daily by the free refresh; prices are bought only on the
 * Tue/Thu/Sat priced slots. On 2026-10-02 the refresh added a 14th bout while `odds-latest.json` still
 * described the 13-bout card it was captured against — "11 of 13 priced" beside a card of 14, a stale claim
 * the published-snapshot guard correctly failed on (and, with it, every PR on main). GitHub then dropped the
 * Saturday priced slot that would have rewritten it.
 *
 * This recomputes ONLY the coverage metadata from the stored snapshot and the current card. No provider is
 * called and no price row is created, changed or re-derived:
 *   · a priced row whose bout is still on the card stays exactly as captured;
 *   · a priced row whose bout LEFT the card moves, byte-identical, to `droppedFromCard` (out of the
 *     denominator, never deleted);
 *   · an unpriced bout keeps the state the capture gave it (MARKET_NOT_OPEN / JOIN_FAILED);
 *   · a bout the capture never saw is ADDED_AFTER_CAPTURE — unpriced, unchecked, never guessed open or closed.
 * Readiness and blockers are re-derived by the same rules as the capture. The next paid capture remains the
 * only owner of prices and rewrites all of this.
 *
 * @returns {null | object}  the recomputed snapshot, or null when there is nothing to recompute (no
 *   snapshot, no card, a different event, or the bout universe is unchanged)
 */
export function recomputeCoverageAgainstCard({ snapshot, card, nowIso }) {
  if (!snapshot || !card || !Array.isArray(card.bouts)) return null;
  if (String(snapshot.event?.providerEventId ?? "") !== String(card.event?.providerEventId ?? "")) return null;
  const cardIds = card.bouts.map((b) => String(b.boutId));
  const onCard = new Set(cardIds);
  const prior = [...(snapshot.bouts ?? []), ...(snapshot.droppedFromCard ?? [])];
  const pricedById = new Map(prior.map((b) => [String(b.boutId), b]));
  const unpricedById = new Map((snapshot.unpricedBouts ?? []).map((u) => [String(u.boutId), u]));
  const sameUniverse = (snapshot.coverage?.cardBouts === cardIds.length)
    && cardIds.every((id) => pricedById.has(id) || unpricedById.has(id))
    && (snapshot.bouts ?? []).every((b) => onCard.has(String(b.boutId)));
  if (sameUniverse) return null;

  const bouts = cardIds.filter((id) => pricedById.has(id)).map((id) => pricedById.get(id));
  const droppedFromCard = prior.filter((b) => !onCard.has(String(b.boutId)));
  const unpriced = card.bouts.filter((b) => !pricedById.has(String(b.boutId))).map((b) => {
    const was = unpricedById.get(String(b.boutId));
    if (was) return was;
    return {
      boutId: b.boutId ?? null, red: b.red?.name ?? null, blue: b.blue?.name ?? null,
      matchup: `${b.red?.name ?? "?"} vs ${b.blue?.name ?? "?"}`, weightClass: b.weightClass ?? null, startUtc: b.startUtc ?? null,
      state: ADDED_AFTER_CAPTURE,
      reason: `added to the card after the last price capture (${snapshot.generatedAt ?? "unknown"}) — not yet checked against any market`,
      nextCheck: "the next scheduled ufc-odds-refresh slot",
    };
  });
  const coverage = {
    cardBouts: cardIds.length,
    priced: bouts.length,
    marketNotOpen: unpriced.filter((u) => u.state === "MARKET_NOT_OPEN").length,
    joinFailed: unpriced.filter((u) => u.state === "JOIN_FAILED").length,
    addedAfterCapture: unpriced.filter((u) => u.state === ADDED_AFTER_CAPTURE).length,
    unmatchedProviderEvents: snapshot.coverage?.unmatchedProviderEvents ?? 0,
  };
  /*
   * Same ESPN event by the guard above, so there is no event mismatch to carry. This used to copy the
   * capture's mismatch blocker verbatim — which, until 2026-10-05, was the false ESPN-vs-provider-hash
   * verdict (see classifyCardCoverage), so a recompute re-published a blocker that was never true.
   */
  const eventMismatch = false;
  const blockers = [];
  if (!coverage.priced && !eventMismatch) blockers.push("the provider returned no h2h market that joined to this card");
  if (coverage.joinFailed) blockers.push(`${coverage.joinFailed} bout(s) could not be joined to a provider event that exists — a defect, not a closed market`);
  if (coverage.marketNotOpen) blockers.push(`${coverage.marketNotOpen} of ${coverage.cardBouts} bouts have no posted h2h market yet`);
  if (coverage.addedAfterCapture) blockers.push(`${coverage.addedAfterCapture} bout(s) were added to the card after the last price capture and have not been priced`);
  return {
    ...snapshot,
    bouts,
    eventCount: bouts.length,
    marketCount: bouts.length,
    unpricedBouts: unpriced,
    coverage,
    oddsReady: !eventMismatch && coverage.priced > 0 && coverage.priced === coverage.cardBouts,
    partiallyPriced: !eventMismatch && coverage.priced > 0 && coverage.priced < coverage.cardBouts,
    blockers,
    ...(droppedFromCard.length ? { droppedFromCard } : {}),
    coverageRecomputed: { at: nowIso ?? null, againstCardGeneratedAt: card.generatedAt ?? null, providerCalls: 0, creditsSpent: 0, pricesFrom: snapshot.generatedAt ?? null },
  };
}

/**
 * THE PROVIDER EVENT BEHIND ONE PRICED BOUT — provenance, not identity.
 *
 * This replaced `matchedProviderEventId` (P264), which tallied the provider ids of a card's joined
 * bouts and returned the "most claimed" one as the card's event id, on the belief that a card's
 * fights share a provider event. They never do: the bulk MMA endpoint returns one event per FIGHT,
 * so every tally was 1-1-1… and the "winner" was whichever hash sorted first. That hash was then
 * compared with the card's ESPN event id. Kept per bout, the provider id is a useful audit trail
 * (which book event priced this fight); promoted to card identity, it was a guaranteed mismatch.
 *
 * @param {string} key  the provider key the bout claimed
 * @param {Map<string, {providerEventId?: string}>} pricedByKey
 * @returns {string|null}
 */
export function providerEventIdOf(key, pricedByKey) {
  const id = pricedByKey?.get?.(key)?.providerEventId;
  return id == null || id === "" ? null : String(id);
}
