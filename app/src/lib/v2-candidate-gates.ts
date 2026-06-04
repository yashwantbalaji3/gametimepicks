/**
 * v2-candidate-gates — pure, deterministic statistics + launch-gate classifier
 * for the v2 candidate search (app/scripts/audit-v2-candidate-search.mjs).
 *
 * WHY THIS EXISTS: a naive 95% Wilson CI lower bound clearing the de-vigged
 * market is NOT enough to call a feature a launch candidate when many segments
 * are searched at once — that invites multiple-comparisons false positives
 * (the MLB Low gate looked like a "launch_candidate" under a naive 95% CI but
 * failed once corrected). This module encodes the FULL launch gate set so the
 * audit cannot emit `launch_candidate` from a naive CI alone.
 *
 * Pure: no IO, no Date.now/Math.random. Mirror-of-stats only; never wired into
 * projections / optimizer / parlays / public UI.
 */

export const Z_95 = 1.96;

/** Standard normal CDF via erfc (Abramowitz & Stegun 7.1.26). Deterministic. */
export function normCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t) *
      Math.exp(-z * z);
  return x >= 0 ? 1 - y : 1 + y;
}

/** Inverse standard normal CDF (Acklam's algorithm). Deterministic. */
export function invNorm(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  let r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

export interface CI {
  lo: number;
  hi: number;
}

/** Wilson score interval at quantile z for w successes of n. */
export function wilson(w: number, n: number, z: number = Z_95): CI {
  if (n <= 0) return { lo: 0, hi: 0 };
  const p = w / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const m =
    (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, c - m), hi: Math.min(1, c + m) };
}

/** Two-sided z for a Bonferroni-corrected family of `numTests` at level alpha. */
export function correctedZ(numTests: number, alpha = 0.05): number {
  const k = Math.max(1, numTests);
  const alphaAdj = alpha / k;
  // two-sided CI -> use alphaAdj/2 in each tail
  return invNorm(1 - alphaAdj / 2);
}

/** One-sided p that observed wins exceed a Poisson-binomial expectation
 *  (normal approximation). expWins = sum of de-vig probs; varWins = sum p(1-p). */
export function poissonBinomialPValue(
  w: number,
  expWins: number,
  varWins: number,
): number {
  if (varWins <= 0) return w > expWins ? 0 : 1;
  const z = (w - expWins) / Math.sqrt(varWins);
  return 1 - normCdf(z); // one-sided upper
}

export type CandidateVerdict =
  | "launch_candidate"
  | "shadow_watchlist"
  | "needs_more_data"
  | "market_already_prices_it"
  | "blocked_missing_data"
  | "blocked_sample_size"
  | "blocked_unstable"
  | "blocked_leakage_risk"
  | "rejected";

export interface DateCell {
  /** date label */
  date: string;
  /** decided legs on this date */
  n: number;
  /** wins on this date */
  w: number;
  /** sum of de-vig probabilities on this date (= expected wins) */
  sumDevig: number;
}

export interface CandidateInput {
  n: number;
  w: number;
  /** sum of de-vig probabilities over the bucket (= expected wins) */
  sumDevig: number;
  /** sum of devig*(1-devig) over the bucket (Poisson-binomial variance) */
  varDevig: number;
  perDate: DateCell[];
  /** true if the segment is defined by edgePct or confidence (cannot launch) */
  edgeOrConfidenceDriven: boolean;
  /** true if leakage checks pass for this bucket */
  leakageClean: boolean;
}

export interface GateConfig {
  minBucketN: number;
  minOverallN: number;
  overallN: number;
  numTests: number;
  alpha: number;
  /** minimum fraction of dates where the bucket beats its de-vig baseline */
  minPositiveDateFrac: number;
  /** within-margin (in proportion) of de-vig => "market already prices it" */
  marginProp: number;
}

export const DEFAULT_GATES: Omit<GateConfig, "overallN" | "numTests"> = {
  minBucketN: 40,
  minOverallN: 250,
  alpha: 0.05,
  minPositiveDateFrac: 0.7,
  marginProp: 0.03,
};

export interface CandidateResult {
  verdict: CandidateVerdict;
  n: number;
  w: number;
  rate: number;
  meanDevig: number;
  edge: number;
  naiveCI: CI;
  correctedCI: CI;
  correctedZ: number;
  pRaw: number;
  pAdj: number;
  beatsNaive: boolean;
  beatsCorrected: boolean;
  positiveDates: number;
  totalDates: number;
  stable: boolean;
  singleDateDependent: boolean;
  /** which launch gates failed (empty iff launch_candidate) */
  failedGates: string[];
}

/** Leave-one-out: does removing the single best-delta date kill even the naive
 *  (95%) edge over de-vig? If so the bucket is single-date dependent. */
function isSingleDateDependent(input: CandidateInput): boolean {
  const { perDate } = input;
  if (perDate.length < 2) return true; // can't establish stability from <2 dates
  // find the date with the largest positive delta (w/n - devig/n)
  let bestIdx = -1;
  let bestDelta = -Infinity;
  perDate.forEach((d, i) => {
    if (d.n <= 0) return;
    const delta = d.w / d.n - d.sumDevig / d.n;
    if (delta > bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  });
  if (bestIdx < 0) return true;
  let n = 0;
  let w = 0;
  let sumDevig = 0;
  perDate.forEach((d, i) => {
    if (i === bestIdx) return;
    n += d.n;
    w += d.w;
    sumDevig += d.sumDevig;
  });
  if (n <= 0) return true;
  const meanDevig = sumDevig / n;
  const ci = wilson(w, n, Z_95);
  return !(ci.lo > meanDevig); // if removing the best date breaks naive edge -> dependent
}

/**
 * Classify a searched segment. `launch_candidate` requires ALL hard gates:
 *  bucket N, overall N, beats de-vig, naive CI lower > de-vig, multiple-
 *  comparisons-corrected CI lower > de-vig, adjusted p < alpha, date-split
 *  stable, no single-date overdependence, not edge/confidence-driven, leakage
 *  clean. Anything that clears only the naive CI is `shadow_watchlist`.
 */
export function classifyCandidate(
  input: CandidateInput,
  cfg: GateConfig,
): CandidateResult {
  const { n, w, sumDevig, varDevig, perDate } = input;
  const rate = n > 0 ? w / n : 0;
  const meanDevig = n > 0 ? sumDevig / n : 0;
  const edge = rate - meanDevig;
  const naiveCI = wilson(w, n, Z_95);
  const zc = correctedZ(cfg.numTests, cfg.alpha);
  const correctedCI = wilson(w, n, zc);
  const pRaw = poissonBinomialPValue(w, sumDevig, varDevig);
  const pAdj = Math.min(1, pRaw * Math.max(1, cfg.numTests));
  const beatsNaive = n > 0 && naiveCI.lo > meanDevig;
  const beatsCorrected = n > 0 && correctedCI.lo > meanDevig;
  const positiveDates = perDate.filter(
    (d) => d.n > 0 && d.w / d.n > d.sumDevig / d.n,
  ).length;
  const totalDates = perDate.length;
  const stable =
    totalDates >= 3 && positiveDates / totalDates >= cfg.minPositiveDateFrac;
  const singleDateDependent = isSingleDateDependent(input);

  const base: Omit<CandidateResult, "verdict" | "failedGates"> = {
    n,
    w,
    rate,
    meanDevig,
    edge,
    naiveCI,
    correctedCI,
    correctedZ: zc,
    pRaw,
    pAdj,
    beatsNaive,
    beatsCorrected,
    positiveDates,
    totalDates,
    stable,
    singleDateDependent,
  };

  // hard blocks first
  if (n < cfg.minBucketN) {
    return { ...base, verdict: "blocked_sample_size", failedGates: ["bucket_n"] };
  }
  if (!input.leakageClean) {
    return { ...base, verdict: "blocked_leakage_risk", failedGates: ["leakage"] };
  }

  if (!beatsNaive) {
    if (Math.abs(edge) <= cfg.marginProp) {
      return { ...base, verdict: "market_already_prices_it", failedGates: ["beats_naive_ci"] };
    }
    return {
      ...base,
      verdict: edge < 0 ? "rejected" : "needs_more_data",
      failedGates: ["beats_naive_ci"],
    };
  }

  // beats the naive 95% CI — now apply the full launch gate set
  const failedGates: string[] = [];
  if (cfg.overallN < cfg.minOverallN) failedGates.push("overall_n");
  if (!beatsCorrected) failedGates.push("corrected_ci");
  if (pAdj >= cfg.alpha) failedGates.push("adjusted_p");
  if (!stable) failedGates.push("date_stability");
  if (singleDateDependent) failedGates.push("single_date_overdependence");
  if (input.edgeOrConfidenceDriven) failedGates.push("edge_or_confidence_driven");

  if (failedGates.length === 0) {
    return { ...base, verdict: "launch_candidate", failedGates };
  }
  // beats naive but not the full gate set -> promising but unconfirmed
  return { ...base, verdict: "shadow_watchlist", failedGates };
}
