/**
 * Build My Card — paper-bankroll allocator for the *selected* slips.
 *
 * Where `bankroll-allocation.ts` distributes a bankroll across the whole
 * model-ranked pool by risk lane, this allocator does something narrower
 * and more honest for the Build My Card flow: it splits a paper bankroll
 * **only across the slips the user hand-picked** (design doc §2.4 / §2.6).
 * It never reaches into the unselected pool.
 *
 * Two modes:
 *   - **even**       — bankroll split equally across the allocatable
 *     selected slips.
 *   - **confidence** — weighted by each slip's optimizer `score`,
 *     normalized over the allocatable set. Falls back to even weighting
 *     when scores are missing or all equal.
 *
 * Honesty rules (design doc §2.6 / §2.8):
 *   - Drop (with a visible reason) any selected slip that:
 *       • has graded mid-session (`status !== "pending"`) → "already
 *         settled" — never counted as a win/loss in this educational view;
 *       • has null combined odds (a leg is missing its price) → "no price
 *         available."
 *   - A `pending` slip IS allocatable — it's a pregame plan. We surface
 *     "pending" honestly elsewhere; we never imply it is locked in.
 *   - Whole-dollar stakes; `totalAllocated ≤ bankroll`; `reserve ≥ 0`.
 *     The fractional remainder of a non-integer bankroll falls into the
 *     reserve rather than being faked into a stake.
 *   - Payouts come only from `projectedPayoutForStake` — "—" (null) when
 *     odds aren't computable. We never invent a price or a payout.
 *
 * Pure: no fetches, no fabrication, no `node:fs`. Safe to import from a
 * "use client" component.
 */
import type { ParlaySlip } from "./parlay-suggested";
import {
  projectedPayoutForStake,
  type PayoutForStake,
} from "./parlay-payout";
import {
  classifyRiskSection,
  combinedAmericanOddsFromLegs,
  getRiskSectionDisplay,
  type RiskSectionKey,
} from "./parlay-risk-sections";

export type SelectedAllocationMode = "even" | "confidence";

/** Default paper bankroll offered in the tray on first paint. The input
 *  may start empty; this is the value the "use $100" affordance fills. */
export const DEFAULT_BANKROLL = 100;

export interface SelectedAllocationInput {
  /** Paper bankroll in USD. Must be a finite number > 0 to allocate. */
  bankroll: number;
  /** The user's selected slips, in selection order. */
  slips: ReadonlyArray<ParlaySlip>;
  /** Allocation strategy. Defaults to "even" at the call site. */
  mode: SelectedAllocationMode;
}

/** Why a selected slip could not be allocated. */
export type AllocationDropReason = "settled" | "no-price";

export interface SelectedSlipAllocation {
  slip: ParlaySlip;
  /** Whole-dollar paper stake. May be 0 when the bankroll can't cover a
   *  dollar for every allocatable slip (e.g. $3 across 5 slips). */
  stake: number;
  /** Projected payout for `stake`; null when odds aren't computable or
   *  the stake rounded to 0. */
  payout: PayoutForStake | null;
  /** Combined American odds for the slip, or null. */
  combinedAmerican: number | null;
  /** Risk section derived from combined odds (odds-only shim). */
  sectionKey: RiskSectionKey | null;
  /** Public label for the section ("Low Risk" …). Null when unknown. */
  sectionLabel: string | null;
}

export interface DroppedSelectedSlip {
  slip: ParlaySlip;
  reason: AllocationDropReason;
  /** Short, honest, user-facing reason. */
  reasonLabel: string;
}

export interface SelectedAllocationResult {
  mode: SelectedAllocationMode;
  /** Per-slip stakes, in selection order, for the allocatable slips. */
  allocations: SelectedSlipAllocation[];
  /** Selected slips excluded from the allocation, with reasons. */
  dropped: DroppedSelectedSlip[];
  /** Sum of stakes — always ≤ bankroll. */
  totalAllocated: number;
  /** bankroll − totalAllocated, never < 0. */
  reserve: number;
  /** Sum of non-null projected payouts (null payouts contribute 0). */
  totalPotentialPayout: number;
  /** Count of allocatable slips (post-drop). */
  allocatableCount: number;
  /** True when bankroll ≤ 0 / not a usable number — the UI shows the
   *  "Enter a paper bankroll above" prompt instead of an allocation. */
  bankrollUnset: boolean;
}

const DROP_REASON_LABEL: Record<AllocationDropReason, string> = {
  settled: "already settled",
  "no-price": "no price available",
};

/** Float comparison epsilon for "all scores equal" detection. */
const SCORE_EPSILON = 1e-9;

/**
 * Allocate a paper bankroll across the user's selected slips. Pure.
 */
export function allocateSelectedBankroll(
  input: SelectedAllocationInput,
): SelectedAllocationResult {
  const mode: SelectedAllocationMode = input.mode === "confidence" ? "confidence" : "even";
  const slips = input.slips ?? [];

  // ---- 1. Classify each selected slip: allocatable vs dropped -------
  // Settled takes precedence over no-price so the reason is the most
  // actionable one ("already settled" beats "no price available").
  const allocatableSlips: ParlaySlip[] = [];
  const dropped: DroppedSelectedSlip[] = [];
  const combinedBySlip = new Map<string, number | null>();
  for (const slip of slips) {
    if (slip.status !== "pending") {
      dropped.push({ slip, reason: "settled", reasonLabel: DROP_REASON_LABEL.settled });
      continue;
    }
    const combined = combinedAmericanOddsFromLegs(slip.legs);
    combinedBySlip.set(slip.slipId, combined);
    if (combined == null) {
      dropped.push({ slip, reason: "no-price", reasonLabel: DROP_REASON_LABEL["no-price"] });
      continue;
    }
    allocatableSlips.push(slip);
  }

  const baseEmpty = {
    mode,
    allocations: [] as SelectedSlipAllocation[],
    dropped,
    totalAllocated: 0,
    totalPotentialPayout: 0,
    allocatableCount: allocatableSlips.length,
  };

  // ---- 2. Bankroll guard --------------------------------------------
  if (!Number.isFinite(input.bankroll) || input.bankroll <= 0) {
    return { ...baseEmpty, reserve: 0, bankrollUnset: true };
  }

  // ---- 3. Nothing allocatable ---------------------------------------
  if (allocatableSlips.length === 0) {
    return { ...baseEmpty, reserve: roundTo2(input.bankroll), bankrollUnset: false };
  }

  // ---- 4. Weights ----------------------------------------------------
  const weights = resolveWeights(mode, allocatableSlips);

  // ---- 5. Whole-dollar split (largest-remainder) --------------------
  // Only whole dollars are staked; the fractional part of the bankroll
  // stays in the reserve so we never round a stake up past the bankroll.
  const budget = Math.floor(input.bankroll);
  const stakes = allocateWholeDollars(budget, weights);

  // ---- 6. Build rows + summary --------------------------------------
  const allocations: SelectedSlipAllocation[] = allocatableSlips.map((slip, i) => {
    const stake = stakes[i];
    const combinedAmerican = combinedBySlip.get(slip.slipId) ?? null;
    const sectionKey =
      combinedAmerican == null ? null : classifyRiskSection(combinedAmerican);
    return {
      slip,
      stake,
      payout: projectedPayoutForStake(slip.legs, stake),
      combinedAmerican,
      sectionKey,
      sectionLabel: sectionKey ? getRiskSectionDisplay(sectionKey).label : null,
    };
  });

  const totalAllocated = allocations.reduce((s, a) => s + a.stake, 0);
  const totalPotentialPayout = allocations.reduce(
    (s, a) => s + (a.payout?.totalReturn ?? 0),
    0,
  );
  const reserve = Math.max(roundTo2(input.bankroll - totalAllocated), 0);

  return {
    mode,
    allocations,
    dropped,
    totalAllocated,
    reserve,
    totalPotentialPayout: roundTo2(totalPotentialPayout),
    allocatableCount: allocatableSlips.length,
    bankrollUnset: false,
  };
}

/** Resolve per-slip weights for the chosen mode. Confidence mode reads
 *  `slip.score`; it falls back to even weighting when scores are missing,
 *  non-finite, or all equal. Negative scores clamp to 0. */
function resolveWeights(
  mode: SelectedAllocationMode,
  slips: ReadonlyArray<ParlaySlip>,
): number[] {
  const n = slips.length;
  if (mode !== "confidence") return new Array(n).fill(1);

  const scores = slips.map((s) => s.score);
  const allFinite = scores.every((v) => typeof v === "number" && Number.isFinite(v));
  if (!allFinite) return new Array(n).fill(1);

  const nums = scores as number[];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max - min < SCORE_EPSILON) return new Array(n).fill(1); // all equal

  const clamped = nums.map((v) => Math.max(v, 0));
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum <= 0) return new Array(n).fill(1);
  return clamped;
}

/**
 * Distribute `budget` whole dollars across `weights` using the
 * largest-remainder method. Deterministic: ties in the fractional
 * remainder break toward the earlier index (selection order). The result
 * always sums to exactly `budget` (when budget ≥ 0 and some weight > 0).
 */
export function allocateWholeDollars(budget: number, weights: number[]): number[] {
  const n = weights.length;
  const result = new Array(n).fill(0);
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (n === 0 || budget <= 0 || sumW <= 0) return result;

  const ideal = weights.map((w) => (budget * w) / sumW);
  let allocated = 0;
  for (let i = 0; i < n; i++) {
    result[i] = Math.floor(ideal[i]);
    allocated += result[i];
  }
  let leftover = budget - allocated; // < n by construction
  if (leftover <= 0) return result;

  const order = ideal
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; k < order.length && leftover > 0; k++) {
    result[order[k].i] += 1;
    leftover -= 1;
  }
  return result;
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
