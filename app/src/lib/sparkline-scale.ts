/**
 * Pure y-scale math for the recent-form mini sparkline.
 *
 * Given a series of stat values and an optional threshold (the prop
 * line), compute the y-coordinates for each point inside a fixed
 * viewBox so the SVG renderer is a thin shell over this math.
 *
 * Honesty:
 *   - We never extrapolate beyond the data. Empty input → empty bars.
 *   - We include the threshold in the scale domain so the line is
 *     always visible relative to the bars.
 *   - "Cleared" flag is just `value > threshold`; the caller decides
 *     what to do with it.
 */

export interface ScaledSparklinePoint {
  /** Original stat value (passthrough). */
  value: number;
  /** Whether this value cleared the threshold (`value > threshold`).
   *  null when no threshold is provided. */
  cleared: boolean | null;
  /** X position in viewBox coordinates [0, width]. */
  x: number;
  /** Y position of the top of the bar in viewBox coordinates [0, height]
   *  (SVG y grows downward, so smaller y = taller bar). */
  y: number;
  /** Bar height in viewBox coordinates. */
  barHeight: number;
}

export interface SparklineScale {
  points: ScaledSparklinePoint[];
  /** Y position of the threshold line in viewBox coordinates, or null
   *  when no threshold was provided. */
  thresholdY: number | null;
  /** Domain min and max actually used for the scale (after including
   *  the threshold). Useful for debugging or for placing a y-axis
   *  label if the caller wants one. */
  domain: { min: number; max: number };
}

export interface SparklineScaleOptions {
  /** Total inner width of the SVG viewBox (px equivalents). */
  width: number;
  /** Total inner height of the SVG viewBox. */
  height: number;
  /** Threshold (prop line) value. Null/undefined to skip. */
  threshold?: number | null;
  /** Padding inside the viewBox so the bars don't hit the edges. */
  padding?: number;
  /** Minimum bar height even when the value equals the domain min, so
   *  the bar is still visible. Defaults to 2. */
  minBarHeight?: number;
}

export function scaleSparklinePoints(
  values: ReadonlyArray<number>,
  options: SparklineScaleOptions,
): SparklineScale {
  const {
    width,
    height,
    threshold = null,
    padding = 2,
    minBarHeight = 2,
  } = options;
  if (!values.length) {
    return { points: [], thresholdY: null, domain: { min: 0, max: 0 } };
  }
  const finite = values.filter((v) => Number.isFinite(v));
  if (!finite.length) {
    return { points: [], thresholdY: null, domain: { min: 0, max: 0 } };
  }

  // Include the threshold in the domain so the line always renders
  // inside the chart. Also ensure a non-zero range so we never divide
  // by zero on a flat series.
  let min = Math.min(...finite, threshold ?? Number.POSITIVE_INFINITY);
  let max = Math.max(...finite, threshold ?? Number.NEGATIVE_INFINITY);
  if (min === Number.POSITIVE_INFINITY) min = Math.min(...finite);
  if (max === Number.NEGATIVE_INFINITY) max = Math.max(...finite);
  // Clamp to non-negative for stat values; baseline at 0 so even a
  // flat-zero series shows zero-height bars rather than the row.
  if (min > 0) min = 0;
  if (max === min) max = min + 1;

  const innerW = Math.max(width - padding * 2, 1);
  const innerH = Math.max(height - padding * 2, 1);
  const n = values.length;
  const step = n > 1 ? innerW / (n - 1) : 0;
  const range = max - min;

  const yForValue = (v: number): number => {
    const norm = (v - min) / range;
    // Map to viewBox: SVG y=0 is top. We want larger values higher up,
    // so use (1 - norm).
    return padding + (1 - norm) * innerH;
  };

  const points: ScaledSparklinePoint[] = values.map((v, i) => {
    const x = padding + (n === 1 ? innerW / 2 : i * step);
    const safeV = Number.isFinite(v) ? v : min;
    const y = yForValue(safeV);
    const barHeight = Math.max(height - padding - y, minBarHeight);
    return {
      value: safeV,
      cleared: threshold != null ? safeV > threshold : null,
      x,
      y,
      barHeight,
    };
  });

  const thresholdY = threshold != null ? yForValue(threshold) : null;
  return { points, thresholdY, domain: { min, max } };
}
