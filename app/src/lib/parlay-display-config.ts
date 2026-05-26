/**
 * Display-config constants for the Parlay Lab homepage.
 *
 * Extracted into a standalone module so they can be unit-tested
 * without booting a JSX renderer. PR #110 safety filters A + B
 * landed these caps based on the 5/25 audit (6W-54L-0P-10 pending,
 * 10% decisive hit rate):
 *
 *   - Show only the safer lanes (Conservative / Balanced / Star
 *     Power) by default. High-variance is opt-in via a "Show high
 *     variance" toggle.
 *   - Cap visible slips per safe lane at 2 (down from 3) because
 *     the 3rd alternate routinely lost.
 *   - When the longshot lane IS expanded, also cap at 2 visible.
 *
 * These constants are the single source of truth for the lane
 * presentation surface — both the runtime UI and the test suite
 * import them.
 */
import type { ParlayRiskProfile } from "./parlay-suggested";

/** Lanes that render by default on the homepage. */
export const SAFE_RISK_ORDER: ParlayRiskProfile[] = [
  "conservative",
  "balanced",
  "star_power",
];

/** Lane that lives behind the "Show high variance" toggle. */
export const HIGH_VARIANCE_PROFILE: ParlayRiskProfile = "aggressive";

/** Cap on visible slips per safe lane (Conservative / Balanced /
 *  Star Power).
 *
 *  PR #115 raised this from 2 → 5. Per the user spec: "at least 5
 *  suggested parlays for each risk level for each sport when data
 *  supports it." The display selector keeps the same cross-player
 *  diversity rotation in place — when alternatives exist the top
 *  N visible are NOT just the top-N raw scores. When the safe
 *  pool is smaller than 5, the lane honestly shows fewer slips
 *  instead of fabricating filler. */
export const VISIBLE_PER_LANE_SAFE = 5;

/** Cap on visible slips inside the expanded High-Variance lane.
 *  Spec G in PR #110 said "aggressive visible cap <= 4". We use
 *  4 here (was 2). Longshot stays opt-in via the toggle. */
export const VISIBLE_PER_LANE_HV = 4;

/** Default open-state of the "Show high variance" toggle. We
 *  default to *hidden* so the longshot lane never appears as a
 *  peer to the safer lanes on first paint. */
export const HIGH_VARIANCE_DEFAULT_OPEN = false;

/**
 * Maximum number of legs allowed in an OFFICIAL suggested slip
 * (PR #110 filter G). 5-leg slips went 0-14 on 5/25.
 *
 * Backend already enforces this for newly-generated snapshots via
 * `AGGRESSIVE_RULES.max_legs = 4`. This display-layer guard is a
 * safety belt for any pre-existing snapshot files that still
 * contain 5+ leg slips — they get filtered out of the official
 * homepage suggestions but remain available to the Custom Builder
 * (since the user has opted into building their own slip there).
 */
export const MAX_OFFICIAL_LEG_COUNT = 4;

/**
 * Predicate: should this slip appear in the official homepage
 * suggestions? Currently checks the leg-count cap; can be extended
 * with future safety predicates without changing call sites.
 */
export function isAllowedOfficialSlip(slip: {
  legs?: ReadonlyArray<unknown>;
}): boolean {
  const n = slip.legs?.length ?? 0;
  return n > 0 && n <= MAX_OFFICIAL_LEG_COUNT;
}
