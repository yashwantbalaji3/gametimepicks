/**
 * MODEL BESIDE MARKET, FOR A READER (founder directive 2026-10-12).
 *
 * A player row shows the model's projection and, when one was captured, the sportsbook's market for the same event,
 * player and family. This file turns that pair into the two things a reader asks next, and nothing more:
 *
 *   WHEN was the price taken  — always a date and a time, "Last captured Sat Oct 10, 1:32 PM ET". A weekday alone
 *                                cannot tell this Saturday's price from last Saturday's, and an undated price reads
 *                                as a live one. A frozen capture is never current; the label says so.
 *   HOW FAR APART they are    — yardage / count families: model value minus the posted line, in the row's unit.
 *                                anytime TD: model probability minus the probability the book's own price implies.
 *
 * ⚠ IT IS A COMPARISON, NOT A PICK. No side ("over"/"under"), no edge, no stake. The difference says where the
 * displayed projection sits relative to the line; it is not a qualified recommendation and the row never calls it one.
 *
 * ⚠ NOTHING IS INVENTED. No line → no line comparison. No price → no implied probability. A non-finite number on
 * either side → null. The implied probability is from ONE side's price, so it still contains the book's margin; the
 * label says so rather than pretending it is a fair probability.
 */

/** Probability implied by an American price, margin included. `-120` → 0.5455, `+150` → 0.4. Null when not a price. */
export function impliedFromAmerican(odds) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0 || Math.abs(odds) < 100) return null;
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/**
 * @param {"yards"|"count"|"probability"|string} kind  the row family's kind (forecast-view.mjs)
 * @param {number} value  the model number the row DISPLAYS (median yards, expected receptions, or a 0–1 probability)
 * @param {{line?: number|null, yesOdds?: number|null}|null|undefined} market  the captured market for this row
 * @returns {null | {type: "LINE", model: number, line: number, diff: number}
 *               | {type: "PRICE", model: number, implied: number, diffPts: number}}
 */
export function compareModelToMarket(kind, value, market) {
  if (!market || typeof value !== "number" || !Number.isFinite(value)) return null;
  if (kind === "probability") {
    const implied = impliedFromAmerican(market.yesOdds);
    if (implied == null || value < 0 || value > 1) return null;
    return { type: "PRICE", model: value, implied, diffPts: Math.round((value - implied) * 1000) / 10 };
  }
  if (typeof market.line !== "number" || !Number.isFinite(market.line)) return null;
  return { type: "LINE", model: value, line: market.line, diff: Math.round((value - market.line) * 10) / 10 };
}

/**
 * The number a row SHOWS, at the precision it shows it (forecast-view.mjs `formatValue`): yards whole, counts to one
 * decimal, probabilities to a tenth of a percent. The gap is computed from this, never from the unrounded value —
 * "Model 271 vs line 279.5: −8.6" is arithmetic a reader can check and find wrong.
 */
export function displayedModelValue(kind, v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return NaN;
  if (kind === "probability") return Math.round(v * 1000) / 1000;
  if (kind === "count") return Math.round(v * 10) / 10;
  return Math.round(v);
}

/** "Sat Oct 10, 1:32 PM ET" — always with the date. An unparseable instant is printed verbatim, never dropped. */
export function capturedLabel(iso) {
  const t = typeof iso === "string" ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return typeof iso === "string" ? iso : null;
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(t)) + " ET";
}

/** Signed, with the unit: "+5.5 yds", "−0.3 rec", "0 yds". The minus is a real minus sign. */
export function signed(n, unit) {
  const v = Math.abs(n) < 0.05 ? 0 : n;
  const s = v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0";
  return unit ? `${s} ${unit}` : s;
}

/** Short reader text for a row with no captured market, from the producer's typed state. Null when nothing is known. */
export const MARKET_ABSENT_SHORT = Object.freeze({
  NOT_OFFERED: "No sportsbook line: not offered by the books we checked",
  NOT_PROBED: "No sportsbook line: not checked for this game",
  IDENTITY_UNRESOLVED: "No sportsbook line: the market could not be matched to this player",
  NOT_AUTHORIZED: "No sportsbook line: market unavailable",
});

/**
 * A row the producer holds no market state for at all (a player or family outside the priced artifact, or a week
 * before markets were captured). The only thing known is that no line was captured, so that is all it says — never
 * why, and never that the books declined.
 */
export const MARKET_NONE_CAPTURED = "No sportsbook line captured for this player";
