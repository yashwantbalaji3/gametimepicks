/**
 * Session 5 · founder decision D5 — an official product card never carries two legs from the same event.
 *
 * Legs from one game are correlated; multiplying their single-leg prices yields a number no sportsbook offers for a
 * same-game parlay. Until a real sportsbook SGP receipt or a separately validated joint-pricing model exists, every
 * official card (Suggested Parlays ladder, Bank Builder, Moonshot, sport ladders) holds at most one leg per event.
 * Fails closed: a leg with no event identity cannot be shown to be distinct.
 */
export function legsFromDistinctEvents(legs, eventOf = (l) => l?.gamePk ?? l?.gameId ?? l?.eventId ?? null) {
  const list = Array.isArray(legs) ? legs : [];
  if (!list.length) return false;
  const keys = list.map((l) => eventOf(l));
  if (keys.some((k) => k == null || k === "")) return false;
  return new Set(keys.map(String)).size === keys.length;
}
