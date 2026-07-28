/**
 * Leg-quality gate evaluator — pure, client-safe (no node:fs imports).
 *
 * ─── SINGLE SOURCE OF TRUTH ─────────────────────────────────────────
 * The gate that ACTUALLY composes official parlay lanes lives in
 * `pipeline/parlay_optimizer.py::is_eligible`. This TS module is a
 * NON-AUTHORITATIVE mirror used only for:
 *
 *   1. Client-side "why is this leg eligible / excluded" explainers.
 *   2. The companion audit doc `docs/PARLAY_LEG_QUALITY_GATES.md`.
 *
 * It is NOT imported by any optimizer / snapshot / settlement path and
 * changes no official lane, no published number, and no graded result.
 * Per the model-loop hard constraint, audit policy is never consumed by
 * the optimizer without explicit operator approval — this evaluator is
 * deliberately inert with respect to lane composition.
 *
 * If you change a threshold in the Python `ProfileRules`, update the
 * matching preset below. The unit tests assert these presets stay in
 * step with the documented Python values, so drift fails CI.
 *
 * Honesty constraints (same as the rest of the parlay surface):
 *   - No "safe" / "safety" language; sections are "lower-variance",
 *     never "safe".
 *   - No implication of guaranteed payout.
 *   - A leg with no usable quality signal is EXCLUDED, never invented.
 * ────────────────────────────────────────────────────────────────────
 */

/** Risk-profile key — mirrors `PROFILE_RULES_BY_NAME` in Python. */
export type LegGateProfile =
  | "conservative"
  | "balanced"
  | "aggressive"
  | "star_power";

/** Public-section key — mirrors `RiskSectionKey` / the Python
 *  `PUBLIC_RISK_SECTION_ORDER`. */
export type LegGateSection = "low" | "medium" | "high" | "longshot";

/**
 * A leg-quality gate: the per-leg quality bar a prop must clear to enter
 * a lane. Thresholds are INPUTS (provided by the caller / the presets
 * below), so this evaluator holds no embedded policy of its own — it is
 * a pure predicate over an explicit config.
 *
 * Field-for-field mirror of the subset of `ProfileRules` that
 * `is_eligible` actually reads.
 */
export interface LegQualityGate {
  /** Human label for the gate (used in explainer copy). */
  profile: string;
  /** Allowed confidence tiers. CASE-SENSITIVE: "High" | "Medium" | "Low". */
  confidence: ReadonlyArray<string>;
  /** Minimum model edge in percentage points. */
  minEdgePct: number;
  /** Legacy NBA-only floor: when true, any leg with recent10Count < 5
   *  is rejected before the DNP guard even runs. */
  requireRecent10: boolean;
  /** Reject legs with a non-positive playerId (no resolvable player). */
  requireValidPlayerId: boolean;
  /** Reject R5-flagged extreme-edge "anomaly" legs. */
  excludeAnomalies: boolean;
  /** Reject any leg whose star tier is "none". */
  requireStar: boolean;
  /** PR #115 DNP guard — NBA leg needs recent10Count >= this. */
  dnpMinNbaRecent10: number;
  /** PR #115 DNP guard — MLB leg needs recentSeries length >= this. */
  dnpMinMlbSeries: number;
  /** When non-null, an MLB leg's market must be in this allowlist.
   *  null = no MLB market restriction. NBA legs ignore this field. */
  mlbAllowedMarkets: ReadonlyArray<string> | null;
}

/** The subset of an optimizer leg this evaluator reads. A superset of
 *  these fields (the full `OptimizerLeg`) is accepted via structural
 *  typing, so callers can pass real legs directly. */
export interface LegQualityInput {
  sport: string;
  side: string | null;
  confidence: string | null;
  edgePct: number | null;
  recent10Count: number;
  recentSeries?: ReadonlyArray<number> | null;
  playerId?: number | null;
  isAnomaly?: boolean | null;
  starTier?: "none" | "regular" | "core" | "superstar" | null;
  market?: string | null;
}

export interface LegQualityResult {
  /** True iff the leg clears EVERY gate (logical AND of all checks),
   *  matching the Python `is_eligible` boolean exactly. */
  passes: boolean;
  /** Every reason the leg failed, in evaluation order. Empty when it
   *  passes. The explainer renders these verbatim. Unlike the Python
   *  short-circuit, this collects ALL failures so a user sees the full
   *  picture, not just the first blocker. */
  failures: string[];
}

/**
 * Pure predicate mirroring `pipeline/parlay_optimizer.py::is_eligible`,
 * minus the user-supplied selection filters (sport / player / game),
 * which are display filters rather than quality gates.
 *
 * Collects every failing reason rather than short-circuiting, but the
 * `passes` boolean is identical to the Python predicate because every
 * check is ANDed.
 */
export function evaluateLegQualityGate(
  leg: LegQualityInput,
  gate: LegQualityGate,
): LegQualityResult {
  const failures: string[] = [];

  if (leg.side !== "Over" && leg.side !== "Under") {
    failures.push(`side must be Over/Under (got ${leg.side ?? "null"})`);
  }
  if (!gate.confidence.includes(leg.confidence ?? "")) {
    failures.push(
      `confidence ${leg.confidence ?? "null"} not in [${gate.confidence.join(
        ", ",
      )}]`,
    );
  }
  const edge = leg.edgePct ?? 0;
  if (edge < gate.minEdgePct) {
    failures.push(`edge ${edge}pp below min ${gate.minEdgePct}pp`);
  }
  if (gate.requireRecent10 && leg.recent10Count < 5) {
    failures.push(`recent10Count ${leg.recent10Count} below legacy floor 5`);
  }
  // PR #115 DNP guard — sport-specific recent-activity floor.
  if (leg.sport === "nba") {
    if (leg.recent10Count < gate.dnpMinNbaRecent10) {
      failures.push(
        `NBA recent10Count ${leg.recent10Count} below DNP guard ${gate.dnpMinNbaRecent10}`,
      );
    }
  } else if (leg.sport === "mlb") {
    const seriesLen = leg.recentSeries ? leg.recentSeries.length : 0;
    if (seriesLen < gate.dnpMinMlbSeries) {
      failures.push(
        `MLB recentSeries length ${seriesLen} below DNP guard ${gate.dnpMinMlbSeries}`,
      );
    }
  }
  if (gate.requireValidPlayerId && (leg.playerId ?? 0) <= 0) {
    failures.push("missing resolvable playerId");
  }
  if (gate.excludeAnomalies && leg.isAnomaly === true) {
    failures.push("anomaly leg excluded by gate");
  }
  if (gate.requireStar && (leg.starTier ?? "none") === "none") {
    failures.push("non-star leg excluded by star-only gate");
  }
  if (
    leg.sport === "mlb" &&
    gate.mlbAllowedMarkets !== null &&
    !gate.mlbAllowedMarkets.includes(leg.market ?? "")
  ) {
    failures.push(
      `MLB market ${leg.market ?? "null"} not in lane allowlist`,
    );
  }

  return { passes: failures.length === 0, failures };
}

// ───────────────────────────────────────────────────────────────────
// Authoritative-mirror presets. Keep in step with the Python
// `ProfileRules` constants in `pipeline/parlay_optimizer.py`. The unit
// tests pin every value below to the documented Python thresholds.
// ───────────────────────────────────────────────────────────────────

const MLB_HITS_TB = ["batter_hits", "batter_total_bases"] as const;
const MLB_HITS_TB_HRR = [
  "batter_hits",
  "batter_total_bases",
  "batter_hits_runs_rbis",
] as const;
const MLB_ALL_FOUR = [
  "batter_hits",
  "batter_total_bases",
  "batter_hits_runs_rbis",
  "pitcher_strikeouts",
] as const;

/**
 * Per-profile leg gates.
 *
 * SPRINT 035 — confidence and minimum-edge gates are neutralised.
 * `conservative` previously required `confidence: ["High"]` and `minEdgePct: 3.0`, i.e. the
 * "safest" profile selected exactly the rows that performed WORST on settled results ("High" .4934
 * vs "Low" .5172; 20+pp .4317 vs .5203 under 2.5pp, n=21,192). Every profile now admits all
 * confidence tiers and sets no edge floor.
 *
 * What profiles still differ on is DATA QUALITY and AVAILABILITY — recent-10 requirement, valid
 * player id, anomaly exclusion, DNP thresholds, allowed markets. Those are measurable properties of
 * the row, not predictions about it.
 *
 * `excludeAnomalies` is deliberately KEPT and is now the strictest evidence-backed filter available:
 * anomaly-flagged rows (>=20pp) hit .4342 over n=760. Excluding them is supported by settled data;
 * ranking by the same quantity is not.
 */
const ALL_CONFIDENCE_TIERS = ["High", "Medium", "Low"] as const;

/** No edge floor. Retained as a field so the gate shape is unchanged for consumers. */
const NO_EDGE_FLOOR = 0;

export const PROFILE_LEG_GATES: Record<LegGateProfile, LegQualityGate> = {
  conservative: {
    profile: "conservative",
    confidence: [...ALL_CONFIDENCE_TIERS],
    minEdgePct: NO_EDGE_FLOOR,
    requireRecent10: true,
    requireValidPlayerId: true,
    excludeAnomalies: true,
    requireStar: false,
    dnpMinNbaRecent10: 7,
    dnpMinMlbSeries: 5,
    mlbAllowedMarkets: [...MLB_HITS_TB],
  },
  balanced: {
    profile: "balanced",
    confidence: [...ALL_CONFIDENCE_TIERS],
    minEdgePct: NO_EDGE_FLOOR,
    requireRecent10: false,
    requireValidPlayerId: true,
    excludeAnomalies: true,
    requireStar: false,
    dnpMinNbaRecent10: 5,
    dnpMinMlbSeries: 5,
    mlbAllowedMarkets: [...MLB_ALL_FOUR],
  },
  aggressive: {
    profile: "aggressive",
    confidence: [...ALL_CONFIDENCE_TIERS],
    minEdgePct: NO_EDGE_FLOOR,
    requireRecent10: false,
    requireValidPlayerId: false,
    excludeAnomalies: false,
    requireStar: false,
    dnpMinNbaRecent10: 3,
    dnpMinMlbSeries: 3,
    mlbAllowedMarkets: [...MLB_ALL_FOUR],
  },
  star_power: {
    profile: "star_power",
    confidence: [...ALL_CONFIDENCE_TIERS],
    minEdgePct: NO_EDGE_FLOOR,
    requireRecent10: true,
    requireValidPlayerId: true,
    excludeAnomalies: true,
    requireStar: true,
    dnpMinNbaRecent10: 7,
    dnpMinMlbSeries: 5,
    mlbAllowedMarkets: [...MLB_HITS_TB_HRR],
  },
};

/**
 * The leg gate the PUBLIC risk-section spread actually applies today.
 *
 * Honest finding from the Phase 11 audit: `_build_leg_pool` qualifies
 * the public-section pool with the single most-permissive profile
 * (`aggressive`), then section membership (Low / Medium / High /
 * Longshot) is decided purely by combined odds + leg count. So EVERY
 * public section inherits the same `aggressive` per-leg bar — the "Low
 * Risk" label reflects shorter combined odds and fewer legs, NOT a
 * higher per-leg quality bar. See `docs/PARLAY_LEG_QUALITY_GATES.md`.
 */
export const PUBLIC_SECTION_LEG_GATE_TODAY: LegQualityGate =
  PROFILE_LEG_GATES.aggressive;

/**
 * PROPOSED — NOT ENFORCED. A per-section leg-quality ladder that would
 * make the public "Low Risk" label mean conservative-grade legs, not
 * just shorter odds: tighten the per-leg bar as the section label gets
 * lower-variance. Wiring this into `generate_public_risk_sections`
 * requires the documented promotion path in `docs/MODEL_LEARNING_LOOP.md`
 * §3 (out-of-sample confirmation + a pinning test) AND explicit operator
 * approval. Surfaced here only so the proposal is testable and reviewable.
 */
export const PROPOSED_SECTION_LEG_GATES: Record<
  LegGateSection,
  LegQualityGate
> = {
  low: { ...PROFILE_LEG_GATES.conservative, profile: "low (proposed)" },
  medium: { ...PROFILE_LEG_GATES.balanced, profile: "medium (proposed)" },
  high: {
    ...PROFILE_LEG_GATES.aggressive,
    profile: "high (proposed)",
    minEdgePct: NO_EDGE_FLOOR,
  },
  longshot: {
    ...PROFILE_LEG_GATES.aggressive,
    profile: "longshot (proposed)",
  },
};
