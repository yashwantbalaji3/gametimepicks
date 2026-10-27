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
 * `resolve` (optional) maps each forecast before it is returned — readers pass nflPublicRecordResolver()
 * (public-record.mjs) so a public copy of an EXCLUDED revision is shown as its record, never as itself.
 *
 * Typed as whatever artifact the caller reads, so pages keep their own Forecast shape.
 * @template {{generatedAt?: string, forecasts?: any[]} | null | undefined} T
 * @param {T} live
 * @param {{generatedAt?: string, forecasts?: any[]} | null | undefined} frozen
 * @param {{ resolve?: (f: any) => any }} [opts]
 * @returns {T} the live artifact with the frozen forecasts appended (or the live artifact unchanged)
 */
export function unionFrozenForecasts(live, frozen, { resolve } = {}) {
  if (!live) return live;
  const mapped = (a) => (resolve && a ? { ...a, forecasts: (a.forecasts ?? []).map(resolve) } : a);
  if (!frozen || !live.generatedAt || frozen.generatedAt !== live.generatedAt) return mapped(live);
  const liveIds = new Set((live.forecasts ?? []).map((f) => String(f.providerEventId)));
  const carried = (frozen.forecasts ?? []).filter((f) => !liveIds.has(String(f.providerEventId)));
  if (!carried.length) return mapped(live);
  return mapped({ ...live, forecasts: [...(live.forecasts ?? []), ...carried] });
}
