/**
 * Signature-product current-state derivation (Program 134 — user-facing clarity).
 *
 * WHY THIS EXISTS
 * The repository already has a rich status vocabulary (`product-status.ts`, 16 states). What it
 * lacked was a single place that DERIVES which one is true from the authoritative artifacts.
 * Without that, a surface can only infer readiness from file existence — the exact mistake that
 * put a hardcoded "Simulation Ready" badge above "GENERATED PICKS 0" on 2026-08-03.
 *
 * Existence is never readiness. A state here must reconcile, in order:
 *   1. date        — is the artifact for the CURRENT slate date at all?
 *   2. freshness   — are its inputs the current slate's inputs?
 *   3. markets     — has the sportsbook posted anything to qualify against?
 *   4. candidates  — did generation actually produce candidates?
 *   5. qualification — did any candidate clear the product's bar?
 *   6. approval    — is an approval gate outstanding?
 * The first failing step decides the state, so a product can never claim a later readiness than
 * its earliest unmet precondition.
 *
 * Returned states are the repository's existing `ProductStatus` keys, not a parallel vocabulary.
 */

/** Repository status keys used by this derivation (subset of product-status.ts). */
export const SIGNATURE_STATES = Object.freeze({
  ACTIVE: "active",
  AWAITING_QUALIFIED_CARD: "no_qualified_play",
  AWAITING_APPROVAL: "proposed",
  AWAITING_MARKETS: "market_pending",
  ARCHIVED: "retired",
  STALE: "stale",
});

/**
 * @param {object} p
 * @param {string}  p.slateDate        the current ET slate date
 * @param {string|null} p.artifactDate the date the product's artifact is for
 * @param {boolean} p.archived         product is retired by policy
 * @param {boolean} p.marketsPosted    sportsbook markets exist for the slate
 * @param {number}  p.candidates       candidates generated
 * @param {number}  p.qualified        candidates clearing the product bar
 * @param {boolean} p.approved         approval granted where an approval gate exists
 * @param {boolean} [p.requiresApproval=true]
 * @returns {{state:string, reason:string, actionable:string}}
 */
export function deriveSignatureState({
  slateDate,
  artifactDate,
  archived = false,
  marketsPosted = false,
  candidates = 0,
  qualified = 0,
  approved = false,
  requiresApproval = true,
}) {
  // An archived product must never look live, regardless of what artifacts linger on disk.
  if (archived) {
    return {
      state: SIGNATURE_STATES.ARCHIVED,
      reason: "product is retired by policy",
      actionable: "Archived — kept for the record, not updated.",
    };
  }

  // Existence is not currency: an artifact for another day is STALE, never ACTIVE.
  if (!artifactDate || artifactDate !== slateDate) {
    return {
      state: SIGNATURE_STATES.STALE,
      reason: `artifact date ${artifactDate ?? "none"} ≠ slate date ${slateDate}`,
      actionable: "Waiting for today's inputs — showing nothing rather than yesterday's card.",
    };
  }

  // Nothing downstream can qualify before the book posts a market to qualify against.
  if (!marketsPosted) {
    return {
      state: SIGNATURE_STATES.AWAITING_MARKETS,
      reason: "no sportsbook markets posted for this slate yet",
      actionable: "Waiting on the sportsbook to post markets for today's games.",
    };
  }

  if (candidates === 0 || qualified === 0) {
    return {
      state: SIGNATURE_STATES.AWAITING_QUALIFIED_CARD,
      reason: candidates === 0 ? "no candidates generated" : `0 of ${candidates} candidates cleared the bar`,
      actionable: "No play qualified today. Nothing is shown rather than lowering the bar.",
    };
  }

  if (requiresApproval && !approved) {
    return {
      state: SIGNATURE_STATES.AWAITING_APPROVAL,
      reason: `${qualified} qualified candidate(s) pending approval`,
      actionable: "A qualified card is waiting on approval before it appears.",
    };
  }

  return {
    state: SIGNATURE_STATES.ACTIVE,
    reason: `${qualified} qualified candidate(s), approved`,
    actionable: "Live for today's slate.",
  };
}
