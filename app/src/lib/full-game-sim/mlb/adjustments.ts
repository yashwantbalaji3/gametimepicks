/**
 * INDEPENDENT-INPUT ADJUSTMENTS — the OPTIONAL, SHADOW-ONLY layer that lets the market-anchored engine
 * consume real independent context (a static park factor, strictly-earlier team run rates). It is
 * deliberately tiny: every adjustment is BOUNDED (a park factor can move the total by at most ±3%; a
 * run-rate gap can move the margin by at most ±0.3 runs), DISABLED when inputs are missing/neutral, and
 * evaluated ONLY in the rolling backtest — never in the default artifact, never in a public pick, never
 * in a product card. Pure, no io.
 *
 * The engine is ALWAYS market-anchored. A market-free ("independent") simulation is NOT supported — the
 * inputs are nowhere near sufficient — so `selectEngineMode` returns `independent_simulation_blocked`
 * whenever there is no market total to anchor on.
 */
import type { AdjustmentSummary, EngineMode, ExpectedRunsResult, IndependentInputs, MarketInput } from "./types";

/** Bounds — intentionally conservative so an independent input can never dominate the market anchor. */
export const ADJUSTMENT_BOUNDS = {
  /** Park factor moves the total by at most ±3%. */
  maxTotalNudgePct: 0.03,
  /** Fraction of the (home − away) run-rate gap applied to the margin. */
  runRateMarginK: 0.1,
  /** ...capped at ±0.3 runs. */
  maxMarginNudge: 0.3,
  /** Each team needs ≥3 committed prior games for a run-rate signal. */
  minRunRateSample: 3,
  /** Park factor must deviate ≥2% from neutral (and not be a neutral_default) to matter. */
  minParkDeviation: 0.02,
} as const;

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const r3 = (x: number): number => Number(x.toFixed(3));

function usablePark(indep?: IndependentInputs): boolean {
  return (
    !!indep &&
    typeof indep.parkRunFactor === "number" &&
    indep.parkConfidence !== "neutral_default" &&
    Math.abs(indep.parkRunFactor - 1) >= ADJUSTMENT_BOUNDS.minParkDeviation
  );
}
function usableRunRate(indep?: IndependentInputs): boolean {
  return (
    !!indep &&
    typeof indep.awayRunRate === "number" &&
    typeof indep.homeRunRate === "number" &&
    (indep.runRateSampleGames?.away ?? 0) >= ADJUSTMENT_BOUNDS.minRunRateSample &&
    (indep.runRateSampleGames?.home ?? 0) >= ADJUSTMENT_BOUNDS.minRunRateSample
  );
}

/**
 * Which mode the engine runs in for this game:
 *  - no market total            → `independent_simulation_blocked` (can't anchor; inputs insufficient alone)
 *  - a usable park / run-rate    → `market_anchored_with_independent_adjustments`
 *  - otherwise                   → `market_anchored_simulation`
 */
export function selectEngineMode(market: MarketInput, indep?: IndependentInputs): EngineMode {
  const hasTotal = typeof market.total === "number" && Number.isFinite(market.total) && market.total > 0;
  if (!hasTotal) return "independent_simulation_blocked";
  return usablePark(indep) || usableRunRate(indep)
    ? "market_anchored_with_independent_adjustments"
    : "market_anchored_simulation";
}

/**
 * Apply the bounded independent adjustments to a market-anchored expected-runs split. When no usable
 * input exists this is an identity (returns the input unchanged, `applied:false`). SHADOW-ONLY.
 */
export function applyIndependentAdjustments(
  expected: ExpectedRunsResult,
  indep: IndependentInputs | undefined,
  market: MarketInput,
): { expected: ExpectedRunsResult; mode: EngineMode; adjustments: AdjustmentSummary } {
  const mode = selectEngineMode(market, indep);
  const summary: AdjustmentSummary = { applied: false, parkTotalNudge: 0, runRateMarginNudge: 0, notes: [] };
  if (mode !== "market_anchored_with_independent_adjustments") {
    return { expected, mode, adjustments: summary };
  }

  let total = expected.total;
  let margin = expected.margin;

  if (usablePark(indep) && indep) {
    const clampedPct = clamp(indep.parkRunFactor! - 1, -ADJUSTMENT_BOUNDS.maxTotalNudgePct, ADJUSTMENT_BOUNDS.maxTotalNudgePct);
    const nudge = r3(clampedPct * total);
    total = total + nudge;
    summary.parkTotalNudge = nudge;
    summary.notes.push(`park run factor ${indep.parkRunFactor} → total nudged ${nudge >= 0 ? "+" : ""}${nudge} (bounded ±${ADJUSTMENT_BOUNDS.maxTotalNudgePct * 100}%)`);
  }
  if (usableRunRate(indep) && indep) {
    const raw = (indep.homeRunRate! - indep.awayRunRate!) * ADJUSTMENT_BOUNDS.runRateMarginK;
    const nudge = r3(clamp(raw, -ADJUSTMENT_BOUNDS.maxMarginNudge, ADJUSTMENT_BOUNDS.maxMarginNudge));
    margin = margin + nudge;
    summary.runRateMarginNudge = nudge;
    summary.notes.push(`run-rate gap (home ${indep.homeRunRate} − away ${indep.awayRunRate}) → margin nudged ${nudge >= 0 ? "+" : ""}${nudge} (bounded ±${ADJUSTMENT_BOUNDS.maxMarginNudge} runs, thin sample)`);
  }

  summary.applied = summary.parkTotalNudge !== 0 || summary.runRateMarginNudge !== 0;
  // Keep the split physical: both expected-run means non-negative; cap the margin at the (adjusted) total.
  const cappedMargin = clamp(margin, -total * 0.98, total * 0.98);
  const adj: ExpectedRunsResult = {
    ...expected,
    total,
    margin: cappedMargin,
    homeExp: (total + cappedMargin) / 2,
    awayExp: (total - cappedMargin) / 2,
    adjusted: true,
    warnings: [...expected.warnings, "bounded independent adjustments applied (shadow-only)"],
  };
  return { expected: adj, mode, adjustments: summary };
}
