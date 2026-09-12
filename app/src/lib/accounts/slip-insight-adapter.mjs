/**
 * YOUR SLIP, THROUGH THE SAME ENGINE AS OURS (P266) — a thin adapter, nothing more.
 *
 * The builder already reads a card: the chance its price implies, the lab's settled record at that
 * price, which legs are linked. A slip a reader uploaded deserves the same read, and it should come
 * from the SAME code — a second implementation is a second set of answers to the same question.
 *
 * The legs of an uploaded slip carry an event NAME where our own carry a game id, so the event string
 * is the game key here: two legs naming the same event are the same game, which is exactly what the
 * compatibility engine needs to call them linked. Unpriced legs are dropped rather than guessed at,
 * and the caller is told how many were dropped so the read is never silently partial.
 */

/** @param {Array<{player?:string|null, market?:string|null, side?:string|null, line?:number|null, odds?:number|null, event?:string|null}>} legs */
export function readingToEngineLegs(legs) {
  const all = legs ?? [];
  const priced = all.filter((l) => Number.isFinite(l?.odds) && l.odds !== 0);
  return {
    legs: priced.map((l, i) => ({
      id: `slip-${i}`,
      sport: "slip",
      // The event name IS the game key: same event ⇒ same game ⇒ the engine calls the pair linked.
      gameId: l.event ?? null,
      player: l.player ?? null,
      label: l.player ?? l.market ?? `leg ${i + 1}`,
      market: l.market ?? "unknown",
      marketLabel: l.market ?? "unknown",
      side: l.side ?? "",
      line: l.line ?? null,
      americanOdds: Number(l.odds),
      riskTier: "Medium",
    })),
    droppedUnpriced: all.length - priced.length,
  };
}
