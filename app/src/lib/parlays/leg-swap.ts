/**
 * LEG SUBSTITUTION — the bench for a card, chosen like-for-like.
 *
 * ── Why there is no "best replacement" ──────────────────────────────────────────────────────────
 * Over 1,407 graded legs, nothing available to us ranks one candidate above another honestly:
 *   · model edge does not predict outcomes — 58.1% / 59.2% / 57.9% across the 0-5 / 5-10 / 10-20pp
 *     edge buckets, and the confidence labels are just as flat;
 *   · legs land slightly LESS often than their own price implies in every band (−2.8pp at ≤−200,
 *     −1.8pp mid, −2.8pp near even, −4.8pp beyond +120), which is the hold showing up.
 *
 * So a bench sorted by "quality" would be sorting noise, and a bench sorted by win probability would
 * simply sort by shortest price — quietly nudging every substitution toward favourites and
 * shortening the card the reader chose. Neither is a service.
 *
 * ── What it does instead: substitute by position ────────────────────────────────────────────────
 * A striker comes off for a striker. A candidate must play the same role:
 *   1. SAME MARKET — a hits leg is replaced by a hits leg, so the card's character survives.
 *   2. A GAME NOT ALREADY ON THE CARD — two legs from one ballgame rise and fall together, and a
 *      swap that quietly doubles up on a game makes the card more correlated than it looks.
 *   3. COMPARABLE PRICE — ordered by how close the candidate is to the leg leaving, so the combined
 *      price (and the card's risk band) stays roughly where the reader found it.
 *
 * Pure and deterministic → unit-tested. Decides nothing about quality, because nothing here can.
 */

export interface SwapCandidate {
  readonly player: string;
  readonly photoUrl: string | null;
  readonly teamAbbr: string | null;
  readonly opponentAbbr: string | null;
  readonly market: string;
  readonly marketLabel: string;
  readonly side: string;
  readonly line: number | null;
  readonly americanOdds: number;
  readonly gameId: string;
  readonly matchup: string;
}

export interface SwapTarget {
  readonly player: string;
  readonly market: string;
  readonly gameId: string;
  readonly americanOdds: number;
}

export const decimalOdds = (a: number) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
export const toAmerican = (d: number) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)));

/** Combined American price of a card after `outgoing` is replaced by `incoming`. */
export function repriceCard(
  legs: readonly { americanOdds: number }[],
  outgoingIndex: number,
  incomingOdds: number,
): number {
  const d = legs.reduce((acc, l, i) => acc * decimalOdds(i === outgoingIndex ? incomingOdds : l.americanOdds), 1);
  return toAmerican(d);
}

/** The canonical non-overlapping bands, mirrored from risk-odds-bands so a swap can report a move. */
export function bandFor(american: number): "low" | "medium" | "high" | "longshot" | null {
  if (american < -200) return null;
  if (american <= 100) return "low";
  if (american <= 300) return "medium";
  if (american <= 600) return "high";
  return "longshot";
}

/**
 * The bench for one leg.
 *
 * @param pool      every eligible leg on the slate
 * @param target    the leg coming off
 * @param onCard    the whole card, so its other games and players are excluded
 * @param limit     how many to offer — a bench, not a catalogue
 */
export function benchFor(
  pool: readonly SwapCandidate[],
  target: SwapTarget,
  onCard: readonly SwapTarget[],
  limit = 6,
): SwapCandidate[] {
  const usedGames = new Set(onCard.filter((l) => l.gameId !== target.gameId).map((l) => l.gameId));
  const usedPlayers = new Set(onCard.map((l) => l.player));

  return pool
    .filter((c) => c.market === target.market)          // same position
    .filter((c) => !usedGames.has(c.gameId))            // no doubling up on a game already on the card
    .filter((c) => !usedPlayers.has(c.player))          // and never the same player twice
    .filter((c) => Number.isFinite(c.americanOdds) && c.americanOdds !== 0)
    .sort((a, b) => {
      // Closest price first. Compared in DECIMAL space because American odds are discontinuous
      // across zero — +110 and −110 are neighbours in probability but 220 apart as integers, and
      // sorting on the raw number would rank a near-identical price as wildly different.
      const t = decimalOdds(target.americanOdds);
      const da = Math.abs(decimalOdds(a.americanOdds) - t);
      const db = Math.abs(decimalOdds(b.americanOdds) - t);
      return da === db ? a.player.localeCompare(b.player) : da - db;
    })
    .slice(0, limit);
}
