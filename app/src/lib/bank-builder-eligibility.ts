/**
 * bank-builder-eligibility — pure, transparent diagnosis of the Bank Builder
 * candidate pool. Mirrors the hard filters in `selectPlus100BuilderSlip` so
 * the page can show the EXACT honest reason no card qualified — never "nothing
 * is good enough to win" (no performance framing), only factual eligibility.
 *
 * Bank Builder is paper-only and draws ONLY from the official (single-sport)
 * Suggested pool. It does not use edgePct/confidence.
 */
import { combinedParlayPayoutPer100 } from "./odds-math";
import type { ParlaySlip } from "./parlay-suggested";
import {
  BUILDER_PLUS100_IDEAL_BAND,
  BUILDER_PLUS100_FALLBACK_BAND,
  BUILDER_PLUS100_TARGET,
} from "./parlay-suggested";

function hasGradedLeg(slip: ParlaySlip): boolean {
  for (const l of slip.legs ?? []) {
    const r = l.result;
    if (r === "win" || r === "loss" || r === "push") return true;
  }
  return false;
}

export interface BuilderPoolDiagnosis {
  /** Total slips handed in (already official-filtered by the caller). */
  total: number;
  /** Pending + fully-unsettled (no graded leg). */
  pending: number;
  /** Pending slips that also produce a computable combined price. */
  priced: number;
  /** Priced slips that fall inside the fallback +100 band. */
  inBand: number;
  /** Ordered, specific, honest reasons the pool yields no Builder Slip.
   *  Empty when a card qualifies (`inBand > 0`). */
  reasons: string[];
}

/**
 * Diagnose why the Bank Builder pool does (not) yield a qualifying slip.
 * `slips` should already be the official, sport-filtered pool the page uses.
 */
export function diagnoseBuilderPool(
  slips: ReadonlyArray<ParlaySlip> | null | undefined,
): BuilderPoolDiagnosis {
  const all = slips ?? [];
  let pending = 0;
  let priced = 0;
  let inBand = 0;

  for (const slip of all) {
    if (slip.status !== "pending") continue;
    if (hasGradedLeg(slip)) continue;
    pending++;
    const combined = combinedParlayPayoutPer100(slip.legs ?? []);
    if (!combined) continue;
    priced++;
    const a = combined.american;
    if (a >= BUILDER_PLUS100_FALLBACK_BAND.lo && a <= BUILDER_PLUS100_FALLBACK_BAND.hi) {
      inBand++;
    }
  }

  const reasons: string[] = [];
  if (all.length === 0) {
    reasons.push("No published cards for this slate yet.");
  } else if (pending === 0) {
    reasons.push("All published cards have already started or settled.");
  } else if (priced === 0) {
    reasons.push("Published cards don't have a complete price yet.");
  } else if (inBand === 0) {
    reasons.push(
      `No published card is priced near ${formatTarget(BUILDER_PLUS100_TARGET)} ` +
        `(${formatTarget(BUILDER_PLUS100_FALLBACK_BAND.lo)} to ` +
        `${formatTarget(BUILDER_PLUS100_FALLBACK_BAND.hi)}) right now.`,
    );
  }

  return { total: all.length, pending, priced, inBand, reasons };
}

function formatTarget(american: number): string {
  return american >= 0 ? `+${american}` : `${american}`;
}
