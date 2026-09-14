/**
 * THE WEEK'S FORECASTS, LIVE AND FROZEN (P295).
 *
 * build-nfl-public-forecasts.mjs publishes two artifacts per run:
 *   forecasts/latest.json         — games that have not kicked off (what every producer downstream consumes)
 *   forecasts/frozen-latest.json  — this week's STARTED games, rebuilt from their pre-kickoff receipts
 *
 * Readers — the index, /nfl, the week page, the game pages — need both. On 2026-09-13 they read only
 * the first, so each later run shrank Week 1 (14 → 6 → 2): twelve games that had published forecasts
 * lost their reports (404) and /nfl told readers they had "kicked off before a forecast was published".
 *
 * The union is honoured ONLY when both artifacts come from the same run (identical generatedAt). A frozen
 * file left behind by an earlier run could otherwise resurrect another week's games beside this one.
 * Live forecasts win on any id collision.
 *
 * Typed as whatever artifact the caller reads, so pages keep their own Forecast shape.
 * @template {{generatedAt?: string, forecasts?: any[]} | null | undefined} T
 * @param {T} live
 * @param {{generatedAt?: string, forecasts?: any[]} | null | undefined} frozen
 * @returns {T} the live artifact with the frozen forecasts appended (or the live artifact unchanged)
 */
export function unionFrozenForecasts(live, frozen) {
  if (!live) return live;
  if (!frozen || !live.generatedAt || frozen.generatedAt !== live.generatedAt) return live;
  const liveIds = new Set((live.forecasts ?? []).map((f) => String(f.providerEventId)));
  const carried = (frozen.forecasts ?? []).filter((f) => !liveIds.has(String(f.providerEventId)));
  if (!carried.length) return live;
  return { ...live, forecasts: [...(live.forecasts ?? []), ...carried] };
}
