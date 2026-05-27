/**
 * Public parlay era helper.
 *
 * On 2026-05-27 we reset public parlay tracking. Pre-2026-05-27
 * suggested-parlay results are intentionally hidden from every
 * user-facing surface (results page, market ticker, summary cards).
 *
 * Why a constant + helper instead of a one-shot file edit:
 *   - Old `optimizer-graded/*.json` files stay on disk as an
 *     internal/dev archive. The pipeline-written
 *     `optimizer-summary.json` is also kept (next pipeline run will
 *     regenerate it). Loaders apply this filter so even an unedited
 *     summary cannot leak pre-era numbers into the UI.
 *   - The era constant is a single source of truth — every loader
 *     and ticker builder reads from here so we never drift.
 *
 * What's excluded from public surfaces by this filter:
 *   - Pre-era per-date entries in `byDate`.
 *   - Pre-era graded files when listing dates for the results page.
 *   - Lifetime / by-profile / by-sport aggregates are recomputed
 *     from the post-era `byDate` rows so they cannot inherit pre-era
 *     wins or losses.
 *
 * What's NOT touched by this filter:
 *   - Projection-level daily audits (`audit/daily/*.json`) — these
 *     track per-prop accuracy, not parlay W/L, and pre-date the
 *     parlay tracking experiment by design.
 *   - The confirming-signal policy file (`audit/policy.json`).
 *   - The actual JSON files on disk (we filter at read time only).
 */

/** ISO date (YYYY-MM-DD, ET-slate) when public parlay tracking resets. */
export const PUBLIC_PARLAY_RESULTS_START_DATE = "2026-05-27";

/**
 * True when the given ISO date should be visible in public parlay
 * surfaces. Returns false for malformed input — defensive default is
 * to hide, never leak.
 */
export function isInPublicParlayEra(date: string | null | undefined): boolean {
  if (!date || typeof date !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date >= PUBLIC_PARLAY_RESULTS_START_DATE;
}

/** Filter a list of ISO dates down to only the public-era ones. */
export function filterDatesToPublicEra(
  dates: ReadonlyArray<string>,
): string[] {
  return dates.filter(isInPublicParlayEra);
}

/**
 * Recompute an aggregate bucket (lifetime / by-profile / by-sport)
 * from a list of per-date rows. Hit rate excludes pushes and pending,
 * matching the existing optimizer-summary contract.
 */
export interface PublicParlayBucket {
  wins: number;
  losses: number;
  pushes: number;
  pending: number;
  decisive: number;
  hitRate: number | null;
}

export function aggregateBuckets(
  rows: ReadonlyArray<PublicParlayBucket>,
): PublicParlayBucket {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let pending = 0;
  for (const r of rows) {
    wins += r.wins ?? 0;
    losses += r.losses ?? 0;
    pushes += r.pushes ?? 0;
    pending += r.pending ?? 0;
  }
  const decisive = wins + losses;
  const hitRate = decisive > 0 ? wins / decisive : null;
  return { wins, losses, pushes, pending, decisive, hitRate };
}

/** Empty bucket — used when there are zero post-era rows so the UI
 *  can render an honest "no settled slips yet" state. */
export function emptyPublicParlayBucket(): PublicParlayBucket {
  return {
    wins: 0,
    losses: 0,
    pushes: 0,
    pending: 0,
    decisive: 0,
    hitRate: null,
  };
}
