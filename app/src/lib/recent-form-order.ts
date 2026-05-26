/**
 * Recent-form ordering helpers (PR #116 addendum).
 *
 * The pipeline emits `recentSeries` and `recentGames` in
 * OLDEST → NEWEST order (matches sparkline rendering). The
 * recent-form drawer wants "Last N games" — meaning the user's
 * MOST RECENT N games. These helpers do the reversal at display
 * time so the snapshot contract (oldest→newest, 1:1 across the
 * two arrays) stays intact for any other consumer.
 */

/**
 * Return `arr` reversed (newest-first) and capped at `limit`
 * entries. Pure, side-effect free, never mutates the input.
 *
 * - If `arr` is null/undefined, returns `[]`.
 * - If `limit` is <= 0, returns `[]`.
 * - The same index alignment that `recentSeries[i]`
 *   ↔ `recentGames[i]` carried on the snapshot stays intact
 *   when both arrays are run through this helper with the same
 *   `limit`.
 */
export function takeNewestFirst<T>(
  arr: ReadonlyArray<T> | null | undefined,
  limit: number,
): T[] {
  if (!arr || arr.length === 0) return [];
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return [...arr].reverse().slice(0, limit);
}
