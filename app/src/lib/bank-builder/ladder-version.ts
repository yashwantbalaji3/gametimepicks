/**
 * Bank Builder ladder VERSION — the single control point for the 5-step → 7-step migration (Plan 0007).
 *
 * ⚠️ This is SCAFFOLDING. Today the value is `"v1"` and the LIVE ladder is the implemented 5-step
 * `$100 → $10,000` climb (`BANK_BUILDER_LADDER`, settlement-implemented). The 7-step profit-locking
 * ladder (`bankBuilderV2StepPolicy`) is a PREVIEW ONLY — it has NO settlement/accounting/generation
 * support yet, so this constant must NOT be flipped to `"v2"`.
 *
 * The flip to `"v2"` is the FINAL, owner-gated step of Plan 0007, and only after every prerequisite is
 * green: the settlement engine grades 7-step cards, accounting handles the dynamic per-step stake + the
 * lock/roll-forward money events, generation shapes the per-step card, a shadow-ledger reconciles a full
 * lane cycle to the penny, and both lanes are at a safe cutover boundary. Until then, keeping this at
 * `"v1"` guarantees the product tells ONE truth (5-step live) with no half-migrated state.
 *
 * Surfaces should read the live step count from `bankBuilderLiveStepCount()` (not a hardcoded 5 or 7) so
 * the eventual flip is a one-line change here, not a copy hunt across pages.
 */
import { BANK_BUILDER_STEP_COUNT } from "../bank-builder-ladder";

export type BankBuilderLadderVersion = "v1" | "v2";

/** The version the LIVE product settles + renders. MUST stay "v1" until Plan 0007 is fully implemented. */
export const BANK_BUILDER_LADDER_VERSION: BankBuilderLadderVersion = "v1";

/** Step count of the 7-step preview ladder (display/preview only — NOT settlement-backed at v1). */
export const BANK_BUILDER_V2_STEP_COUNT = 7;

/** The step count of the LIVE ladder, derived from the version. v1 → the implemented 5-step ladder. */
export function bankBuilderLiveStepCount(version: BankBuilderLadderVersion = BANK_BUILDER_LADDER_VERSION): number {
  return version === "v2" ? BANK_BUILDER_V2_STEP_COUNT : BANK_BUILDER_STEP_COUNT;
}

/** True only when the 7-step ladder is the LIVE, settlement-backed product. False today (v1). Surfaces use
 *  this to decide whether the 7-step is "live" vs a labelled "preview" — never a hardcoded assumption. */
export function isSevenStepLive(version: BankBuilderLadderVersion = BANK_BUILDER_LADDER_VERSION): boolean {
  return version === "v2";
}
