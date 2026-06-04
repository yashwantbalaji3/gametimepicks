/**
 * suggested-parlay-grouping — PURE helpers that make the Suggested-parlay
 * sport views consistent: the **"All" view is the deduped UNION of the
 * single-sport buckets (NBA + MLB + Mixed)**, never a separately-stored,
 * independently-capped "all" bucket.
 *
 * WHY: the optimizer payload stores `publicRiskSections[risk] = {all, nba, mlb,
 * multi}` where `all` is a separate curation capped per risk. Reading that stored
 * `all` made the "All" tab show FEWER cards than its child tabs. These helpers
 * derive "all" as the union so `all ≥ each child` always holds. Mixed-sport
 * filtering for *official* suggested happens downstream (official = single-sport);
 * these helpers do not invent or relabel cards.
 *
 * Pure + dependency-free (client-safe; `tsx --test` exercises it directly).
 */

export type SportView = "all" | "nba" | "mlb" | "multi";
export type RiskKey = "low" | "medium" | "high" | "longshot";

export const RISK_KEYS: ReadonlyArray<RiskKey> = ["low", "medium", "high", "longshot"];
export const SINGLE_SPORT_BUCKETS: ReadonlyArray<Exclude<SportView, "all">> = ["nba", "mlb", "multi"];

/** A risk section's per-sport buckets as stored in the optimizer payload. */
export interface SportBuckets<T> {
  readonly all?: T[];
  readonly nba?: T[];
  readonly mlb?: T[];
  readonly multi?: T[];
}

/** Display targets (cards per risk × view). */
export const TARGET_MIN = 3;
export const DISPLAY_CAP = 5;

export type AvailabilityReason = "ok" | "limited" | "empty";

export interface SportViewCounts {
  readonly all: number;
  readonly nba: number;
  readonly mlb: number;
  readonly multi: number;
}

/** Stable key for dedup — slipId if present, else a content hash of the legs. */
export function slipKey(slip: unknown): string {
  const s = slip as { slipId?: unknown; id?: unknown; parlayId?: unknown; legs?: Array<Record<string, unknown>> };
  if (s && (s.slipId != null)) return String(s.slipId);
  if (s && (s.id != null)) return String(s.id);
  if (s && (s.parlayId != null)) return String(s.parlayId);
  const legs = Array.isArray(s?.legs) ? s.legs : [];
  return legs
    .map((l) => `${l.playerId ?? l.player ?? ""}|${l.market ?? l.marketKey ?? ""}|${l.line ?? ""}`)
    .sort()
    .join(";");
}

/**
 * Slips for a sport VIEW from ONE risk section. The "all" view is the deduped
 * union of nba+mlb+multi (NOT the stored `all` bucket). A specific sport returns
 * that bucket (deduped, defensively).
 */
export function sectionSlipsForSport<T>(
  section: SportBuckets<T> | null | undefined,
  sport: SportView,
): T[] {
  if (!section) return [];
  const dedup = (arr: T[]): T[] => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const s of arr) {
      const k = slipKey(s);
      if (!seen.has(k)) { seen.add(k); out.push(s); }
    }
    return out;
  };
  if (sport === "all") {
    const merged: T[] = [];
    for (const b of SINGLE_SPORT_BUCKETS) for (const s of (section[b] ?? [])) merged.push(s);
    return dedup(merged);
  }
  return dedup(section[sport] ?? []);
}

/** Per-view counts across all risk sections (deduped per view). Guarantees
 *  `all >= nba`, `all >= mlb`, `all >= multi`. */
export function countSportViews<T>(
  sections: Partial<Record<RiskKey, SportBuckets<T>>> | null | undefined,
): SportViewCounts {
  const tally = (sport: SportView): number => {
    const seen = new Set<string>();
    for (const rk of RISK_KEYS) for (const s of sectionSlipsForSport(sections?.[rk], sport)) seen.add(slipKey(s));
    return seen.size;
  };
  return { all: tally("all"), nba: tally("nba"), mlb: tally("mlb"), multi: tally("multi") };
}

/** True iff the "all" view is at least as large as every child view. */
export function allCoversChildren(counts: SportViewCounts): boolean {
  return counts.all >= counts.nba && counts.all >= counts.mlb && counts.all >= counts.multi;
}

/** Cap a section's slips to the display window (≤ DISPLAY_CAP); never fabricates. */
export function capForDisplay<T>(slips: T[], cap = DISPLAY_CAP): T[] {
  return slips.slice(0, Math.max(0, cap));
}

/** Honest availability for a rendered section (no fabrication of missing cards). */
export function availabilityReason(shownCount: number, target = TARGET_MIN): AvailabilityReason {
  if (shownCount <= 0) return "empty";
  if (shownCount < target) return "limited";
  return "ok";
}

export function availabilityNote(shownCount: number, target = TARGET_MIN): string | null {
  const r = availabilityReason(shownCount, target);
  if (r === "ok") return null;
  if (r === "empty") return "No qualifying parlays for this risk level on this slate.";
  return `Only ${shownCount} qualifying parlay${shownCount === 1 ? "" : "s"} — fewer than ${target} clean combinations on this slate.`;
}
