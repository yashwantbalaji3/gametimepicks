/**
 * v2-watchlist-rules — INTERNAL, pure, deterministic leg-level watchlist tagging.
 *
 * HARD OFF SWITCH: `ENABLE_V2_SHADOW_CANDIDATE` is `false`. This module NEVER
 * changes projections, the optimizer, Suggested Parlays, boards, or public UI.
 * It only *tags* legs that match a `shadow_watchlist` v2 segment so internal
 * audits can report them. It returns no official recommendation and emits no
 * "safe"/"lock"/"guaranteed"/"better hit rate" language.
 *
 * A leg is on the watchlist only if it matches a segment that the hardened
 * candidate search classified as `shadow_watchlist` (beats the naive CI but
 * fails ≥1 launch gate). Matching a watchlist rule is NOT a recommendation.
 */

/** Master kill switch. Must stay false until a corrected launch_candidate is
 *  approved by an operator. Any future "apply" path MUST check this. */
export const ENABLE_V2_SHADOW_CANDIDATE = false;

/** Minimal leg shape the rules operate on (board/optimizer-agnostic). */
export interface WatchlistLegInput {
  sport: string;
  market: string;
  side: string;
  line: number | null;
  /** chosen-side American odds */
  oddsForSide: number | null;
  /** strict L5 hit count for the chosen side (0..5), or null if unknown */
  l5hits: number | null;
}

export interface WatchlistRule {
  key: string;
  label: string;
  /** segment name in audit-v2-candidate-search */
  segment: string;
  /** documented failed launch gates (why it is watchlist, not launch) */
  failedGates: string[];
  match: (leg: WatchlistLegInput) => boolean;
}

const isMlbLowGate = (leg: WatchlistLegInput): boolean =>
  (leg.sport ?? "mlb").toLowerCase() === "mlb" &&
  leg.l5hits === 5 &&
  typeof leg.oddsForSide === "number" &&
  Number.isFinite(leg.oddsForSide) &&
  leg.oddsForSide <= -150;

/** The watchlist rules, mirroring the shadow_watchlist segments. */
export const WATCHLIST_RULES: WatchlistRule[] = [
  {
    key: "low_gate",
    label: "MLB Low gate (L5 5/5 & odds ≤ -150)",
    segment: "mlb_low_gate_5of5_and_-150",
    failedGates: ["corrected_ci", "adjusted_p", "single_date_overdependence"],
    match: isMlbLowGate,
  },
  {
    key: "batter_hits_low_gate",
    label: "MLB batter_hits Low gate (L5 5/5 & odds ≤ -150)",
    segment: "mlb_lowgate_batter_hits",
    failedGates: ["corrected_ci", "adjusted_p", "single_date_overdependence"],
    match: (leg) => isMlbLowGate(leg) && leg.market === "batter_hits",
  },
];

/** Returns the watchlist rule keys a leg matches (deterministic, fail-closed on
 *  missing data). NEVER an official recommendation. */
export function classifyV2WatchlistLeg(leg: WatchlistLegInput): string[] {
  if (!leg || typeof leg !== "object") return [];
  return WATCHLIST_RULES.filter((r) => {
    try { return r.match(leg); } catch { return false; }
  }).map((r) => r.key);
}

export interface WatchlistSummary {
  total: number;
  byRule: Record<string, number>;
  byMarket: Record<string, number>;
}

/** Summarize a set of legs by which watchlist rules they match + by market. */
export function summarizeV2Watchlist(legs: WatchlistLegInput[]): WatchlistSummary {
  const byRule: Record<string, number> = {};
  const byMarket: Record<string, number> = {};
  let total = 0;
  for (const leg of legs ?? []) {
    const keys = classifyV2WatchlistLeg(leg);
    if (!keys.length) continue;
    total++;
    byMarket[leg.market] = (byMarket[leg.market] || 0) + 1;
    for (const k of keys) byRule[k] = (byRule[k] || 0) + 1;
  }
  return { total, byRule, byMarket };
}

/** Human-readable reasons a watchlist segment is NOT launch-ready. */
export function explainFailedLaunchGates(ruleKey: string): string[] {
  const rule = WATCHLIST_RULES.find((r) => r.key === ruleKey || r.segment === ruleKey);
  if (!rule) return [];
  const gateText: Record<string, string> = {
    corrected_ci: "multiple-comparisons-corrected CI lower bound does not beat the de-vigged market",
    adjusted_p: "adjusted p-value (corrected for the segment family) is not significant",
    single_date_overdependence: "removing the single best date breaks the edge",
    date_stability: "the edge is not positive on enough dates",
    bucket_n: "the bucket is below the decided-leg floor",
    overall_n: "the overall sample is below the floor",
    beats_naive_ci: "does not clear even the naive 95% CI over de-vig",
    edge_or_confidence_driven: "the segment is defined by edgePct/confidence, which are not quality signals",
  };
  return rule.failedGates.map((g) => gateText[g] ?? g);
}
