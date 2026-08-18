/**
 * THE 4x4 GRID — four bankroll tiers by four risk bands, resolved once, for any sport.
 *
 * ══ WHY THE CELLS ARE NOT SIXTEEN DIFFERENT CARDS ═══════════════════════════════════════════════
 *
 * The obvious reading of "precomputed parlays for each tier and each risk level" is sixteen
 * distinct cards. The backtest says not to build that, and the reason is worth stating precisely
 * because it is the whole design.
 *
 * Optimizer RANK predicts return. Cards ranked 1-3 in their band returned +9.5%; cards ranked 4-6
 * in the SAME band returned -32.3% (t = -3.37), and it holds inside every leg count, so it is not
 * a confound with card length. There are roughly three cards in a band worth publishing on a given
 * slate, not sixteen.
 *
 * So a grid of distinct cards would hand tier 1 the rank-1 card, tier 2 the rank-2, tier 3 the
 * rank-3 and tier 4 a card MEASURED to lose a third of its stake — with nothing to justify it but
 * the aesthetics of a filled table. The best card in a band is the best card for everyone; a
 * bankroll does not change which selections are good.
 *
 * The grid is therefore fully precomputed and fully resolved, and cells in the same band across
 * tiers point at the same card. What varies by tier is what the data says may vary: HOW MANY bands
 * a reader is shown. Bronze sees the calmest one; diamond sees all four.
 *
 * ══ WHY CARDS WITHIN A TIER ARE LEG-DISJOINT ════════════════════════════════════════════════════
 *
 * Sharing legs between the cards ONE reader is shown does not change expected value, but it
 * concentrates the failure: wipeout rate went 18.6% -> 43.2% -> 65.9% as a leg was reused across
 * one, two and three cards. A reader handed four cards that all contain the same leg is holding one
 * bet wearing four hats. The ladder enforces this when it picks the band cards, and the grid
 * verifies it rather than trusting it.
 *
 * Sharing a card BETWEEN tiers is a different thing entirely and is fine: two readers holding the
 * same card are not correlated with each other in any way that matters to either of them.
 *
 * ══ NO STAKE IS BAKED IN ════════════════════════════════════════════════════════════════════════
 *
 * ══ A BAND CAN BE STRUCTURALLY UNREACHABLE, AND THAT MUST BE SAID OUT LOUD ══════════════════════
 *
 * The four bands are price ranges; nothing guarantees the card factory can BUILD one in each. It
 * cannot. Over 50 days and 883 candidate cards, exactly zero landed in `low` (-200 to +100): the
 * shortest card two player-prop legs can combine to is +103, three points outside the band. `low`
 * is not empty today, it is empty always.
 *
 * That matters more than it sounds, because bronze — the SMALLEST daily bankroll, the reader the
 * tier design exists to protect — is shown one band, and that band is `low`. A grid built naively
 * from the tier slice ships a permanently blank row to exactly the wrong people.
 *
 * The band thresholds are NOT moved to fix this. They are canonical and the grader shares them, so
 * widening `low` would make today's ladder and the settled record disagree about what "Low risk"
 * means. Instead the grid measures which bands the stream actually reaches, and where a tier's
 * whole designed scope is unreachable it names a SUBSTITUTE — the calmest band that does produce
 * cards — as an explicit, labelled fallback carrying its own record. Never a silent promotion: a
 * reader moved from low to medium is being shown something riskier than the tier intended, and has
 * to be told so in those words.
 *
 * ══ NO STAKE IS BAKED IN ════════════════════════════════════════════════════════════════════════
 *
 * The grid carries a POLICY, never a dollar figure. The reader's bankroll is entered in their own
 * browser and never leaves it, so the artifact cannot know it and must not guess — a default stake
 * is a recommendation nobody asked for. The page multiplies locally.
 */

/** Cell states. Every cell has exactly one, and every non-offered state carries a reason. */
export const CELL_STATES = Object.freeze({
  /** This tier is shown this band, and a card exists. */
  OFFERED: "OFFERED",
  /** The band is outside this tier's scope — calmer tiers see fewer bands, by design. */
  ABOVE_TIER: "ABOVE_TIER",
  /** In scope, but the slate produced no publishable card in this band today. */
  NO_CARD: "NO_CARD",
});

/**
 * Resolve the full grid.
 *
 * @param {object} o
 * @param {readonly {id: string, cardsPerDay: number, minBankroll: number, maxBankroll: number|null}[]} o.tiers
 * @param {readonly string[]} o.riskOrder      bands, calmest first
 * @param {readonly {tier: string, slipId?: string}[]} o.cards  the band cards the ladder published
 * @param {readonly {tier: string, reason: string}[]} [o.skipped]  bands the ladder could not fill
 * @returns {{cells: object[], tiers: object[]}}
 */
export function resolveTierGrid({ tiers, riskOrder, cards, skipped = [] }) {
  const cardByBand = new Map(cards.map((c) => [c.tier, c]));
  const skipByBand = new Map(skipped.map((s) => [s.tier, s.reason]));

  const cells = [];
  for (const tier of tiers) {
    // Calmest first: a tier shown one band is shown the LOW one, never the wildest.
    const inScope = new Set(riskOrder.slice(0, tier.cardsPerDay));
    for (const band of riskOrder) {
      if (!inScope.has(band)) {
        cells.push({
          tier: tier.id, band, state: CELL_STATES.ABOVE_TIER, slipId: null,
          reason: `A daily bankroll in this range is shown ${tier.cardsPerDay} card${tier.cardsPerDay === 1 ? "" : "s"} a day, starting with the calmest. This band is not among them.`,
        });
        continue;
      }
      const card = cardByBand.get(band);
      if (!card) {
        cells.push({
          tier: tier.id, band, state: CELL_STATES.NO_CARD, slipId: null,
          reason: skipByBand.get(band) ?? "no publishable card in this band on this slate",
        });
        continue;
      }
      cells.push({ tier: tier.id, band, state: CELL_STATES.OFFERED, slipId: card.slipId ?? null, reason: null });
    }
  }

  /*
   * The calmest band that actually produced a card today. Used only as a labelled substitute for a
   * tier whose entire designed scope came up empty — never to quietly upgrade a tier that already
   * has one.
   */
  const calmestAvailable = riskOrder.find((b) => cardByBand.has(b)) ?? null;

  const tierRows = tiers.map((t) => {
    const mine = cells.filter((c) => c.tier === t.id);
    return {
      id: t.id,
      minBankroll: t.minBankroll,
      maxBankroll: t.maxBankroll,
      cardsPerDay: t.cardsPerDay,
      bands: riskOrder.slice(0, t.cardsPerDay),
      offered: mine.filter((c) => c.state === CELL_STATES.OFFERED).length,
      // Stated, never hidden: a tier whose designed bands produced nothing shows nothing from them.
      emptyToday: mine.every((c) => c.state !== CELL_STATES.OFFERED),
    };
  });

  /*
   * A substitute is offered ONLY to a tier that would otherwise show nothing at all, and it is
   * always the calmest card on the board rather than the next band up — a reader given a fallback
   * should land on the mildest thing available, not be walked up the ladder one rung at a time.
   */
  for (const row of tierRows) {
    if (!row.emptyToday || !calmestAvailable) { row.substitute = null; continue; }
    row.substitute = {
      band: calmestAvailable,
      slipId: cardByBand.get(calmestAvailable)?.slipId ?? null,
      /* Reader-facing wording. It has to say the card is RISKIER than the tier's own range, because
         that is the entire content of the substitution. */
      reason: `Nothing on today's board priced in this range. The calmest card available is ${calmestAvailable} risk, which is a longer price than this bankroll is normally shown — its own record is attached.`,
    };
  }

  return { cells, tiers: tierRows, calmestAvailable };
}

/**
 * The legs one reader would be holding, across every card their tier is shown.
 *
 * Returns any leg appearing on more than one of them. Non-empty means the ladder handed a single
 * reader the same selection twice — the 65.9% wipeout case — and the grid must refuse to publish.
 */
export function crossCardLegCollisions({ tiers, riskOrder, cards }) {
  const cardByBand = new Map(cards.map((c) => [c.tier, c]));
  const legKey = (l) => `${l.player}|${l.market}|${l.side}|${l.line}`;
  const collisions = [];

  for (const tier of tiers) {
    const seen = new Map();
    for (const band of riskOrder.slice(0, tier.cardsPerDay)) {
      for (const leg of cardByBand.get(band)?.legs ?? []) {
        const k = legKey(leg);
        if (seen.has(k)) collisions.push({ tier: tier.id, leg: k, bands: [seen.get(k), band] });
        else seen.set(k, band);
      }
    }
  }
  return collisions;
}
