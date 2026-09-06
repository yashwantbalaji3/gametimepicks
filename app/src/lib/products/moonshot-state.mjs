/**
 * MOONSHOT — one owner for what this product's state actually is.
 *
 * WHAT WAS WRONG
 * --------------
 * Four artifacts described "Moonshot" and no two agreed, while the public page asserted something
 * none of them supported. Observed 2026-09-01:
 *
 *   moonshot-lane/active.json        written 2026-08-17   status "active"; lanes A and B each hold a
 *                                                         step-1 card, six legs, every result null
 *   product-ledger/moonshot.json     written 2026-07-06   7 settled cards, 2026-06-23 … 2026-07-06,
 *                                                         all lost, $25 each
 *   mr-dub/portfolio.json .moonshot  written 2026-07-07   status "stopped", record 0-1, pending 0,
 *                                                         and the card it names is a World Cup
 *                                                         parlay — a retired competition
 *   the public page                                       "Two independent longshot cards published
 *                                                         daily", "Lifetime paper record 0-1",
 *                                                         "0 Pending · 1 Settled"
 *
 * Three of the page's claims were false at once: it advertised daily publication for a product that
 * had published nothing in fifteen days, it reported the smaller of two settled counts as "lifetime",
 * and it showed zero pending while two published cards sat open.
 *
 * WHY IT CANNOT PUBLISH, AND WHY IT CANNOT SETTLE
 * ----------------------------------------------
 * Two separate breaks, and the second is the one that traps the open cards:
 *
 *   1. No workflow generates it. `activate-moonshot-candidates.mjs` is a dry-run DECISION TOOL whose
 *      `--apply` is deliberately refused — the Mr. Dub ledger models a single active card, not two
 *      concurrent lanes with summed exposure, so activating both would mis-account the money. That
 *      refusal is correct and was written on purpose. `lineup-aware-refresh.yml` can place a Moonshot
 *      card, but it is dispatch-only (its cron was a one-off World Cup window, since expired and
 *      removed), World Cup scoped, and AUTO_PLACE_MOONSHOT defaults false.
 *
 *   2. (CLOSED, Program 236.) The wired settler could not see these cards. `settle-paper-product-cards.mjs`
 *      walks `data/internal/product-cards/`, a directory that does not exist, and the Aug-17 cards
 *      were written straight into the lane artifact without ever being registered there.
 *
 *      This note also carried a second reason that was simply WRONG, and it is worth recording
 *      because it is what kept the product dead: "not one of the six legs carries a gamePk, so even
 *      registered they could not be joined to an official box score." Every leg carries one. It sits
 *      inside the legId — `moonshot:mlb:824725:batter_total_bases:Gabriel_Moreno` — rather than in a
 *      field of its own, and reading only the fields made it look absent. All three cards were graded
 *      from the official box score on 2026-09-06 with no new data of any kind.
 *
 *      `scripts/products/settle-ladder-cards.mjs` now reads this lane artifact directly and runs
 *      nightly. A cause that was never true is a worse trap than a broken pipeline, because nobody
 *      re-checks it.
 *
 * WHAT THIS DOES
 * --------------
 * Derives the state from the artifacts plus the two facts the caller supplies — whether anything
 * generates the product and whether anything can settle its open cards — and REPORTS the
 * disagreements rather than quietly choosing a winner. Two ledgers describing different eras of a
 * product is a fact about its history; hiding it behind whichever number is smaller would be the same
 * defect in a new place.
 *
 * It does not decide whether Moonshot should be repaired, paused or retired. That is a product
 * decision with a real answer only the founder has, and this module names it rather than assuming it.
 *
 * Pure. Every input is passed in.
 */

/** Lifecycle states this product can be in. */
export const MOONSHOT_LIFECYCLE = [
  "PUBLISHED",        // a current card exists for today
  "SETTLING",         // published cards await official results, and a settler can reach them
  "ABANDONED",        // published cards can never be settled — no settler reaches them
  "NOT_GENERATING",   // nothing generates the product, and no card is left open
  "STALE",            // a generator exists but has not produced for longer than its cadence
  "RETIRED",          // explicitly retired; history retained, removed from current generation
  "UNKNOWN",          // artifacts unreadable; never presented as healthy
];

/**
 * Does anything generate or settle this product today? Both are false, each for a reason recorded
 * above and pinned by a guard in the test beside this file. They are constants rather than inferred
 * at render time because a static page must not shell out to read the workflow directory — and a
 * guard that fails the build is a stronger signal than a value that silently flips.
 */
export const MOONSHOT_HAS_SCHEDULED_GENERATOR = false;
/* TRUE since Program 236: `scripts/products/settle-ladder-cards.mjs` is invoked by nightly-settle and
 * reads `moonshot-lane/active.json` directly, grading each leg from the official StatsAPI box score
 * joined by the gamePk carried in its legId. The three cards open since 2026-08-17 settled on
 * 2026-09-06. It records outcomes in a prospective lifecycle ledger and never rewrites the protected
 * bankroll, which is why settling them did not restate money that predates the repair. */
export const MOONSHOT_HAS_WIRED_SETTLER = true;

const DAY = 86_400_000;
const dayOf = (iso) => (typeof iso === "string" ? iso.slice(0, 10) : null);

/**
 * Whole days between two ET product dates.
 *
 * Deliberately date-to-date rather than instant-to-instant: a reader who sees "published 2026-08-17"
 * beside today's 2026-09-01 means fifteen days, and anchoring the arithmetic to a time of day made
 * the number read fourteen for most of the day.
 */
function daysBetween(fromDate, toDate) {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / DAY) : null;
}
const isWin = (o) => /^w(on|in)?$/i.test(String(o ?? ""));
const isLoss = (o) => /^los[ts]$/i.test(String(o ?? ""));

/**
 * Every card still carrying an undecided result, with the reason it cannot be graded.
 *
 * A leg is settleable only if it names the game it belongs to. `gamePk` is MLB's identity and the key
 * every official-results join in this repository uses; a leg without one cannot be matched to a box
 * score by any means that is not name-guessing.
 *
 * IT IS NOT ALWAYS A FIELD. This looked only at `gamePk` / `gameId` / `fixtureId` and concluded that
 * none of the Aug-17 legs had game identity — which became the recorded reason the product could not
 * be settled, and kept it shut for nineteen days. Every one of those legs carries its gamePk inside
 * the legId: `moonshot:mlb:824725:batter_total_bases:Gabriel_Moreno`. The identity was there the
 * whole time, in a place nothing thought to look.
 */
const gameIdentityOf = (leg) =>
  leg?.gamePk ?? leg?.gameId ?? leg?.fixtureId ??
  (String(leg?.legId ?? "").split(":").find((p) => /^\d{4,}$/.test(p)) ?? null);

function openCardsOf(lane, settledCardIds = new Set()) {
  const out = [];
  const visit = (ladder, laneId) => {
    for (const step of ladder ?? []) {
      const card = step?.card;
      if (!card || isWin(card.result) || isLoss(card.result)) continue;
      // A card the lifecycle ledger has already graded is CLOSED, whatever this artifact still says.
      // The settler deliberately does not rewrite the lane — that artifact feeds the protected
      // bankroll — so the lane alone would report a settled card as open for ever.
      if (card.cardId && settledCardIds.has(card.cardId)) continue;
      const legs = Array.isArray(card.legs) ? card.legs : [];
      const legsWithoutGameId = legs.filter((l) => !gameIdentityOf(l)).length;
      out.push({
        cardId: card.cardId ?? null,
        laneId: laneId ?? null,
        slateDate: dayOf(lane?.generatedAt),
        stake: typeof card.stake === "number" ? card.stake : null,
        legs: legs.length,
        legsWithoutGameId,
        settleable: legs.length > 0 && legsWithoutGameId === 0,
      });
    }
  };
  for (const l of lane?.lanes ?? []) visit(l.ladder, l.laneId);
  // Older artifacts carry a single top-level ladder instead of named lanes.
  if (!(lane?.lanes ?? []).length) visit(lane?.ladder, null);
  return out;
}

/**
 * Is this a real published card, or an empty shell?
 *
 * `buildDailyPortfolio` synthesizes two Moonshot lane placeholders for EVERY date — legs `[]`, stake
 * $0, status "awaiting" — including dates seven months away. The page tested liveness with
 * `cards.filter(product === "moonshot").length > 0`, which is therefore true on every day the site
 * has ever rendered. That constant-true predicate is what lit "Day 1 · LIVE" on the ladder and
 * promised "settles overnight from official results" for cards that do not exist.
 *
 * A card with no legs is not a card.
 */
export function isPublishedCard(card) {
  return Array.isArray(card?.legs) && card.legs.length > 0;
}

/**
 * @param {object}      args
 * @param {object|null} args.lane                  moonshot-lane/active.json
 * @param {object|null} args.portfolioMoonshot     the `.moonshot` block of the protected portfolio
 * @param {object|null} args.productLedger         product-ledger/moonshot.json
 * @param {boolean}     args.hasScheduledGenerator does ANY workflow generate this product
 * @param {boolean}     args.hasWiredSettler       can ANY wired settler reach its open cards
 * @param {string}      args.today                 ET product date
 * @param {string[]}   [args.settledCardIds]       card ids the lifecycle ledger has already graded
 */
export function deriveMoonshotState({
  lane, portfolioMoonshot, productLedger,
  hasScheduledGenerator, hasWiredSettler, today,
  /** Card ids the lifecycle ledger has graded. Passed in; this module still reads nothing. */
  settledCardIds = [],
}) {
  const contradictions = [];

  const laneDate = dayOf(lane?.generatedAt);
  const daysSince = laneDate ? daysBetween(laneDate, today) : null;

  const openCards = openCardsOf(lane, new Set(settledCardIds));
  const openExposure = openCards.reduce((s, c) => s + (c.stake ?? 0), 0);
  const unsettleable = openCards.filter((c) => !c.settleable);

  /*
   * A file's opinion of itself is not its state. `active.json` still says "active" fifteen days after
   * it was written — freshness outranks the self-declaration, the same rule the page's status chip
   * already applies.
   */
  if (lane?.status === "active" && daysSince !== null && daysSince >= 2) {
    contradictions.push(
      `moonshot-lane/active.json declares status "active" but was last written ${daysSince} days ago (${laneDate})`,
    );
  }

  // The two record sources, reported side by side rather than reconciled by fiat.
  const ledgerResults = Array.isArray(productLedger?.results) ? productLedger.results : null;
  const ledgerRecord = ledgerResults
    ? {
        wins: ledgerResults.filter((r) => isWin(r.outcome)).length,
        losses: ledgerResults.filter((r) => isLoss(r.outcome)).length,
        settled: ledgerResults.length,
        staked: ledgerResults.reduce((s, r) => s + (Number(r.stake) || 0), 0),
        returned: ledgerResults.reduce((s, r) => s + (Number(r.payout) || 0), 0),
        source: "product-ledger/moonshot.json",
        fromDate: ledgerResults.map((r) => r.date).filter(Boolean).sort()[0] ?? null,
        throughDate: ledgerResults.map((r) => r.date).filter(Boolean).sort().at(-1) ?? null,
      }
    : null;

  const pr = portfolioMoonshot?.record;
  const portfolioRecord = pr
    ? {
        wins: pr.wins ?? 0,
        losses: pr.losses ?? 0,
        settled: (pr.wins ?? 0) + (pr.losses ?? 0) + (pr.voids ?? 0),
        pending: pr.pending ?? 0,
        source: "mr-dub/portfolio.json .moonshot",
      }
    : null;

  if (ledgerRecord && portfolioRecord && ledgerRecord.settled !== portfolioRecord.settled) {
    contradictions.push(
      `two settled counts for one product: ${portfolioRecord.source} says ${portfolioRecord.settled}, ` +
      `${ledgerRecord.source} says ${ledgerRecord.settled}` +
      `${ledgerRecord.fromDate ? ` (${ledgerRecord.fromDate} … ${ledgerRecord.throughDate})` : ""}`,
    );
  }

  if (portfolioRecord && openCards.length && portfolioRecord.pending !== openCards.length) {
    contradictions.push(
      `${portfolioRecord.source} reports ${portfolioRecord.pending} pending while ${openCards.length} published card(s) are still open`,
    );
  }

  if (portfolioMoonshot?.status === "stopped" && lane?.status === "active") {
    contradictions.push(`the portfolio says "stopped" while the lane artifact says "active"`);
  }

  if (unsettleable.length) {
    const legs = unsettleable.reduce((s, c) => s + c.legsWithoutGameId, 0);
    contradictions.push(
      `${unsettleable.length} published card(s) carry ${legs} leg(s) with no game identity — they cannot be joined to an official box score`,
    );
  }

  let lifecycle;
  if (!lane && !productLedger && !portfolioMoonshot) lifecycle = "UNKNOWN";
  else if (openCards.length && !hasWiredSettler) lifecycle = "ABANDONED";
  else if (openCards.length) lifecycle = "SETTLING";
  else if (!hasScheduledGenerator) lifecycle = "NOT_GENERATING";
  else if (laneDate === today) lifecycle = "PUBLISHED";
  else lifecycle = "STALE";

  const since = `${laneDate ?? "its last run"}${daysSince !== null ? ` (${daysSince} days ago)` : ""}`;

  /*
   * The public sentence, derived. It never says "daily", it never calls an ungradeable card pending,
   * and when the product is broken it says which half is broken.
   */
  const publicNote =
    lifecycle === "ABANDONED"
      ? `Moonshot is not running. The last cards were published ${since} and were never settled: nothing in the nightly settlement path reaches them, and their legs carry no game identity to match against an official box score. No card has been published since, and no scheduled job generates one. The settled history below is closed — nothing is being added to it, and the open cards above will not be graded.`
      : lifecycle === "NOT_GENERATING"
        ? `Moonshot is not running. No card has been published since ${since}, and no scheduled job generates one. The settled history below is closed.`
        : lifecycle === "SETTLING"
          ? `${openCards.length} Moonshot card(s) published ${since} are awaiting official results.`
          : lifecycle === "STALE"
            ? `The last Moonshot card was published ${since}; today's has not been produced.`
            : lifecycle === "PUBLISHED"
              ? `Today's Moonshot card is published. Paper-only, separate from the Bank Builder.`
              : `Moonshot's current state cannot be established from its artifacts.`;

  return {
    lifecycle,
    running: lifecycle === "PUBLISHED" || lifecycle === "SETTLING",
    lastPublishedDate: laneDate,
    daysSincePublished: daysSince,
    hasScheduledGenerator,
    hasWiredSettler,
    openCards,
    openCardCount: openCards.length,
    openExposure,
    unsettleableCardCount: unsettleable.length,
    ledgerRecord,
    portfolioRecord,
    /*
     * The record a surface should DISPLAY when it has room for only one. The product ledger wins: it
     * is the per-card settlement log, it covers the fuller history, and the portfolio block's figure
     * describes a single World Cup card from a retired competition. The disagreement is not hidden —
     * `contradictions` still carries it, and /moonshot prints both — but two surfaces printing two
     * different "records" for one product is the contradiction this owner exists to end.
     */
    displayRecord: ledgerRecord
      ? { wins: ledgerRecord.wins, losses: ledgerRecord.losses, voids: 0, pending: 0, source: ledgerRecord.source }
      : portfolioRecord
        ? { ...portfolioRecord, voids: 0 }
        : null,
    contradictions,
    publicNote,
    /*
     * The one question this module refuses to answer, split in two (P231 · K1).
     *
     * The public string used to LEAD WITH THE ANSWER TOKEN — `/moonshot` rendered "Open decision:
     * MOONSHOT_REPAIR_PAUSE_OR_RETIRE — publishing needs…" to every visitor. The token is the exact
     * phrase the founder types to authorise an action on this product; it is operating protocol, and
     * a public page is not where it belongs.
     *
     * NOTHING ABOUT READINESS IS HIDDEN BY THIS. The paused state and the full reason it is paused
     * stay public, word for word — concealing those would be the worse failure. Only the token moves,
     * to the protected console where the decision is actually answered.
     */
    /*
     * GATED ON THE BLOCKER, NOT ON THE LABEL.
     *
     * This used to render only when the lifecycle read ABANDONED or NOT_GENERATING. Program 236 wired
     * a settler, which moved the label to SETTLING — and the disclosure silently disappeared even
     * though the product still cannot publish. A notice that vanishes because a DIFFERENT problem was
     * fixed is worse than no notice: the page would have gone quiet about a live limitation.
     *
     * Publishing is blocked exactly while nothing generates the product. That is the condition.
     */
    founderDecision:
      !hasScheduledGenerator || lifecycle === "ABANDONED"
        ? "Settling is resolved: the lane's cards are graded nightly from the official box score. Publishing still needs multi-lane exposure accounting in the paper ledger, because the Mr. Dub ledger models a single active card and two concurrent lanes would mis-account the money. Whether to build that, formally pause the product, or retire it is a product decision."
        : null,
    /** The answer token. PROTECTED-CONSOLE ONLY — never rendered on a public route. */
    founderGateToken:
      !hasScheduledGenerator || lifecycle === "ABANDONED"
        ? "MOONSHOT_REPAIR_PAUSE_OR_RETIRE"
        : null,
  };
}
