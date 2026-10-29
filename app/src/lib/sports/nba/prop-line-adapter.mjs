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

/** Every refusal reason of compareToLine (plus the adapter's own) → the reader-facing state (lib/odds/prop-line-view.mjs). */
export const NBA_STATE_OF_REASON = Object.freeze({
  NO_PROJECTION: "UNAVAILABLE",
  NO_LINE: "UNAVAILABLE",
  UNMATCHED: "MISMATCH",
  WRONG_DAY: "MISMATCH",
  MARKET_MISMATCH: "UNSUPPORTED",
  UNSUPPORTED_MARKET: "UNSUPPORTED",
  STALE: "STALE",
  STARTED: "STALE",
  CAPTURED_AFTER_TIP: "AFTER_CUTOFF",
  INVALID_LINE: "SUSPENDED",
  SUSPENDED: "SUSPENDED",
  INELIGIBLE: "SUSPENDED",
});

export const NBA_PROP_LINE_ADAPTER = Object.freeze({
  sport: "nba",
  maxAgeHours: LINE_MAX_AGE_HOURS,
  marketLabel: (family) => (Object.prototype.hasOwnProperty.call(MARKET_KEYS, family) ? NBA_MARKET_LABEL[family] : null),
  bookLabel: (book) => bookmakerLabel(book),
  reasonText: Object.freeze({ ...UNAVAILABLE_REASON, UNSUPPORTED_MARKET: "The model does not project this statistic.", SUSPENDED: "The sportsbook suspended this market.", INELIGIBLE: "The line is not eligible for comparison." }),
  stateOfReason: NBA_STATE_OF_REASON,
  // A captured offer the provider marked suspended (or that the capture marked ineligible) is never compared.
  compare: (i) => (i.offer && i.offer.suspended === true ? { direction: "UNAVAILABLE", reason: "SUSPENDED" }
    : i.offer && i.offer.eligible === false ? { direction: "UNAVAILABLE", reason: "INELIGIBLE" }
    : compareToLine({ family: i.marketKey, median: i.projection }, i.offer, { eventId: i.eventId, athleteId: i.player?.id, slateDate: i.slateDate, tipUtc: i.tip, asOf: i.asOf })),
});

/**
 * Adapter inputs for one slate (optionally one game). By default only player × family pairs with an offer are returned —
 * a player with no line stays projection-only on the board and is counted in `withoutLine`, not listed as 1,000 rows.
 * @param {{ lane: any, priceRecords: any[], asOf: string, eventId?: string|null, withLineOnly?: boolean }} input
 * @returns {{ inputs: any[], withoutLine: number, total: number, projections: number }}
 */
export function nbaPropLineInputs({ lane, priceRecords = [], asOf, eventId = null, withLineOnly = true }) {
  const all = nbaLineCandidates({ lane, priceRecords }).filter((c) => eventId == null || c.eventId === String(eventId));
  const inputs = all.filter((c) => !withLineOnly || c.line).map((c) => ({
    key: `${c.eventId}|${c.athleteId}|${c.family}`, eventId: c.eventId, slateDate: c.slateDate, tip: c.tipUtc, asOf,
    player: { id: c.athleteId, name: c.name, team: c.team }, marketKey: c.family, projection: c.median, offer: c.line,
  }));
  // `projections`: the coverage denominator — every published official projection on this slate / game (a pair whose
  // median is a number), with or without a line.
  const projections = all.filter((c) => typeof c.median === "number" && Number.isFinite(c.median)).length;
  return { inputs, withoutLine: all.filter((c) => !c.line).length, total: all.length, projections };
}
