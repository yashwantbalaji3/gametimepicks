/**
 * Stake-based parlay payout math. Pure, no fetches, no fabrication.
 *
 * Builds on `combinedParlayPayoutPer100` from odds-math.ts but answers
 * the slip-card footer question: given a user-entered stake and a slip
 * whose combined decimal odds are known, what is the projected payout?
 *
 * Returns null when ANY leg has missing odds (same rule as
 * `combinedParlayPayoutPer100`) so the UI shows "—" rather than a
 * fabricated payout.
 *
 * "Payout" here is **total return** (stake + profit), to match how
 * users read a slip card. Profit alone is also exposed for callers
 * that want the delta only.
 */
import { combinedParlayPayoutPer100 } from "./odds-math";

export interface PayoutForStake {
  /** Total return = stake + profit, rounded to 2 decimals. */
  totalReturn: number;
  /** Profit (return − stake), rounded to 2 decimals. */
  profit: number;
}

/** Default stake shown in the slip-card footer on first paint. */
export const DEFAULT_STAKE = 10;

/** Allowed stake bounds. Stake must be a positive finite number; the
 *  upper bound stops a runaway input from rendering as a billion-dollar
 *  payout that misleads the user. */
export const MIN_STAKE = 1;
export const MAX_STAKE = 10_000;

export function projectedPayoutForStake(
  legs: Array<{ oddsForSide: number | null | undefined }>,
  stake: number,
): PayoutForStake | null {
  if (!Number.isFinite(stake) || stake <= 0) return null;
  const payout = combinedParlayPayoutPer100(legs);
  if (!payout) return null;
  const totalReturn = payout.decimal * stake;
  return {
    totalReturn: roundTo2(totalReturn),
    profit: roundTo2(totalReturn - stake),
  };
}

/** Sanitize a stake input read from a free-text field. Returns the
 *  clamped numeric value, or null when the input is unusable. */
export function sanitizeStake(input: string | number | null | undefined): number | null {
  if (input == null || input === "") return null;
  const n = typeof input === "number" ? input : Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < MIN_STAKE) return MIN_STAKE;
  if (n > MAX_STAKE) return MAX_STAKE;
  return n;
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
