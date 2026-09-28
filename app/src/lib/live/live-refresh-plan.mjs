/**
 * WHICH GAMES' LIVE-PROPS RECORDS THE /live PAGE MAY FETCH — one pure decision, one owner.
 *
 * The page has ONE refresh clock (`useLivePropsStore`). This decides what that clock touches:
 *
 *   PRE    nothing — there is no live measurement to read, and the frozen halves are already in the page
 *   LIVE   polled on the shared cadence — a free capture must appear without the reader reloading
 *   FINAL  fetched ONCE, for the final stat — a finished game does not need measuring again
 *
 * A game with no featured forecasts is never fetched. No per-player and no per-row request exists:
 * the record is one static file per game, already joined by the canonical producer.
 */

/** @param {Array<{ id: string, phase: "PRE" | "LIVE" | "FINAL", featured: number }>} games */
export function liveRefreshPlan(games) {
  const poll = [];
  const once = [];
  for (const g of games ?? []) {
    if (!g || !/^\d+$/.test(String(g.id)) || !(g.featured > 0)) continue;
    if (g.phase === "LIVE") poll.push(String(g.id));
    else if (g.phase === "FINAL") once.push(String(g.id));
  }
  poll.sort();
  once.sort();
  return { poll, once };
}

/** The shared cadence. One timer for the whole page, never one per game or per row. */
export const LIVE_PROPS_REFRESH_MS = 60_000;
