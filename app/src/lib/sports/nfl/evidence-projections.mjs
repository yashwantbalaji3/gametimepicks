/**
 * The projection beside each player's history, taken from the SAME accessor the game page's player tabs use
 * (forecast-view.mjs gameTabs). So the Recent form panel prints exactly what the page prints: the official value for a
 * PUBLISHED family, the value labelled "Estimate" for an ESTIMATE family (with no line beside it), and nothing where
 * the page has no row ("No official projection": a WITHHELD family, an absent snapshot, a refused snapshot).
 * PURE.
 */
import { MARKET_KEY, PLAYER_FAMILIES, formatValue } from "./forecast-view.mjs";

const KIND = Object.fromEntries(PLAYER_FAMILIES.map((f) => [f.key, f.kind]));

/**
 * @param {ReturnType<typeof import("./forecast-view.mjs").gameTabs> | null} tabs
 * @returns {Record<string, Record<string, { value: number, p10: number|null, p90: number|null, kind: string, text: string, range: string|null, estimate: string|null, market: any }>>}
 *   playerId → board family (player_reception_yds, …) → the row the page shows. `market` is the page's (sanitised) slot.
 */
export function evidenceProjections(tabs) {
  const out = {};
  if (!tabs) return out;
  for (const f of tabs.families ?? []) {
    const mk = MARKET_KEY[f.key];
    if (!mk) continue;
    for (const row of tabs.lists?.[f.key] ?? []) {
      const e = row.entry, kind = KIND[f.key];
      (out[row.player.playerId] ??= {})[mk] = {
        value: e.value, p10: e.p10 ?? null, p90: e.p90 ?? null, kind,
        text: formatValue(kind, e.value),
        range: e.p10 != null && e.p90 != null ? `${formatValue(kind, e.p10)}–${formatValue(kind, e.p90)}` : null,
        estimate: f.estimate ?? null,
        market: f.estimate ? null : e.market ?? null,
      };
    }
  }
  return out;
}
