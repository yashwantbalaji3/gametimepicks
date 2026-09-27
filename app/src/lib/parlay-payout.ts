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

/**
 * ── THE CANONICAL PAYOUT CONVENTION (§13) ──────────────────────────────────────────────────────
 *
 * ONE rule, and it is a precision rule: **full decimal precision is carried all the way to the
 * display, and rounding happens once, on the currency figure the reader sees.**
 *
 * The bug this convention exists to kill, reproduced exactly:
 *
 *   +133 and -130, $100 stake
 *     leg decimals      2.33  ×  1.769230769…      =  4.122307692…
 *     true return       $412.2308  → displayed     →  $412.23   ✅
 *     combined American round(3.1223 × 100)        =  +312
 *     round-trip        americanToDecimal(+312)    =  4.12
 *     displayed return  $412.00                                 ❌  $0.23 lost
 *
 * The loss is not in the multiplication — it is in **round-tripping through American odds**.
 * American format cannot represent 4.1223; it quantises to +312. So a combined American price is a
 * DISPLAY artifact and must never be the input to a payout.
 *
 * THE ONE EXCEPTION, AND IT IS NOT A ROUNDING (§13 asks for this to be documented, not hidden):
 * where a producer publishes ONLY a combined American price and no per-leg prices, that price is
 * not a rounding of anything we hold — it IS the source. `americanToDecimal` of it loses nothing,
 * because there is no more precise number in existence on our side. `combinedDecimalFromLegs`
 * returns null in that case so the caller must decide explicitly rather than silently multiplying
 * an incomplete set of legs.
 */

/** Default stake shown in the slip-card footer on first paint. */
export const DEFAULT_STAKE = 10;

/** Allowed stake bounds. Stake must be a positive finite number; the
 *  upper bound stops a runaway input from rendering as a billion-dollar
 *  payout that misleads the user. */
export const MIN_STAKE = 1;
export const MAX_STAKE = 10_000;

/**
 * The ONE payout computation. Everything that shows a return goes through here.
 *
 * @param combinedDecimal  full-precision decimal multiplier — NEVER `americanToDecimal(combined)`
 * @param stake            a validated stake
 */
export function payoutFromDecimal(combinedDecimal: number, stake: number): PayoutForStake | null {
  if (!Number.isFinite(combinedDecimal) || combinedDecimal <= 0) return null;
  if (!Number.isFinite(stake) || stake <= 0) return null;
  /* Rounded ONCE, here, on the figure a reader sees. Nothing upstream rounds. */
  const totalReturn = combinedDecimal * stake;
  return { totalReturn: roundTo2(totalReturn), profit: roundTo2(totalReturn - stake) };
}

/**
 * Full-precision combined multiplier from per-leg American prices.
 *
 * Returns null when any leg's price is missing — the same fail-closed rule as
 * `combinedParlayPayoutPer100`, because a partial product is a smaller, wrong number rather than a
 * missing one, and it would render as a confident payout.
 */
export function combinedDecimalFromLegs(legs: Array<{ oddsForSide: number | null | undefined }>): number | null {
  const payout = combinedParlayPayoutPer100(legs);
  return payout ? payout.decimal : null;
}

/** ── STAKE VALIDATION (§13) ─────────────────────────────────────────────────────────────────── */

export const STAKE_STATE = {
  /** Nothing typed yet. Not an error; show no payout. */
  EMPTY: "EMPTY",
  OK: "OK",
  /** ⚠ These four used to collapse into "payout $0.00 with no explanation". */
  NEGATIVE: "NEGATIVE",
  ZERO: "ZERO",
  NOT_A_NUMBER: "NOT_A_NUMBER",
  /** Accepted, but not at the number typed — so the reader is told, never silently overridden. */
  RAISED_TO_MIN: "RAISED_TO_MIN",
  LOWERED_TO_MAX: "LOWERED_TO_MAX",
} as const;

export type StakeState = (typeof STAKE_STATE)[keyof typeof STAKE_STATE];

export interface StakeValidation {
  state: StakeState;
  /** The stake to compute with, or null when there is nothing valid to compute. */
  stake: number | null;
  /** Reader-facing explanation. Null only when there is nothing to explain (EMPTY / OK). */
  message: string | null;
}

/**
 * Validate a free-text stake and SAY what happened.
 *
 * ⚠ A NEGATIVE STAKE MUST NOT RENDER A PAYOUT (§13). It previously sanitized to null, became 0
 * through a `?? 0`, and displayed "To return $0.00 · Profit +$0.00" — a confident, wrong answer to
 * an invalid question, with no indication the input was rejected. A clamp is equally a problem when
 * it is silent: typing 0.50 became $1.00 and the reader was never told which number was used.
 */
export function validateStake(input: string | number | null | undefined): StakeValidation {
  if (input == null || (typeof input === "string" && input.trim() === "")) {
    return { state: STAKE_STATE.EMPTY, stake: null, message: null };
  }
  const n = typeof input === "number" ? input : Number(String(input).trim());
  if (!Number.isFinite(n)) {
    return { state: STAKE_STATE.NOT_A_NUMBER, stake: null, message: "Enter a number." };
  }
  if (n < 0) {
    return { state: STAKE_STATE.NEGATIVE, stake: null, message: "A stake cannot be negative." };
  }
  if (n === 0) {
    return { state: STAKE_STATE.ZERO, stake: null, message: "Enter a stake above $0." };
  }
  if (n < MIN_STAKE) {
    return { state: STAKE_STATE.RAISED_TO_MIN, stake: MIN_STAKE, message: `Minimum stake is $${MIN_STAKE} — showing the return on $${MIN_STAKE}.` };
  }
  if (n > MAX_STAKE) {
    return { state: STAKE_STATE.LOWERED_TO_MAX, stake: MAX_STAKE, message: `Maximum stake is $${MAX_STAKE.toLocaleString("en-US")} — showing the return on $${MAX_STAKE.toLocaleString("en-US")}.` };
  }
  return { state: STAKE_STATE.OK, stake: n, message: null };
}

export function projectedPayoutForStake(
  legs: Array<{ oddsForSide: number | null | undefined }>,
  stake: number,
): PayoutForStake | null {
  if (!Number.isFinite(stake) || stake <= 0) return null;
  const payout = combinedParlayPayoutPer100(legs);
  if (!payout) return null;
  /* Delegates, so there is exactly one place the arithmetic and the rounding live. */
  return payoutFromDecimal(payout.decimal, stake);
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
