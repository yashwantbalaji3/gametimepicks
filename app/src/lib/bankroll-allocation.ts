/**
 * Bankroll allocation — pure planning helper for the Parlay Lab
 * "Bankroll Plan" mode (PR `feature/parlay-lab-mode-tabs-bankroll`).
 *
 * What this does (and what it doesn't):
 *   - Distributes a user-entered bankroll across model-suggested slips
 *     using per-lane weight ratios that lean toward lower-variance
 *     lanes by default.
 *   - Returns honest math: total allocated never exceeds bankroll, no
 *     stake is ever negative, and reserve (= bankroll − total) is
 *     always ≥ 0.
 *   - Uses existing odds math (`projectedPayoutForStake`) for the
 *     per-slip projected payout. Returns null payouts when a leg's
 *     odds are missing — we never fabricate a dollar figure.
 *
 * This is NOT financial advice and is NOT a guarantee of any
 * particular outcome. It's a planning aid that respects the user's
 * stated bankroll and risk preference.
 */
import type { ParlayRiskProfile, ParlaySlip } from "./parlay-suggested";
import {
  projectedPayoutForStake,
  type PayoutForStake,
} from "./parlay-payout";

export type RiskPreference = "lower-variance" | "balanced" | "growth";

export interface BankrollAllocationInput {
  /** Total user bankroll in USD. Must be > 0 and finite to allocate. */
  bankroll: number;
  /** Slip pool — the same shape the optimizer surface uses. */
  slips: ReadonlyArray<ParlaySlip>;
  /** Risk preference. Drives the per-lane weight curve. */
  riskPreference: RiskPreference;
  /** Whether to consider Swing (aggressive) slips. Default false. */
  includeSwing: boolean;
  /** Cap on the number of slips the allocation can recommend. Must be
   *  ≥ 1 to allocate anything. */
  maxSlips: number;
  /** Optional minimum per-slip stake floor (defaults to $1). */
  minPerSlip?: number;
}

export interface SlipAllocation {
  /** The original slip. */
  slip: ParlaySlip;
  /** Recommended stake in whole dollars. Always ≥ minPerSlip when the
   *  slip is included. */
  stake: number;
  /** Projected payout for that stake; null when any leg lacks odds. */
  payout: PayoutForStake | null;
}

export interface BankrollAllocationResult {
  /** Per-slip recommendations, in lane order
   *  (Anchor → Core → Spotlight → Swing). */
  allocations: SlipAllocation[];
  /** Sum of `allocations[*].stake` — never exceeds the input bankroll. */
  totalAllocated: number;
  /** bankroll − totalAllocated, never < 0. */
  reserve: number;
  /** Sum of payouts that are non-null; null payouts contribute 0 so
   *  the figure stays honest. */
  totalPotentialPayout: number;
  /** True when the helper had to drop slips due to maxSlips cap. */
  capHit: boolean;
}

/** Per-lane base weights (sum to 1.0 when Swing is excluded; renormalised
 *  when Swing is included). These are presentation defaults — the helper
 *  is exposed so callers can preview alternative weights without touching
 *  this file. */
export const DEFAULT_LANE_WEIGHTS: Record<ParlayRiskProfile, number> = {
  conservative: 0.35,
  balanced: 0.30,
  star_power: 0.20,
  aggressive: 0.15,
};

/** Risk-preference modifiers applied multiplicatively to the base
 *  weights before renormalisation. */
const RISK_MULTIPLIERS: Record<RiskPreference, Record<ParlayRiskProfile, number>> = {
  "lower-variance": {
    conservative: 1.30,
    balanced: 1.10,
    star_power: 0.80,
    aggressive: 0.50,
  },
  balanced: {
    conservative: 1.00,
    balanced: 1.00,
    star_power: 1.00,
    aggressive: 1.00,
  },
  growth: {
    conservative: 0.80,
    balanced: 0.95,
    star_power: 1.20,
    aggressive: 1.40,
  },
};

/** Default minimum-per-slip stake (USD). Single source of truth so
 *  the UI control can read the same floor. */
export const DEFAULT_MIN_PER_SLIP = 1;

const LANE_ORDER: ParlayRiskProfile[] = [
  "conservative",
  "balanced",
  "star_power",
  "aggressive",
];

/** Allocate a bankroll across a pool of suggested slips. Pure — no
 *  fetches, no fabrication. */
export function allocateBankroll(
  input: BankrollAllocationInput,
): BankrollAllocationResult {
  const minPerSlip = Math.max(input.minPerSlip ?? DEFAULT_MIN_PER_SLIP, 1);
  const empty: BankrollAllocationResult = {
    allocations: [],
    totalAllocated: 0,
    reserve: 0,
    totalPotentialPayout: 0,
    capHit: false,
  };

  if (!Number.isFinite(input.bankroll) || input.bankroll <= 0) return empty;
  if (!Number.isFinite(input.maxSlips) || input.maxSlips < 1) {
    return { ...empty, reserve: roundTo2(input.bankroll) };
  }
  if (!input.slips || input.slips.length === 0) {
    return { ...empty, reserve: roundTo2(input.bankroll) };
  }

  // ---- 1. Filter pool by includeSwing -----------------------------
  const eligibleSlips = input.includeSwing
    ? input.slips
    : input.slips.filter((s) => s.riskProfile !== "aggressive");

  if (eligibleSlips.length === 0) {
    return { ...empty, reserve: roundTo2(input.bankroll) };
  }

  // ---- 2. Group by lane in canonical order ------------------------
  const byLane = new Map<ParlayRiskProfile, ParlaySlip[]>();
  for (const profile of LANE_ORDER) byLane.set(profile, []);
  for (const slip of eligibleSlips) {
    const list = byLane.get(slip.riskProfile);
    if (list) list.push(slip);
  }

  // ---- 3. Pick slips: round-robin across lanes up to maxSlips -----
  // Anchor first, then Core, then Spotlight, then Swing. This keeps
  // the "lower-variance lanes first" intent visible even when maxSlips
  // is small.
  const picked: ParlaySlip[] = [];
  const lanePicked = new Map<ParlayRiskProfile, ParlaySlip[]>();
  for (const profile of LANE_ORDER) lanePicked.set(profile, []);

  let roundIdx = 0;
  while (picked.length < input.maxSlips) {
    let addedThisRound = 0;
    for (const profile of LANE_ORDER) {
      const pool = byLane.get(profile) ?? [];
      if (roundIdx < pool.length && picked.length < input.maxSlips) {
        const slip = pool[roundIdx];
        picked.push(slip);
        lanePicked.get(profile)!.push(slip);
        addedThisRound++;
      }
    }
    if (addedThisRound === 0) break;
    roundIdx++;
  }

  if (picked.length === 0) {
    return { ...empty, reserve: roundTo2(input.bankroll) };
  }

  const capHit = picked.length < eligibleSlips.length;

  // ---- 4. Compute effective per-lane weights ----------------------
  const multipliers = RISK_MULTIPLIERS[input.riskPreference]
    ?? RISK_MULTIPLIERS.balanced;
  const effectiveLaneWeights: Partial<Record<ParlayRiskProfile, number>> = {};
  let weightSum = 0;
  for (const profile of LANE_ORDER) {
    const slipsInLane = lanePicked.get(profile)?.length ?? 0;
    if (slipsInLane === 0) continue;
    // Skip lanes with zero base weight after multiplier
    const w = DEFAULT_LANE_WEIGHTS[profile] * multipliers[profile];
    if (w <= 0) continue;
    effectiveLaneWeights[profile] = w;
    weightSum += w;
  }
  if (weightSum <= 0) {
    return { ...empty, reserve: roundTo2(input.bankroll) };
  }

  // ---- 5. Whole-dollar stake per slip, respecting floor + bankroll
  // Pass 1: compute the ideal stake per lane (split evenly across
  // slips in that lane), floor it to the minPerSlip, and floor each
  // stake to whole dollars so we don't render $7.33 figures.
  const rawAllocations: Array<{ slip: ParlaySlip; stake: number }> = [];
  for (const profile of LANE_ORDER) {
    const w = effectiveLaneWeights[profile];
    const slipsInLane = lanePicked.get(profile) ?? [];
    if (!w || slipsInLane.length === 0) continue;
    const laneBudget = (input.bankroll * w) / weightSum;
    const perSlip = laneBudget / slipsInLane.length;
    for (const slip of slipsInLane) {
      const stake = Math.max(Math.floor(perSlip), minPerSlip);
      rawAllocations.push({ slip, stake });
    }
  }

  // Pass 2: if rounding pushed us over the bankroll, trim the largest
  // stakes one whole dollar at a time. Never go below minPerSlip.
  let total = rawAllocations.reduce((s, a) => s + a.stake, 0);
  if (total > input.bankroll) {
    // Sort indices by stake desc so we trim from the top first.
    const order = rawAllocations
      .map((a, i) => ({ i, stake: a.stake }))
      .sort((a, b) => b.stake - a.stake);
    let cursor = 0;
    while (total > input.bankroll && cursor < order.length) {
      const idx = order[cursor].i;
      if (rawAllocations[idx].stake > minPerSlip) {
        rawAllocations[idx].stake -= 1;
        total -= 1;
        // Re-sort isn't strictly necessary — we keep trimming from the
        // same head in rough order, which converges quickly.
      } else {
        cursor++;
      }
    }
    // If we still exceed the bankroll (everyone at the floor), drop
    // slips from the tail (lowest-priority lanes) until we fit.
    while (total > input.bankroll && rawAllocations.length > 0) {
      const dropped = rawAllocations.pop()!;
      total -= dropped.stake;
    }
  }

  // Pass 3: if we have headroom AND the user-set maxSlips allows it,
  // give the leftover dollars back to the highest-weight lanes a
  // dollar at a time so the bankroll is well-utilized. We don't blow
  // past the bankroll — strict ≤.
  let remaining = input.bankroll - total;
  while (remaining >= 1 && rawAllocations.length > 0) {
    // Bump the first lane's first allocation (Anchor → Core → ...)
    let bumped = false;
    for (const profile of LANE_ORDER) {
      if (remaining < 1) break;
      // Find the first alloc in this lane
      const idx = rawAllocations.findIndex((a) => a.slip.riskProfile === profile);
      if (idx === -1) continue;
      rawAllocations[idx].stake += 1;
      remaining -= 1;
      bumped = true;
    }
    if (!bumped) break;
  }

  // ---- 6. Build final allocations + summary -----------------------
  const allocations: SlipAllocation[] = rawAllocations.map((a) => ({
    slip: a.slip,
    stake: a.stake,
    payout: projectedPayoutForStake(a.slip.legs, a.stake),
  }));
  const totalAllocated = allocations.reduce((s, a) => s + a.stake, 0);
  const totalPotentialPayout = allocations.reduce(
    (s, a) => s + (a.payout?.totalReturn ?? 0),
    0,
  );
  const reserve = Math.max(roundTo2(input.bankroll - totalAllocated), 0);

  return {
    allocations,
    totalAllocated,
    reserve,
    totalPotentialPayout: roundTo2(totalPotentialPayout),
    capHit,
  };
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
