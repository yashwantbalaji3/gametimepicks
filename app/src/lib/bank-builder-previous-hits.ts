/**
 * Pure helpers for the Bank Builder "previous hits" display.
 *
 * The public ledger entries carry per-leg PLAYER names (e.g. the settled
 * MLB/NBA cards). The public /bank-builder page deliberately does NOT
 * surface those names — partly to keep the page free of the old Plus100
 * builder-slip player clutter, partly because the page is a clean ladder
 * summary, not a box score. These helpers produce a player-free summary
 * (leg count + distinct markets) so the omission is centralised and
 * unit-tested, never an accident in JSX.
 *
 * Pure: no fs, no fetches. Importable from a server or client component.
 */

/** A single settled leg as carried by the public ledger. */
export interface PreviousHitLeg {
  player: string;
  market: string;
  side?: string;
  line?: number | null;
  result?: string;
  finalStat?: number | null;
}

/** Minimal shape of a previous-hit entry needed for a summary. */
export interface PreviousHitLike {
  legs?: PreviousHitLeg[];
  sameGame?: boolean;
}

/** Humanise a market key for display: "batter_hits" → "batter hits". Player
 *  names are intentionally never part of this output. */
export function humanizeMarket(market: string): string {
  return (market ?? "").replace(/_/g, " ").trim();
}

/**
 * A short, PLAYER-FREE summary of an entry's legs: count + distinct
 * markets, e.g. "2-leg card · batter hits" or "2-leg same-game card · REB ·
 * PRA". Returns null when the entry carries no leg detail, so the caller can
 * show an honest "details unavailable" note instead of inventing any.
 */
export function summarizePreviousHitLegs(entry: PreviousHitLike): string | null {
  const legs = entry.legs ?? [];
  if (legs.length === 0) return null;
  const markets = Array.from(
    new Set(legs.map((l) => humanizeMarket(l.market)).filter(Boolean)),
  );
  const noun = `${legs.length}-leg${entry.sameGame ? " same-game" : ""} card`;
  return markets.length ? `${noun} · ${markets.join(" · ")}` : noun;
}
