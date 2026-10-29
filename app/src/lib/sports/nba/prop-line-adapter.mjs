/**
 * NBA ADAPTER for the sport-agnostic player-prop view (lib/odds/prop-line-view.mjs — the contract is documented there).
 *
 * Reuses, never re-implements: the pairing of published players × families with their chosen offer is line-board.mjs
 * nbaLineCandidates (the same one the private board uses), and the comparison is line-comparison.mjs compareToLine
 * (matching, the 6-hour / before-tip freshness rule, the difference). Server-only by convention: nothing "use client"
 * may import this (prop-line-client-graph.test.mjs).
 */
import { compareToLine, LINE_MAX_AGE_HOURS, MARKET_KEYS, UNAVAILABLE_REASON } from "./line-comparison.mjs";
import { nbaLineCandidates } from "./line-board.mjs";
import { bookmakerLabel } from "../../sportsbook-comparison.ts";

/** Reader-facing market names for the official families (the families the model projects; anything else is unsupported). */
export const NBA_MARKET_LABEL = Object.freeze({
  pts: "Points",
  reb: "Rebounds",
  ast: "Assists",
  threePm: "3-pointers made",
  pra: "Points + rebounds + assists",
  ptsReb: "Points + rebounds",
  ptsAst: "Points + assists",
});

export const NBA_PROP_LINE_ADAPTER = Object.freeze({
  sport: "nba",
  maxAgeHours: LINE_MAX_AGE_HOURS,
  marketLabel: (family) => (Object.prototype.hasOwnProperty.call(MARKET_KEYS, family) ? NBA_MARKET_LABEL[family] : null),
  bookLabel: (book) => bookmakerLabel(book),
  reasonText: Object.freeze({ ...UNAVAILABLE_REASON, UNSUPPORTED_MARKET: "The model does not project this statistic." }),
  staleReasons: Object.freeze(["STALE", "CAPTURED_AFTER_TIP", "STARTED"]),
  unsupportedReasons: Object.freeze(["MARKET_MISMATCH"]),
  compare: (i) => compareToLine({ family: i.marketKey, median: i.projection }, i.offer, { eventId: i.eventId, athleteId: i.player?.id, slateDate: i.slateDate, tipUtc: i.tip, asOf: i.asOf }),
});

/**
 * Adapter inputs for one slate (optionally one game). By default only player × family pairs with an offer are returned —
 * a player with no line stays projection-only on the board and is counted in `withoutLine`, not listed as 1,000 rows.
 * @param {{ lane: any, priceRecords: any[], asOf: string, eventId?: string|null, withLineOnly?: boolean }} input
 */
export function nbaPropLineInputs({ lane, priceRecords = [], asOf, eventId = null, withLineOnly = true }) {
  const all = nbaLineCandidates({ lane, priceRecords }).filter((c) => eventId == null || c.eventId === String(eventId));
  const inputs = all.filter((c) => !withLineOnly || c.line).map((c) => ({
    key: `${c.eventId}|${c.athleteId}|${c.family}`, eventId: c.eventId, slateDate: c.slateDate, tip: c.tipUtc, asOf,
    player: { id: c.athleteId, name: c.name, team: c.team }, marketKey: c.family, projection: c.median, offer: c.line,
  }));
  return { inputs, withoutLine: all.filter((c) => !c.line).length, total: all.length };
}
