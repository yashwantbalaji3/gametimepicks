/**
 * American-odds combinatorics for parlay slips. Pure math — no fetches,
 * no fabricated odds. The caller supplies the per-leg American odds
 * stored on the snapshot (`oddsForSide`); we multiply decimal-form
 * equivalents to produce the combined payout.
 *
 * Returns null when ANY leg has missing odds — we never invent a
 * decimal price.
 */

/** Convert American odds (e.g. -110, +145) to decimal form (1.91, 2.45). */
export function americanToDecimal(odds: number): number {
  if (odds === 0) return 1;
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

/** Convert decimal odds back to American format. */
export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) return 0;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return -Math.round(100 / (decimal - 1));
}

/**
 * Combined parlay payout per $100 stake. Returns null if any leg's
 * oddsForSide is null or non-numeric — surfaces in the UI as a "—" so
 * users never see a fabricated payout.
 */
export function combinedParlayPayoutPer100(
  legs: Array<{ oddsForSide: number | null | undefined }>,
): { american: number; decimal: number; profitPer100: number } | null {
  if (legs.length === 0) return null;
  let decimal = 1;
  for (const leg of legs) {
    const o = leg.oddsForSide;
    if (typeof o !== "number" || !Number.isFinite(o) || o === 0) return null;
    decimal *= americanToDecimal(o);
  }
  return {
    american: decimalToAmerican(decimal),
    decimal,
    profitPer100: (decimal - 1) * 100,
  };
}

/**
 * Format American odds for display: leading + for positive odds.
 * "—" for null / 0.
 */
export function formatAmerican(odds: number | null | undefined): string {
  if (typeof odds !== "number" || odds === 0 || !Number.isFinite(odds)) {
    return "—";
  }
  return odds > 0 ? `+${odds}` : `${odds}`;
}
