/**
 * recent-form — pure, transparent L10 (recent-form) helpers.
 *
 * L10 hit rate = the fraction of a leg's stored `recentSeries` (the player's
 * recent per-game stat values for that market) that already cleared the line
 * in the leg's side. Pregame-safe and REAL — it comes from `recentSeries`, not
 * from the model's projection, and is never fabricated. Ties (value == line)
 * are pushes, excluded from the denominator. Requires ≥ MIN_RECENT decisive
 * recent games, else null.
 *
 * This is the #249 shadow-L10 finding turned into a display/eligibility helper.
 * It is **transparency only** — never a win-probability or performance claim,
 * and it deliberately does NOT use edgePct/confidence (non-predictive per #240).
 */

export interface LegLikeForL10 {
  recentSeries?: number[] | null;
  line?: number | null;
  side?: string | null;
}

/** Minimum decisive recent games before an L10 rate is shown (never invent). */
export const MIN_RECENT_GAMES = 3;

export interface LegL10 {
  hits: number;
  decisive: number;
  /** hits / decisive, 0..1. */
  rate: number;
}

/** L10 hit rate for one leg from its recentSeries, in the leg's side
 *  direction. Returns null when there isn't enough real recent data. */
export function legL10HitRate(leg: LegLikeForL10 | null | undefined): LegL10 | null {
  if (!leg || typeof leg.line !== "number" || !Number.isFinite(leg.line)) return null;
  const side = (leg.side ?? "").toLowerCase();
  if (side !== "over" && side !== "under") return null;
  const rs = Array.isArray(leg.recentSeries)
    ? leg.recentSeries.map(Number).filter((v) => Number.isFinite(v))
    : [];
  if (rs.length < MIN_RECENT_GAMES) return null;
  let hits = 0;
  let decisive = 0;
  for (const v of rs) {
    if (v === leg.line) continue; // push — excluded
    decisive++;
    if (side === "over" ? v > leg.line : v < leg.line) hits++;
  }
  if (decisive < MIN_RECENT_GAMES) return null;
  return { hits, decisive, rate: hits / decisive };
}

/** Compact recent-form label for a leg, e.g. "L10 7/10" or "L10 —". */
export function legRecentFormLabel(leg: LegLikeForL10 | null | undefined): string {
  const l = legL10HitRate(leg);
  return l ? `L10 ${l.hits}/${l.decisive}` : "L10 —";
}

export interface SlipRecentForm {
  /** Mean L10 rate across legs that have data, or null when none do. */
  avgRate: number | null;
  legsWithData: number;
  totalLegs: number;
  /** True when EVERY leg has usable L10 data. */
  complete: boolean;
}

// ---------------------------------------------------------------------------
// Enrichment — attach recentSeries to legs that lack it (e.g. the published
// snapshot omits recentSeries; only the optimizer legPool carries it).
// ---------------------------------------------------------------------------

interface LegIdentity {
  playerId?: number | null;
  market?: string | null;
  line?: number | null;
  side?: string | null;
}

/** Stable per-leg identity used to look up recentSeries across sources.
 *  Null when any identity field is missing. */
export function recentSeriesKey(leg: LegIdentity | null | undefined): string | null {
  if (!leg || leg.playerId == null || !leg.market || leg.line == null || !leg.side) {
    return null;
  }
  return `${leg.playerId}|${(leg.market ?? "").toLowerCase()}|${leg.line}|${(leg.side ?? "").toLowerCase()}`;
}

/** Build a `recentSeriesKey → recentSeries` index from a leg source that
 *  carries recentSeries (e.g. the optimizer legPool). First non-empty wins. */
export function indexRecentSeries(
  legs: ReadonlyArray<LegIdentity & { recentSeries?: number[] | null }> | null | undefined,
): Map<string, number[]> {
  const m = new Map<string, number[]>();
  for (const l of legs ?? []) {
    const k = recentSeriesKey(l);
    if (k && !m.has(k) && Array.isArray(l.recentSeries) && l.recentSeries.length > 0) {
      m.set(k, l.recentSeries);
    }
  }
  return m;
}

/** Return new slips whose legs have `recentSeries` filled from the index when
 *  the leg lacks it. Pure — never mutates the input; real data only. */
export function attachRecentSeries<
  L extends LegIdentity & { recentSeries?: number[] | null },
  S extends { legs?: ReadonlyArray<L> | null },
>(slips: ReadonlyArray<S>, index: Map<string, number[]>): S[] {
  return (slips ?? []).map((slip) => {
    const legs = slip.legs ?? [];
    let changed = false;
    const nextLegs = legs.map((leg) => {
      if (Array.isArray(leg.recentSeries) && leg.recentSeries.length > 0) return leg;
      const k = recentSeriesKey(leg);
      const rs = k ? index.get(k) : undefined;
      if (!rs) return leg;
      changed = true;
      return { ...leg, recentSeries: rs };
    });
    return changed ? ({ ...slip, legs: nextLegs } as S) : slip;
  });
}

/** Summarize a slip's recent-form support across its legs. */
export function slipRecentFormSummary(
  slip: { legs?: ReadonlyArray<LegLikeForL10> | null } | null | undefined,
): SlipRecentForm {
  const legs = slip?.legs ?? [];
  const rates: number[] = [];
  for (const l of legs) {
    const x = legL10HitRate(l);
    if (x) rates.push(x.rate);
  }
  const avgRate = rates.length
    ? rates.reduce((a, b) => a + b, 0) / rates.length
    : null;
  return {
    avgRate,
    legsWithData: rates.length,
    totalLegs: legs.length,
    complete: legs.length > 0 && rates.length === legs.length,
  };
}
