/**
 * DOES THIS ODDS ARTIFACT DESCRIBE THIS CARD?
 *
 * `odds-latest.json` is a pointer, and pointers go stale. The card builder rolls to the next event
 * as soon as one is scheduled; the odds capture runs Tue/Thu/Sat. On 2026-09-06 that left
 * card-latest on "Noche UFC: Silva vs. Delgado" (event 600060772, 13 bouts) while odds-latest still
 * held the finished "UFC Fight Night: Hooker vs. Parnasse" (600059993, 10 bouts). Every bout id in
 * one was absent from the other, so every join came back empty — and only that accident kept a
 * price from a completed event off a page about an upcoming one.
 *
 * THREE STATES, and the middle one is the whole point:
 *
 *   COVERS         the odds are for this card
 *   NOT_YET        the odds describe a DIFFERENT event, or carry no bouts — this card has not been
 *                  priced yet. A legitimate window, not a fault.
 *   DRIFT          both describe the same event and still share no bout. Two artifacts that should
 *                  agree and do not; a real defect.
 *
 * Collapsing NOT_YET into DRIFT turns a quiet correct window into a red gate — a mistake already
 * made twice on this join. Collapsing it into COVERS would publish a finished card's prices.
 */

export const ODDS_COVER = Object.freeze({ COVERS: "COVERS", NOT_YET: "NOT_YET", DRIFT: "DRIFT" });

const idsOf = (bouts) => new Set((bouts ?? []).map((b) => String(b?.boutId ?? "")).filter(Boolean));
const eventIdOf = (doc) => {
  const v = doc?.event?.providerEventId ?? doc?.event?.id ?? null;
  return v == null ? null : String(v);
};

/**
 * @param {object} card  card-latest.json
 * @param {object} odds  odds-latest.json
 * @returns {{state: string, reason: string, overlap: number, cardEventId: string|null, oddsEventId: string|null}}
 */
export function oddsCoverCard(card, odds) {
  const cardEventId = eventIdOf(card);
  const oddsEventId = eventIdOf(odds);
  const cardIds = idsOf(card?.bouts);
  const oddsIds = idsOf(odds?.bouts);
  const overlap = [...oddsIds].filter((id) => cardIds.has(id)).length;

  if (cardEventId && oddsEventId && cardEventId !== oddsEventId) {
    return {
      state: ODDS_COVER.NOT_YET, overlap, cardEventId, oddsEventId,
      reason: `the odds artifact is for event ${oddsEventId}; this card is event ${cardEventId} — no capture has run for it yet`,
    };
  }
  if (oddsIds.size === 0) {
    return { state: ODDS_COVER.NOT_YET, overlap, cardEventId, oddsEventId, reason: "the odds artifact carries no priced bout yet" };
  }
  if (overlap > 0) {
    return { state: ODDS_COVER.COVERS, overlap, cardEventId, oddsEventId, reason: `${overlap} bout(s) join` };
  }
  return {
    state: ODDS_COVER.DRIFT, overlap, cardEventId, oddsEventId,
    reason: `both artifacts claim event ${cardEventId ?? "(unnamed)"} yet share no bout — they are written by the same job and must not drift`,
  };
}

/** Prices may only be joined to a card the odds actually cover. */
export const oddsUsableForCard = (card, odds) => oddsCoverCard(card, odds).state === ODDS_COVER.COVERS;
