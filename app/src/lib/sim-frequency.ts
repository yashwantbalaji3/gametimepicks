/**
 * "N / 10,000" — exact when the artifact persisted the count, APPROXIMATE (≈) when it is rebuilt from a
 * rounded probability (TRUTH-001, 2026-10-09; roadmap acceptance: "Exact numerators/denominators
 * persist or UI says approximately").
 *
 * The MLB full-game artifact stores win probability rounded to three decimals (0.531) but also the
 * exact run-differential COUNTS. Win counts read from those counts are exact (5,307 / 4,693 for
 * 2026-10-08 849832); `round(0.531 × 10,000)` = 5,310 is not, and was printed as if it were. Every
 * other probability (a final score, extra innings, a player pick) has no persisted count, so its
 * frequency carries "≈".
 */

export interface ExactWinCounts {
  readonly away: number;
  readonly home: number;
  readonly runCount: number;
}

interface CountedGame {
  readonly runCount?: number | null;
  readonly runDifferential?: { distribution?: ReadonlyArray<{ value: number; count: number }> | null } | null;
}

/**
 * Exact simulated win counts from the persisted run-differential (home − away) counts, or null when
 * the counts are absent, do not add up to runCount, or include ties (not a two-way outcome).
 */
export function exactWinCounts(g: CountedGame): ExactWinCounts | null {
  const bins = g.runDifferential?.distribution;
  const n = g.runCount;
  if (!bins?.length || typeof n !== "number" || n <= 0) return null;
  let home = 0;
  let away = 0;
  let total = 0;
  for (const b of bins) {
    if (!Number.isInteger(b.count) || b.count < 0) return null;
    total += b.count;
    if (b.value > 0) home += b.count;
    else if (b.value < 0) away += b.count;
    else if (b.count > 0) return null;
  }
  return total === n ? { away, home, runCount: n } : null;
}

const fmt = (x: number) => Math.round(x).toLocaleString("en-US");

/** "5,307 / 10,000 <unit>" from an exact count. */
export function exactFrequency(count: number, runCount: number, unit: string): string {
  return `${fmt(count)} / ${fmt(runCount)} ${unit}`;
}

/** "≈ 5,310 / 10,000 <unit>" from a probability with no persisted count. Null on bad input. */
export function approxFrequency(probability: number | null | undefined, runCount: number | null | undefined, unit: string): string | null {
  if (typeof probability !== "number" || !Number.isFinite(probability) || typeof runCount !== "number" || !Number.isFinite(runCount) || runCount <= 0) return null;
  return `≈ ${fmt(probability * runCount)} / ${fmt(runCount)} ${unit}`;
}
