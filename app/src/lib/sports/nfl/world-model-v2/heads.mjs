/**
 * WORLD MODEL V2 — THE SCORE INPUTS, AS AN EXACT FINGERPRINT (NFL-005 freshness, 2026-10-09).
 *
 * The simulated scores are drawn from the forecast of record's own margin and total distribution. Since 2026-10-09 the
 * forecast publishes that distribution's exact inputs (`forecastSummary.distribution`: margin mean and sigma, total mean
 * and sigma, deterministic per game), so World Model V2 uses them directly. An unchanged game therefore has
 * byte-identical score inputs on every regeneration, and any real change (a new mean, a new spread) is a new input.
 * No threshold, no tolerance: the 80% range is no longer read, so its sampling noise cannot reach the key.
 *
 * A record without the field (written before it existed) falls back to the median and the 80% range — named as such
 * in the artifact (`headsSource: "RANGE"`). The event window regenerates the forecast before World Model V2 runs, so
 * the fallback only applies to old records.
 */
const SIGMA_80 = 2 * 1.2815515655446004;
const r4 = (x) => Number(Number(x).toFixed(4));

/** @returns {{heads: {mMean: number, mSigma: number, tMean: number, tSigma: number}, source: "DISTRIBUTION"|"RANGE"}} */
export function headsFromForecast(summary) {
  const d = summary?.distribution;
  if (d && [d.marginMean, d.marginSigma, d.totalMean, d.totalSigma].every(Number.isFinite)) {
    return { heads: { mMean: r4(d.marginMean), mSigma: r4(d.marginSigma), tMean: r4(d.totalMean), tSigma: r4(d.totalSigma) }, source: "DISTRIBUTION" };
  }
  return {
    heads: { mMean: r4(summary.margin.median), mSigma: r4((summary.margin.p90 - summary.margin.p10) / SIGMA_80), tMean: r4(summary.total.median), tSigma: r4((summary.total.p90 - summary.total.p10) / SIGMA_80) },
    source: "RANGE",
  };
}
