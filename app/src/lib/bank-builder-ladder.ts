/**
 * Bank Builder ladder — the static $100 → $3,000 educational paper
 * bankroll ladder (design doc §3.2) plus pure helpers for resolving the
 * active step and the combined-decimal target each step's Builder Slip
 * must clear.
 *
 * Bank Builder is an *educational paper-trading* demonstration: a
 * presentation + filter over the slips that already exist in the
 * published optimizer snapshot. It is NOT a new model, NOT a tip
 * service, and NOT a promise of profit. There is no real money.
 *
 * The ladder climbs five rungs, each doubling (the final rung needs a
 * 1.875× lift to reach the $3,000 crown). The "multiplier" is the
 * target combined DECIMAL odds the step's Builder Slip must clear —
 * a slip qualifies for a step when its combined decimal odds ≥ the
 * step's multiplier.
 *
 * Pure: no fetches, no fabrication, no `node:fs`. Importable from a
 * server component or a "use client" component.
 */
import { decimalToAmerican } from "./odds-math";

export interface LadderStep {
  /** 1-indexed rung number. Step 1 is the $100 base. */
  step: number;
  /** Paper bankroll at the start of the rung (USD). */
  start: number;
  /** Paper bankroll the rung climbs toward (USD). */
  goal: number;
  /**
   * Target combined DECIMAL odds the rung's Builder Slip must clear:
   * `goal / start`. A slip qualifies when its combined decimal odds are
   * ≥ this value.
   */
  multiplier: number;
}

/** Paper bankroll the ladder starts at — and resets to after a loss. */
export const BANK_BUILDER_BASE = 100;

/** Crown of the ladder — the educational target, never a guarantee. */
export const BANK_BUILDER_GOAL = 10000;

/**
 * The five ladder rungs, base → crown. Migrated 2026-06-11 to the public
 * $100 → $10,000 ladder (see docs/operations/bank-builder-100-to-10000-policy-
 * migration-2026-06-11.md). Frozen so no caller can mutate the shared
 * definition. Each `multiplier` equals `goal / start` (verified in tests).
 */
export const BANK_BUILDER_LADDER: ReadonlyArray<LadderStep> = Object.freeze([
  Object.freeze({ step: 1, start: 100, goal: 200, multiplier: 200 / 100 }),
  Object.freeze({ step: 2, start: 200, goal: 700, multiplier: 700 / 200 }),
  Object.freeze({ step: 3, start: 700, goal: 1400, multiplier: 1400 / 700 }),
  Object.freeze({ step: 4, start: 1400, goal: 3500, multiplier: 3500 / 1400 }),
  Object.freeze({ step: 5, start: 3500, goal: 10000, multiplier: 10000 / 3500 }),
]) as ReadonlyArray<LadderStep>;

/** Number of rungs in the ladder. */
export const BANK_BUILDER_STEP_COUNT = BANK_BUILDER_LADDER.length;

/**
 * Resolve which rung a paper bankroll currently sits on.
 *
 * - A bankroll below the base clamps to Step 1 (the climb starts at
 *   $100; we never show a sub-base rung).
 * - A bankroll at or above the crown ($3,000) means the ladder is
 *   complete — returns `null` so the caller can render the "reached the
 *   crown" state rather than inventing a sixth rung.
 *
 * Otherwise returns the rung whose `[start, goal)` window contains the
 * bankroll.
 */
export function resolveLadderStep(bankroll: number): LadderStep | null {
  if (!Number.isFinite(bankroll)) return BANK_BUILDER_LADDER[0];
  if (bankroll < BANK_BUILDER_BASE) return BANK_BUILDER_LADDER[0];
  if (bankroll >= BANK_BUILDER_GOAL) return null; // ladder complete
  for (const rung of BANK_BUILDER_LADDER) {
    if (bankroll >= rung.start && bankroll < rung.goal) return rung;
  }
  // Defensive: bankroll inside [base, goal) but no rung matched (cannot
  // happen with the current contiguous ladder). Fall back to Step 1.
  return BANK_BUILDER_LADDER[0];
}

/**
 * The combined-decimal target a rung's Builder Slip must clear, expressed
 * as approximate American odds for display (e.g. +100 for a 2.000×
 * target). Pure passthrough to `decimalToAmerican`.
 */
export function ladderTargetAmerican(step: LadderStep): number {
  return decimalToAmerican(step.multiplier);
}

/**
 * Human label for a rung's multiplier, e.g. "2.000×" / "1.875×". Three
 * decimal places so the final rung's 1.875× reads honestly rather than
 * rounding to 1.88×.
 */
export function ladderMultiplierLabel(step: LadderStep): string {
  return `${step.multiplier.toFixed(3)}×`;
}

/**
 * Format a whole-dollar ladder amount with thousands separators and no
 * cents: 100 → "$100", 1600 → "$1,600", 3000 → "$3,000".
 */
export function formatLadderUsd(amount: number): string {
  const rounded = Math.round(amount);
  return `$${rounded.toLocaleString("en-US")}`;
}

/** Cents-precise USD — shows ".00"-trimmed cents (e.g. "$728.76", "$2,000").
 *  Used for the public ladder values where exact paper amounts matter. */
export function formatLadderUsdPrecise(amount: number): string {
  const isWhole = Math.abs(amount - Math.round(amount)) < 0.005;
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: isWhole ? 0 : 2,
  })}`;
}
