/**
 * FOR YOU ON /my (Session 9 · I5) — today's published game forecasts, ORDERED by what the reader follows.
 *
 * A thin adapter onto lib/my/for-you-order.mjs, which owns the rules: it only reorders, filters by explicit
 * choices, and annotates with the reader's own reason. The game objects come back identity-preserved — no
 * forecast, line, price, model state or publication state is touched, and no result or P/L is an input.
 */
import { forYouOrder } from "./for-you-order.mjs";

/**
 * @param {Array} games     MyGame rows (published upcoming games)
 * @param {Array} followed  canonical follow refs
 * @param {{ nowMs:number, limit?:number, prefs?:object }} o
 * @returns {{ rows: Array<{ game: any, reasons: string[] }>, total: number, hidden: number }}
 */
export function forYouGames(games, followed, { nowMs, limit = 6, prefs = {} } = {}) {
  const items = (games ?? [])
    .filter((g) => { const t = Date.parse(g?.startUtc ?? ""); return Number.isFinite(t) && t > nowMs; })
    .map((g) => ({ receiptId: `${g.sport}:${g.gameId}`, kind: "forecast", sport: String(g.sport).toLowerCase(), teamIds: [g.homeId, g.awayId].filter(Boolean), eventIds: [g.gameId], game: g }));
  const r = forYouOrder(items, { follows: followed, prefs });
  return { rows: r.items.slice(0, limit).map((x) => ({ game: x.item.game, reasons: x.reasons })), total: r.items.length, hidden: r.hidden };
}
