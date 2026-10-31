/**
 * NFL SOCIAL LINE COMPARISON (founder order 2026-10-31). PURE: no I/O, no clock. Colour on a social card is the arithmetic
 * of the official projection (ESTIMATE values included, with their label) against one matched line. It says nothing
 * about edge, and it is separate from publicDirectionGate, which keeps governing the website and is not read here.
 */
export const COMPARISON_NOTE = Object.freeze({ comparisonIsNotEdge: true, surface: "SOCIAL_ONLY", rule: "official projection minus line: above = green OVER with the over price, below = red UNDER with the under price, equal or invalid = neutral", websiteGate: "publicDirectionGate, unchanged and not consulted" });
export const COMPARISON_LEGEND = "▲ model above line · ▼ model below line · math comparison, not a recommendation";
export const NEUTRAL_REASON = Object.freeze({
  NO_PROJECTION: "NO_PROJECTION", NO_LINE: "NO_LINE", UNMATCHED: "UNMATCHED", INELIGIBLE_BOOK: "INELIGIBLE_BOOK", AMBIGUOUS_LINE: "AMBIGUOUS_LINE",
  CAPTURED_AFTER_KICKOFF: "CAPTURED_AFTER_KICKOFF", STALE_LINE: "STALE_LINE", INVALID_LINE: "INVALID_LINE", INVALID_ODDS: "INVALID_ODDS", ONE_SIDED_MARKET: "ONE_SIDED_MARKET",
});
const american = (p) => Number.isInteger(p) && Math.abs(p) >= 100;

/** A neutral row, always with its reason. */
export const neutralComparison = (reason, extra = {}) => ({ state: "NEUTRAL", colour: "neutral", glyph: "", side: null, price: null, reason, comparisonIsNotEdge: true, ...extra });

/**
 * @param {{ projection:number|null|undefined, quote:any, reason?:string|null, expected:{eventId:string, playerId:string, market:string}, stale?:boolean }} o
 *   `reason` is why the offer rule produced no quote. `expected` is the row the quote must belong to.
 */
export function nflPropComparison({ projection, quote, reason = null, expected, stale = false }) {
  if (!Number.isFinite(projection)) return neutralComparison(NEUTRAL_REASON.NO_PROJECTION);
  if (!quote) return neutralComparison(reason ?? NEUTRAL_REASON.NO_LINE, { projection });
  if (quote.canonicalEventId !== `nfl-${expected.eventId}` || quote.playerId !== expected.playerId || quote.market !== expected.market) return neutralComparison(NEUTRAL_REASON.UNMATCHED, { projection });
  const { line } = quote;
  if (!Number.isFinite(line) || line <= 0) return neutralComparison(NEUTRAL_REASON.INVALID_LINE, { projection });
  if (stale) return neutralComparison(NEUTRAL_REASON.STALE_LINE, { projection, line });
  const difference = Math.round((projection - line) * 10000) / 10000;
  if (difference === 0) return { state: "EQUAL", colour: "neutral", glyph: "", side: null, price: null, reason: null, projection, line, difference, comparisonIsNotEdge: true };
  const over = difference > 0;
  const price = over ? quote.overPrice : quote.underPrice;
  if (!american(price)) return neutralComparison(NEUTRAL_REASON.INVALID_ODDS, { projection, line, difference });
  return { state: over ? "OVER" : "UNDER", colour: over ? "green" : "red", glyph: over ? "▲" : "▼", side: over ? "OVER" : "UNDER", price, reason: null, projection, line, difference, comparisonIsNotEdge: true };
}

/** What the card prints, its class, in one place. */
export function comparisonCell(c, priceText) {
  if (c.state === "OVER" || c.state === "UNDER") return { text: `${c.glyph} ${c.state} ${priceText(c.price)}`, cls: `vs ${c.state.toLowerCase()}` };
  if (c.state === "EQUAL") return { text: "At the line", cls: "vs none" };
  const text = { STALE_LINE: "Stale quote", INVALID_ODDS: "No price", INVALID_LINE: "No line", NO_PROJECTION: "No model" }[c.reason] ?? "No line";
  return { text, cls: "vs none" };
}

/** Counts for the package and the run report. */
export function comparisonCounts(list) {
  const n = { over: 0, under: 0, equal: 0, neutral: 0, reasons: {} };
  for (const c of list) {
    n[c.state.toLowerCase()] += 1;
    if (c.reason) n.reasons[c.reason] = (n.reasons[c.reason] ?? 0) + 1;
  }
  return n;
}
