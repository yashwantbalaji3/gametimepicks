/**
 * Custom parlay evaluator — pure helpers consumed by the "Build your
 * own parlay" surface under suggested parlays on the homepage and
 * Parlay Lab.
 *
 * Honest framing (see PR #101 spec):
 *   - We do NOT compute or display win probability or expected value.
 *   - We display a "Model rating" derived from the same per-leg
 *     `legScore` the optimizer computes (persisted in the optimizer
 *     snapshot's `legPool` by `pipeline.snapshot_optimizer`).
 *   - The slip's combined-odds payout is shown when every leg has
 *     American odds — purely a payout reference, not a probability.
 *   - Warnings surface real correlation / market-stability risks the
 *     model already tracks (same-game, same-team, volatile market,
 *     low-confidence leg, too many legs).
 *   - The result label is **always** "Custom evaluation" — never a
 *     tracked / official model pick.
 *
 * Nothing in this module fetches data, mutates state, or persists
 * results.
 */

import type { OptimizerLeg } from "./parlay-optimizer";
import { filterBuildYourOwnLegs } from "./sport-capabilities";

// ---------------------------------------------------------------------------
// Volatile market list — mirror of pipeline.parlay_optimizer's
// `MLB_VOLATILE_MARKETS`. Kept inline so this module has no Python
// dependency.
// ---------------------------------------------------------------------------

const _MLB_VOLATILE_MARKETS: Readonly<Set<string>> = new Set([
  "batter_total_bases",
  "pitcher_strikeouts",
  "batter_hits_runs_rbis",
]);

// Correlation penalty per repeated game / repeated team. Mirrors the
// balanced profile in pipeline.parlay_optimizer — that's the profile
// the leg pool is scored against (see `_LEG_POOL_PROFILE`).
const _CORRELATION_PENALTY_PER_EXTRA = 0.08;

// Hard cap shown in the UI. Past this the user gets a "too many legs"
// warning. We don't reject the slip — the user can still inspect what
// the model says, we just call out the risk honestly.
export const CUSTOM_PARLAY_MAX_LEGS = 6;

// Star composition thresholds.
const _STAR_HEAVY_RATIO = 0.75;
const _VALUE_HEAVY_RATIO = 0.5;

// Risk label cutoffs by leg count. Mirrors the suggested-parlay lane
// thresholds (Conservative 2 legs / Balanced 3 legs / High variance
// 4-5 legs) so the custom builder feels consistent with the
// suggested cards above it.
export type CustomRiskLabel = "Lower variance" | "Balanced" | "High variance";

export type CustomParlayWarning =
  | "same_game_stack"
  | "same_team_stack"
  | "low_confidence_leg"
  | "volatile_market"
  | "too_many_legs"
  | "star_heavy"
  | "value_heavy";

export interface CustomParlayEvaluation {
  /** Number of legs the user has picked. */
  legCount: number;
  /** Average per-leg edge across the selected legs (clipped to the
   *  range of the source data — null when no legs have an edge). */
  averageEdgePct: number | null;
  /** Sum of every leg's `legScore` minus the correlation penalty.
   *  Higher = the model likes this slip more. Bounded — the lower
   *  bound is 0, the upper bound depends on the legs the user picks. */
  modelRating: number;
  /** American combined-odds payout per $100 stake when every leg has
   *  oddsForSide. Null when any leg is missing odds (we never
   *  fabricate a payout). */
  combinedOdds: number | null;
  /** Same-game-aware risk label. "Custom evaluation" surface only —
   *  not a profile name. */
  riskLabel: CustomRiskLabel;
  /** All warnings that apply to this leg set. Empty list = clean. */
  warnings: CustomParlayWarning[];
  /** True when ≥75% of legs are tagged `isStar`. */
  starHeavy: boolean;
  /** True when ≥50% of legs are non-stars or Low confidence. */
  valueHeavy: boolean;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function evaluateCustomParlay(
  legs: ReadonlyArray<OptimizerLeg>,
): CustomParlayEvaluation {
  if (legs.length === 0) {
    return {
      legCount: 0,
      averageEdgePct: null,
      modelRating: 0,
      combinedOdds: null,
      riskLabel: "Lower variance",
      warnings: [],
      starHeavy: false,
      valueHeavy: false,
    };
  }

  // Average edge — only counts legs that carry an `edgePct`.
  let edgeSum = 0;
  let edgeCount = 0;
  for (const leg of legs) {
    if (typeof leg.edgePct === "number") {
      edgeSum += leg.edgePct;
      edgeCount += 1;
    }
  }
  const averageEdgePct = edgeCount > 0 ? edgeSum / edgeCount : null;

  // Model rating — sum of per-leg `legScore` minus correlation penalty.
  // Legs missing `legScore` (older snapshot or pool not populated)
  // contribute 0 — we don't fabricate a score.
  let scoreSum = 0;
  for (const leg of legs) {
    scoreSum += leg.legScore ?? 0;
  }
  const games = new Set(legs.map((l) => l.gameId).filter(Boolean));
  const teams = new Set(legs.map((l) => l.team).filter(Boolean));
  const extraGameLegs = Math.max(0, legs.length - games.size);
  const extraTeamLegs = Math.max(0, legs.length - teams.size);
  const correlation =
    _CORRELATION_PENALTY_PER_EXTRA * (extraGameLegs + extraTeamLegs);
  const modelRating = Math.max(0, scoreSum - correlation);

  // Combined American odds — only when every leg has odds.
  const combinedOdds = computeCombinedAmericanOdds(legs);

  // Star composition.
  let starLegs = 0;
  let nonStarOrLowConf = 0;
  for (const leg of legs) {
    if (leg.isStar) starLegs += 1;
    if (!leg.isStar || (leg.confidence ?? "") === "Low") nonStarOrLowConf += 1;
  }
  const starHeavy = starLegs / legs.length >= _STAR_HEAVY_RATIO;
  const valueHeavy = nonStarOrLowConf / legs.length >= _VALUE_HEAVY_RATIO;

  // Warnings.
  const warnings: CustomParlayWarning[] = [];
  if (extraGameLegs > 0) warnings.push("same_game_stack");
  if (extraTeamLegs > 0) warnings.push("same_team_stack");
  if (legs.some((l) => (l.confidence ?? "") !== "High")) {
    warnings.push("low_confidence_leg");
  }
  if (legs.some((l) => l.isVolatileMlb || _MLB_VOLATILE_MARKETS.has(l.market))) {
    warnings.push("volatile_market");
  }
  if (legs.length > 5) warnings.push("too_many_legs");
  if (starHeavy) warnings.push("star_heavy");
  if (valueHeavy && !starHeavy) warnings.push("value_heavy");

  // Risk label — driven by leg count first (a 2-leg slip is never
  // labeled "High variance" no matter how risky the legs look) but a
  // 3-leg slip with a same-game stack still tips into Balanced/HV.
  const riskLabel = computeRiskLabel(legs.length, warnings);

  return {
    legCount: legs.length,
    averageEdgePct,
    modelRating,
    combinedOdds,
    riskLabel,
    warnings,
    starHeavy,
    valueHeavy,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeRiskLabel(
  legCount: number,
  warnings: ReadonlyArray<CustomParlayWarning>,
): CustomRiskLabel {
  if (legCount <= 2) return "Lower variance";
  if (legCount >= 5) return "High variance";
  // 3-4 legs: bumped up by stacking / volatility flags.
  const risky = warnings.some(
    (w) =>
      w === "same_game_stack" ||
      w === "same_team_stack" ||
      w === "volatile_market" ||
      w === "too_many_legs",
  );
  if (legCount === 4 && risky) return "High variance";
  return "Balanced";
}

function americanToDecimal(odds: number): number {
  if (odds >= 100) return 1 + odds / 100;
  if (odds <= -100) return 1 + 100 / Math.abs(odds);
  // Defensive — odds between -99 and +99 are ambiguous in American
  // notation; treat as exactly even-money to avoid NaN.
  return 2.0;
}

function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export function computeCombinedAmericanOdds(
  legs: ReadonlyArray<OptimizerLeg>,
): number | null {
  if (legs.length === 0) return null;
  let combinedDecimal = 1;
  for (const leg of legs) {
    if (typeof leg.oddsForSide !== "number") return null;
    combinedDecimal *= americanToDecimal(leg.oddsForSide);
  }
  return decimalToAmerican(combinedDecimal);
}

/** Returns the `legPool` from the snapshot if present, else an empty
 *  list. Filters out non-Over/Under sides as a defensive guard, and —
 *  PR `feature/byo-modeled-sport-gating` (2026-06-02) — gates the pool to
 *  MODELED sports only (`filterBuildYourOwnLegs`). Build Your Own may combine
 *  modeled-sport legs (NBA+MLB, mixed allowed) but must never include a
 *  schedule-only / coming-soon / unknown / missing-sport leg. Both the custom
 *  generator and the manual builder consume this pool, so this single gate
 *  covers every Build-Your-Own candidate. Fail-closed; no fabrication. */
export function getLegPool(snapshot: {
  legPool?: { legs?: OptimizerLeg[] };
}): OptimizerLeg[] {
  const legs = snapshot.legPool?.legs ?? [];
  const sided = legs.filter((l) => l.side === "Over" || l.side === "Under");
  return filterBuildYourOwnLegs(sided);
}

/** Human label for a CustomParlayWarning — kept here so the UI
 *  component doesn't sprout its own copy of the strings. */
export function warningLabel(w: CustomParlayWarning): string {
  switch (w) {
    case "same_game_stack":
      return "Same-game stack";
    case "same_team_stack":
      return "Same-team stack";
    case "low_confidence_leg":
      return "Low-confidence leg";
    case "volatile_market":
      return "Volatile market";
    case "too_many_legs":
      return "Too many legs";
    case "star_heavy":
      return "Star-heavy";
    case "value_heavy":
      return "Value-heavy";
    default:
      return w;
  }
}
