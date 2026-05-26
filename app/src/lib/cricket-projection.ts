/**
 * Cricket projection helpers — pure, deterministic, no fabrication.
 *
 * Mirrors the math in `pipeline/cricket/fetch_ipl_board.py` so unit
 * tests can lock both sides against the same expected values.
 *
 * Honest framing:
 *   - We compute implied probability from American odds.
 *   - We remove vig on two-way markets by normalizing to 1.0.
 *   - We do NOT model pitch / weather / toss / playing XI.
 *   - Edge is always 0 for these market-based projections.
 */

export function americanToDecimal(odds: number | null | undefined): number | null {
  if (odds == null) return null;
  if (odds >= 100) return 1 + odds / 100;
  if (odds <= -100) return 1 + 100 / Math.abs(odds);
  // Between -99 and +99 is ambiguous in American notation; treat as
  // exactly even-money to avoid NaN downstream.
  return 2;
}

export function impliedProb(odds: number | null | undefined): number | null {
  const dec = americanToDecimal(odds);
  if (dec == null || dec <= 0) return null;
  return 1 / dec;
}

/** Normalize two implied probabilities so they sum to 1. */
export function removeVigTwoWay(
  pA: number,
  pB: number,
): { a: number; b: number } {
  const s = pA + pB;
  if (s <= 0) return { a: 0.5, b: 0.5 };
  return { a: pA / s, b: pB / s };
}

/** Format an implied probability as a percent string with 1 decimal. */
export function formatProbPct(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return "—";
  return `${(p * 100).toFixed(1)}%`;
}

/** Format an American odds value with a leading + when positive. */
export function formatAmericanOdds(odds: number | null | undefined): string {
  if (odds == null) return "—";
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/** Format a totals line: 165.5 → "165.5", 167 → "167". */
export function formatTotalLine(line: number | null | undefined): string {
  if (line == null || !isFinite(line)) return "—";
  return Number.isInteger(line) ? String(line) : line.toFixed(1);
}
