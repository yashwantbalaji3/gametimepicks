/**
 * NBA MODEL-VERSUS-LINE COMPARISON — the ONE rule (launch program 2026-10-28, founder P0 "NBA sportsbook lines and model
 * comparisons"). Pure, import-free, client-safe.
 *
 * It compares a FROZEN official player median (the lane file, exactly as published) with ONE verified sportsbook line for
 * the SAME event, player and market definition, and says only:
 *   difference = official median − line        (e.g. 24.8 vs 22.5 → +2.3)
 *   direction  = ABOVE | BELOW | EQUAL          (model median relative to that specific line)
 * or, when any condition fails, direction UNAVAILABLE with the exact reason — never a guessed line, never a zero, never a
 * comparison across different market definitions, never yesterday's line.
 *
 * What it is NOT: a probability, an edge, a pick or a claim of value. A median above a line says where the model's middle
 * outcome sits relative to that number; it does not say the over wins (the founder's colour rule says so in the legend).
 * Colour is a pure function of a VALID comparison: neutral for every UNAVAILABLE reason.
 */

export const LINE_COMPARISON_RULE = "nba-line-comparison@1";

/** Official median family → the provider market keys that measure the SAME quantity (The Odds API player market keys). */
export const MARKET_KEYS = Object.freeze({
  pts: "player_points",
  reb: "player_rebounds",
  ast: "player_assists",
  threePm: "player_threes",
  pra: "player_points_rebounds_assists",
  ptsReb: "player_points_rebounds",
  ptsAst: "player_points_assists",
});
export const FAMILY_BY_MARKET = Object.freeze(Object.fromEntries(Object.entries(MARKET_KEYS).map(([f, m]) => [m, f])));
export const COMBO_FAMILIES = Object.freeze(new Set(["pra", "ptsReb", "ptsAst"]));

/** A line is usable only when captured within this many hours before the comparison instant (and before tip). */
export const LINE_MAX_AGE_HOURS = 6;

export const DIRECTION = Object.freeze({ ABOVE: "ABOVE", BELOW: "BELOW", EQUAL: "EQUAL", UNAVAILABLE: "UNAVAILABLE" });
/** The READER-facing word for a valid direction (founder P0 2026-10-29: users read OVER / UNDER / NEUTRAL, never ABOVE /
    BELOW). Additive: `direction` keeps its internal enum; `side` carries this word. Same mapping as lib/odds/prop-line-view.mjs. */
export const USER_SIDE = Object.freeze({ ABOVE: "OVER", BELOW: "UNDER", EQUAL: "NEUTRAL" });

/** Every reason a comparison is withheld. Words are the reader-facing sentence (no jargon). */
export const UNAVAILABLE_REASON = Object.freeze({
  NO_PROJECTION: "No official projection was published for this player.",
  NO_LINE: "No sportsbook line was captured for this player and market.",
  UNMATCHED: "A line exists but could not be matched to this exact player and game.",
  MARKET_MISMATCH: "The line measures a different statistic, so it is not compared.",
  STALE: "The captured line is too old to compare.",
  CAPTURED_AFTER_TIP: "The line was captured after tip-off, so it is not compared.",
  WRONG_DAY: "The line belongs to a different slate.",
  STARTED: "The game has started; pregame comparisons are frozen as they were.",
  INVALID_LINE: "The captured line is not a valid number.",
});

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const r1 = (v) => Math.round(v * 10) / 10;

/**
 * @param {{ family: string, median: number|null|undefined }} projection   the official median for one family
 * @param {null | { marketKey: string, line: number, overPrice?: number|null, underPrice?: number|null, book: string,
 *                  capturedAt: string, eventId: string, athleteId: string, slateDate: string }} line  a MATCHED line, or null
 * @param {{ eventId: string, athleteId: string, slateDate: string, tipUtc: string, asOf: string }} ctx
 */
export function compareToLine(projection, line, ctx) {
  const out = (direction, extra = {}) => ({ rule: LINE_COMPARISON_RULE, family: projection?.family ?? null, direction, ...extra });
  if (!isNum(projection?.median)) return out(DIRECTION.UNAVAILABLE, { reason: "NO_PROJECTION" });
  if (!line) return out(DIRECTION.UNAVAILABLE, { reason: "NO_LINE", median: projection.median });
  if (String(line.eventId) !== String(ctx.eventId) || String(line.athleteId) !== String(ctx.athleteId)) return out(DIRECTION.UNAVAILABLE, { reason: "UNMATCHED", median: projection.median });
  if (MARKET_KEYS[projection.family] !== line.marketKey) return out(DIRECTION.UNAVAILABLE, { reason: "MARKET_MISMATCH", median: projection.median });
  if (line.slateDate !== ctx.slateDate) return out(DIRECTION.UNAVAILABLE, { reason: "WRONG_DAY", median: projection.median });
  if (!isNum(line.line) || line.line < 0) return out(DIRECTION.UNAVAILABLE, { reason: "INVALID_LINE", median: projection.median });
  const cap = Date.parse(line.capturedAt), tip = Date.parse(ctx.tipUtc), asOf = Date.parse(ctx.asOf);
  if (!Number.isFinite(cap) || !Number.isFinite(tip)) return out(DIRECTION.UNAVAILABLE, { reason: "STALE", median: projection.median });
  if (cap >= tip) return out(DIRECTION.UNAVAILABLE, { reason: "CAPTURED_AFTER_TIP", median: projection.median });
  // The comparison instant is never after tip: a started game keeps the pregame comparison as of tip.
  const at = Number.isFinite(asOf) ? Math.min(asOf, tip) : tip;
  if (at - cap > LINE_MAX_AGE_HOURS * 3600_000 || cap > at) return out(DIRECTION.UNAVAILABLE, { reason: "STALE", median: projection.median });
  // PRECISION (founder display-rounding policy 2026-10-29, lib/odds/prop-line-view.mjs DISPLAY_ROUNDING_POLICY): the
  // direction comes from the FULL-precision difference, never from a rounded one — a median 0.04 above the line is OVER,
  // not NEUTRAL. `differenceExact` carries that full-precision value; `difference` is the one-decimal figure the published
  // artifact and the social feed already carry (unchanged for every one-decimal median against a half-point line).
  const differenceExact = projection.median - line.line;
  const difference = r1(differenceExact);
  const direction = differenceExact > 0 ? DIRECTION.ABOVE : differenceExact < 0 ? DIRECTION.BELOW : DIRECTION.EQUAL;
  return out(direction, {
    side: USER_SIDE[direction], median: projection.median, line: line.line, difference, differenceExact,
    overPrice: isNum(line.overPrice) ? line.overPrice : null, underPrice: isNum(line.underPrice) ? line.underPrice : null,
    book: line.book, marketKey: line.marketKey, capturedAt: line.capturedAt,
  });
}

/** Colour role: only a VALID comparison is coloured. Tokens are the site's own (globals.css). */
export function comparisonTone(c) {
  if (!c || c.direction === DIRECTION.UNAVAILABLE) return "neutral";
  return c.direction === DIRECTION.ABOVE ? "above" : c.direction === DIRECTION.BELOW ? "below" : "neutral";
}
export const TONE_TOKEN = Object.freeze({ above: "var(--vault-success)", below: "var(--vault-danger)", neutral: "var(--vault-text-mute)" });

/** The legend every surface (and the social graphic) carries beside a coloured comparison. */
export const COMPARISON_LEGEND = Object.freeze({
  above: "OVER (green): the model's median projection is above this sportsbook line.",
  below: "UNDER (red): the model's median projection is below this sportsbook line.",
  neutral: "Grey: NEUTRAL when the projection equals the line; also no line, a stale or unmatched line, or not cleared for comparison.",
  caveat: "OVER, UNDER and NEUTRAL describe where the model's middle outcome sits against one line. They are not a probability, a pick or a betting recommendation, and they guarantee nothing.",
});

/**
 * One line per (event, athlete, market) from several books: the deterministic choice is the MOST RECENT capture before
 * tip, ties broken by book name — never an average of books (an average line is not a line anyone offered).
 * @param {Array<{ book: string, capturedAt: string, line: number }>} offers
 * @param {string} tipUtc
 */
export function chooseOffer(offers, tipUtc) {
  const tip = Date.parse(tipUtc);
  const ok = (offers ?? []).filter((o) => isNum(o?.line) && Number.isFinite(Date.parse(o.capturedAt)) && Date.parse(o.capturedAt) < tip);
  ok.sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || String(a.book).localeCompare(String(b.book)));
  return ok[0] ?? null;
}
