/**
 * THE ONE RULE FOR A LINE BESIDE A HISTORY (NFL player evidence, Trends): a hit rate is shown only against an OBSERVED
 * line, and wherever it is shown the reader sees the line value, the sportsbook and when it was captured (ET).
 *
 * Input is an offer slot AFTER the public sanitiser (public-offer-sanitizer.mjs): `null` (nothing captured), the
 * withheld shape (an ineligible operator's offer: no book, no line), or { sportsbook, line, capturedAt, ... }.
 * PURE and client-safe (no I/O, no internal paths).
 *
 * States:
 *   NO_LINE            nothing captured for this market
 *   WITHHELD           an offer exists but its operator is not eligible ⇒ the line is withheld, no hit rate
 *   NOT_BEFORE_KICKOFF the offer has no readable capture instant, or it was captured at/after kickoff ⇒ no hit rate
 *   OBSERVED           line + book + capture instant before kickoff ⇒ a record may be computed against `line`
 */
import { etStamp } from "../../et-stamp.mjs";
import { isWithheldOffer } from "../odds/public-offer-sanitizer.mjs";

/** @param {any} market @param {string|null|undefined} kickoffUtc */
export function lineView(market, kickoffUtc) {
  if (market == null) return { state: "NO_LINE" };
  if (isWithheldOffer(market) || market.sportsbook == null) return { state: "WITHHELD" };
  if (typeof market.line !== "number" || !Number.isFinite(market.line)) return { state: "NO_LINE" };
  const cap = Date.parse(market.capturedAt ?? ""), kick = Date.parse(kickoffUtc ?? "");
  if (!Number.isFinite(cap) || !Number.isFinite(kick) || !(cap < kick)) return { state: "NOT_BEFORE_KICKOFF" };
  return { state: "OBSERVED", line: market.line, sportsbook: String(market.sportsbook), capturedAt: market.capturedAt, captured: etStamp(market.capturedAt) };
}

/** "55.5 at DraftKings, captured Nov 15, 12:00 PM ET" for an OBSERVED line view; null otherwise. */
export function lineCaption(v) {
  return v?.state === "OBSERVED" ? `${v.line} at ${v.sportsbook}, captured ${v.captured}` : null;
}

/** The sentence a surface prints when no hit rate is shown, by state (OBSERVED ⇒ null). */
export const NO_RATE_TEXT = Object.freeze({
  NO_LINE: "No sportsbook line was captured for this market before kickoff, so no hit rate is shown.",
  WITHHELD: "A sportsbook line exists for this market, but its operator is not on the eligible list, so the line is withheld and no hit rate is shown.",
  NOT_BEFORE_KICKOFF: "The captured line has no capture time before kickoff, so no hit rate is shown.",
});
