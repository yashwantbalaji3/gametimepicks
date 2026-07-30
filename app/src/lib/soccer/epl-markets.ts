/**
 * MATCH_RESULT_1X2 — soccer's three-way result as its own market family.
 *
 * WHY NOT REUSE MONEYLINE
 * The canonical MLB market domain is two-sided by type: `MarketSide = "HOME" | "AWAY" | "OVER" |
 * "UNDER"`. A draw has nowhere to live in it. Overloading `MONEYLINE` would make a three-outcome
 * market renderable by any two-sided consumer, which does not fail — it prints a coherent home/away
 * pair whose probabilities are wrong by the draw's share (typically a quarter of the market). A
 * separate family makes that mistake unrepresentable rather than discouraged.
 *
 * The de-vig is a port of `pipeline/world_cup/soccer_odds_parser.py::devig_three_way`, kept
 * arithmetically identical and pinned by `epl-devig-cross-language.test.mjs`. Two implementations of
 * one formula are only worth having while they agree.
 *
 * American → raw implied probability reuses the canonical converter rather than adding a second one.
 */
import { americanToImpliedRaw } from "@/lib/projection-framework";

/** Soccer market families this lane can honestly represent. Totals and BTTS are not yet proven. */
export type SoccerMarketFamily = "MATCH_RESULT_1X2";

/** The three outcomes of a 90-minute result. DRAW is first-class, not an absence. */
export type MatchResultOutcome = "HOME" | "DRAW" | "AWAY";

export const MATCH_RESULT_OUTCOMES: readonly MatchResultOutcome[] = ["HOME", "DRAW", "AWAY"];

/** One book's posted American prices for all three outcomes. Null means absent, never zero. */
export interface MatchResult1x2Quote {
  readonly HOME: number | null;
  readonly DRAW: number | null;
  readonly AWAY: number | null;
}

export type MatchResult1x2Status =
  | "OK"
  /** At least one of the three outcomes is missing — a two-way market is not a soccer result market. */
  | "INCOMPLETE_THREE_WAY"
  /** A price exists but is not a readable American odd (0, NaN, non-numeric). */
  | "MALFORMED_PRICE"
  /** The three raw probabilities do not sum above zero, so no overround can be measured. */
  | "DEGENERATE";

export type OutcomeProbabilities = Readonly<Record<MatchResultOutcome, number>>;

export interface MatchResult1x2Reading {
  readonly status: MatchResult1x2Status;
  /** Raw implied probabilities, still carrying the book's margin. Null unless status is OK. */
  readonly rawImplied: OutcomeProbabilities | null;
  /** Sum of the raw implied probabilities. 1.05 means a 5% overround. Null unless status is OK. */
  readonly overround: number | null;
  /** Margin stripped proportionally across all three outcomes. Sums to 1. Null unless status is OK. */
  readonly noVig: OutcomeProbabilities | null;
  /** The prices the reading was derived from, carried so a surface never re-parses a payload. */
  readonly prices: MatchResult1x2Quote;
}

/**
 * Strip the overround proportionally across three outcomes.
 *
 * Port of the Python reference. The `total <= 0` refusal is the reference's own; the finite guard is
 * an addition, because JavaScript arithmetic reaches this function through JSON where Python reaches
 * it through a parser that has already rejected non-numerics. Both refuse rather than return a
 * plausible number.
 */
export function devigThreeWay(
  pHome: number,
  pDraw: number,
  pAway: number,
): { home: number; draw: number; away: number } | null {
  if (!Number.isFinite(pHome) || !Number.isFinite(pDraw) || !Number.isFinite(pAway)) return null;
  const total = pHome + pDraw + pAway;
  if (total <= 0) return null;
  return { home: pHome / total, draw: pDraw / total, away: pAway / total };
}

/**
 * Read one book's three-way quote.
 *
 * Fails closed on a missing draw. A `h2h` payload with two outcomes is a two-way market that happens
 * to name two soccer clubs; treating it as a soccer result market would publish home/away
 * probabilities inflated by the missing draw.
 */
export function readMatchResult1x2(quote: MatchResult1x2Quote): MatchResult1x2Reading {
  const base = { rawImplied: null, overround: null, noVig: null, prices: quote } as const;

  const missing = MATCH_RESULT_OUTCOMES.filter((o) => quote[o] === null || quote[o] === undefined);
  if (missing.length > 0) return { status: "INCOMPLETE_THREE_WAY", ...base };

  const raw = {
    HOME: americanToImpliedRaw(quote.HOME),
    DRAW: americanToImpliedRaw(quote.DRAW),
    AWAY: americanToImpliedRaw(quote.AWAY),
  };
  if (raw.HOME === null || raw.DRAW === null || raw.AWAY === null) {
    return { status: "MALFORMED_PRICE", ...base };
  }

  const devigged = devigThreeWay(raw.HOME, raw.DRAW, raw.AWAY);
  if (!devigged) return { status: "DEGENERATE", ...base };

  return {
    status: "OK",
    rawImplied: { HOME: raw.HOME, DRAW: raw.DRAW, AWAY: raw.AWAY },
    overround: raw.HOME + raw.DRAW + raw.AWAY,
    noVig: { HOME: devigged.home, DRAW: devigged.draw, AWAY: devigged.away },
    prices: quote,
  };
}

/**
 * How probabilities on this surface are described in copy.
 *
 * The book never published a probability; this is our conversion of its posted price. Saying "the
 * sportsbook's probability" misattributes the arithmetic, and calling it a GameTimePicks number
 * would be worse — there is no model in it at all.
 */
export const MATCH_RESULT_DEVIG_NOTE =
  "Probabilities are converted by GameTimePicks from the sportsbook's posted three-way price. " +
  "No-vig figures remove the book's overround proportionally across home, draw and away.";
