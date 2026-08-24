/**
 * THE RISK-SUBSTITUTE RULE — one owner (Program 196 · Release B2).
 *
 * Two surfaces answer the same reader question — "this risk level produced nothing today; what do
 * I look at instead?" — and until this file each carried its own copy of the answer. The tier grid
 * (/build) hardcoded "a longer price than this bankroll is normally shown", which is TRUE there
 * only by an accident of structure: tier scopes are prefixes of the risk order, so the calmest
 * available card always sits beyond an empty scope. The sport-lane version derived the direction
 * because for an arbitrary empty band the substitute is calmer half the time. Same rule, two
 * owners, one of them right for an unstated reason — the shape that drifts. Both now call here.
 *
 * THE RULE, stated once:
 *   1. A substitute is offered ONLY where the asked-for scope produced nothing at all — never to
 *      upgrade something that exists.
 *   2. The substitute is the CALMEST card on the board, never the next rung up. A reader handed a
 *      fallback lands on the mildest thing available instead of being walked up the ladder.
 *   3. The card keeps its own band name. The band IS the risk statement; relabelling a medium card
 *      as low to fill a slot is the one forbidden move (thresholds are never widened either —
 *      that is the same lie in arithmetic form).
 *   4. The DIRECTION of the swap is derived by comparison, never asserted. A wrong risk direction
 *      is worse than no substitute at all.
 *   5. The measured cause travels with the offer when the caller has one — "no combination of
 *      today's prices lands in this band — 2 legs → +110 (medium)" says more than "nothing today".
 */

export const SUBSTITUTE_RULE_VERSION = 1;

/** The calmest band that actually has a card, in the caller's own risk order. Null when none has. */
export function calmestAvailableBand(riskOrder, availableBands) {
  const have = new Set(availableBands ?? []);
  return (riskOrder ?? []).find((b) => have.has(b)) ?? null;
}

/**
 * Which way the swap moves, from the reader's point of view.
 * @returns {"RISKIER"|"CALMER"|"SAME"|null} null when either band is unknown to the order
 */
export function substituteDirection(riskOrder, wantedBand, offeredBand) {
  const wanted = riskOrder.indexOf(wantedBand);
  const offered = riskOrder.indexOf(offeredBand);
  if (wanted === -1 || offered === -1) return null;
  return offered > wanted ? "RISKIER" : offered < wanted ? "CALMER" : "SAME";
}

/** Reader-facing sentence for a derived direction. One place, so the wording cannot fork. */
export function directionSentence(direction) {
  switch (direction) {
    case "RISKIER": return "a longer price, and a longer price is more risk, than this band describes";
    case "CALMER": return "a shorter price, and less risk, than this band describes";
    case "SAME": return "the same band";
    default: return "an unstated direction"; // unreachable when both bands come from the order; kept fail-visible
  }
}

/**
 * The full offer for one empty scope, or null when rule 1 or 2 gives nothing to offer.
 *
 * @param {object} args
 * @param {readonly string[]} args.riskOrder
 * @param {readonly string[]} args.availableBands  bands that actually produced a card
 * @param {string} args.emptyBand                  the band (or a scope's calmest band) that came up empty
 * @param {string|null} [args.measuredCause]       the ladder's own skip reason, with prices reached
 */
export function substituteOffer({ riskOrder, availableBands, emptyBand, measuredCause = null }) {
  if ((availableBands ?? []).includes(emptyBand)) return null;   // rule 1: never upgrade what exists
  const offered = calmestAvailableBand(riskOrder, availableBands);
  if (!offered) return null;                                     // nothing was built: nothing to point at
  const direction = substituteDirection(riskOrder, emptyBand, offered);
  return {
    band: emptyBand,
    offered,
    direction,
    measuredCause: measuredCause ?? null,
    note: `${measuredCause ? `${measuredCause}. ` : `Nothing on this slate priced into ${emptyBand}. `}` +
      `The calmest card built today is ${offered} — ${directionSentence(direction)}.`,
  };
}
