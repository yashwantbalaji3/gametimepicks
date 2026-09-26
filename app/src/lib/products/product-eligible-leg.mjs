/**
 * ProductEligibleLeg V2 (§14) — ONE eligibility contract for Parlay Lab, Bank Builder and Moonshot.
 *
 * §14 opens with the sentence the audit earned: "A leg should not be eligible merely because a
 * sportsbook offers it." Today's pool is 371 legs, every one of them MLB, every one on a market
 * whose model lost to the market across 18,659 settled leans, and none of them carrying the model's
 * own probability. Each of those is a separate reason to refuse, and until now there was no single
 * place that asked.
 *
 * ── TWO ANSWERS, NOT ONE ───────────────────────────────────────────────────────────────────────
 *
 * §14 requires every selected leg to answer "why was this eligible?", so a refusal is not a boolean.
 * `eligibilityOf` returns EVERY reason a leg fails, not the first — a leg that is stale AND on a
 * demoted market AND missing a probability should not be fixed three times.
 *
 * And eligibility is asked TWICE, because products differ: a leg may be fine for a product that
 * ranks on projections and unusable for one that multiplies probabilities together. So
 * `probabilityRequired` is a parameter, and `NO_MODEL_PROBABILITY` is raised only where the product
 * actually needs one. Moonshot may take more variance (§17); it may not take worse data.
 *
 * ── WHAT THIS MODULE MAY NOT DO ────────────────────────────────────────────────────────────────
 *
 * It never invents a probability, never reads `marketImpliedProbability` as the model's, and never
 * selects. Selection is a product's business; this answers only whether a leg is allowed to be
 * considered, and says why not when it is not.
 */
import { PROBABILITY_BASIS, probabilityIsUsable } from "./recommendation-receipt.mjs";

export const ELIGIBLE_LEG_SCHEMA_VERSION = 1;

/** Every reason a leg may be refused. Closed, and each member is independently actionable. */
export const INELIGIBILITY = Object.freeze({
  IDENTITY_UNRESOLVED: "IDENTITY_UNRESOLVED",
  MARKET_NOT_PUBLISHED: "MARKET_NOT_PUBLISHED",
  MODEL_NOT_VALIDATED: "MODEL_NOT_VALIDATED",
  NO_MODEL_PROBABILITY: "NO_MODEL_PROBABILITY",
  NO_FROZEN_MARKET: "NO_FROZEN_MARKET",
  STALE: "STALE",
  UNAVAILABLE: "UNAVAILABLE",
  AVAILABILITY_UNKNOWN: "AVAILABILITY_UNKNOWN",
  ROLE_UNKNOWN: "ROLE_UNKNOWN",
  EVENT_STARTED: "EVENT_STARTED",
  NO_SETTLEMENT_PATH: "NO_SETTLEMENT_PATH",
});

/** Model states that may never reach a product, whatever else is true of the leg. */
const FORBIDDEN_MODEL_STATES = new Set(["STOP", "REJECTED", "PAUSED", "HOLDING", "UNEVALUATED", "ESTIMATE", "WITHHELD"]);

/** Correlation tags §15 needs to constrain a card. Descriptive only; nothing here computes a joint. */
export function correlationTagsFor(receipt) {
  const tags = [];
  if (receipt.sport) tags.push(`sport:${receipt.sport}`);
  if (receipt.eventId) tags.push(`event:${receipt.eventId}`);
  if (receipt.participantId) tags.push(`participant:${receipt.participantId}`);
  if (receipt.marketFamily) tags.push(`family:${receipt.marketFamily}`);
  return tags;
}

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

/**
 * Is this receipt allowed into a product's candidate pool, and if not, why not — all of the whys.
 *
 * @param {object} receipt                a RecommendationReceipt
 * @param {object} ctx
 * @param {boolean} ctx.probabilityRequired  does the consuming product multiply probabilities?
 * @param {boolean} ctx.settlementSupported  can this market actually be graded?
 * @param {string|null} ctx.modelState       the family's publication state
 * @param {number|null} ctx.freshnessMs      age of the frozen market
 * @param {number|null} ctx.maxFreshnessMs   the product's staleness bound
 * @param {number|null} ctx.eventStartsAtMs  kickoff / first pitch / bell
 * @param {number|null} ctx.nowMs
 * @param {boolean} ctx.roleRequired         does the product need a known current role?
 */
export function eligibilityOf(receipt, ctx = {}) {
  const {
    probabilityRequired = false, settlementSupported = true, modelState = null,
    freshnessMs = null, maxFreshnessMs = null, eventStartsAtMs = null, nowMs = null,
    roleRequired = false,
  } = ctx;
  const reasons = [];

  if (!receipt?.participantId) reasons.push(INELIGIBILITY.IDENTITY_UNRESOLVED);

  if (modelState && FORBIDDEN_MODEL_STATES.has(modelState)) reasons.push(INELIGIBILITY.MARKET_NOT_PUBLISHED);

  /* ⚠ A DEMOTED MODEL IS NOT A PROBABILITY PROBLEM ALONE — it is a validation problem, and it
     disqualifies the leg even from a product that never multiplies probabilities, because the
     projection and the demoted probability come from the same fitted model. */
  if (receipt?.probabilityBasis === PROBABILITY_BASIS.MODEL_DEMOTED) reasons.push(INELIGIBILITY.MODEL_NOT_VALIDATED);

  if (probabilityRequired && !probabilityIsUsable(receipt?.probabilityBasis)) {
    reasons.push(INELIGIBILITY.NO_MODEL_PROBABILITY);
  }

  /* A real frozen market means a book, a line AND a price. Two of the three is not a market. */
  if (!receipt?.sportsbook || num(receipt?.line) === null || num(receipt?.price) === null) {
    reasons.push(INELIGIBILITY.NO_FROZEN_MARKET);
  }

  if (maxFreshnessMs !== null && freshnessMs !== null && freshnessMs > maxFreshnessMs) {
    reasons.push(INELIGIBILITY.STALE);
  }

  /* ⚠ THE FAIL-CLOSED PAIR. `OUT` and `QUESTIONABLE` are refusals; `UNKNOWN` is its OWN refusal and
     not a quiet pass. A static artifact offering a leg for a player nobody has confirmed is the
     Phase 6 defect, and the repository has already shipped 40 started games once. */
  if (receipt?.availabilityState === "OUT" || receipt?.availabilityState === "QUESTIONABLE") {
    reasons.push(INELIGIBILITY.UNAVAILABLE);
  } else if (receipt?.availabilityState === "UNKNOWN") {
    reasons.push(INELIGIBILITY.AVAILABILITY_UNKNOWN);
  }

  if (roleRequired && (!receipt?.roleState || receipt.roleState === "UNKNOWN")) {
    reasons.push(INELIGIBILITY.ROLE_UNKNOWN);
  }

  /* ⚠ ONE fail-closed clock question, asked here so no product re-derives it. An unknown start time
     is NOT "has not started". */
  if (nowMs !== null && (eventStartsAtMs === null || nowMs >= eventStartsAtMs)) {
    reasons.push(INELIGIBILITY.EVENT_STARTED);
  }

  if (!settlementSupported) reasons.push(INELIGIBILITY.NO_SETTLEMENT_PATH);

  return {
    schemaVersion: ELIGIBLE_LEG_SCHEMA_VERSION,
    eligible: reasons.length === 0,
    reasons,
    correlationTags: correlationTagsFor(receipt ?? {}),
    /* §14: "Why was this eligible, and why was it selected over alternatives?" — the first half. */
    basis: {
      probabilityBasis: receipt?.probabilityBasis ?? PROBABILITY_BASIS.ABSENT,
      probabilityUsable: probabilityIsUsable(receipt?.probabilityBasis),
      modelState,
      availabilityState: receipt?.availabilityState ?? "UNKNOWN",
      roleState: receipt?.roleState ?? "UNKNOWN",
    },
  };
}

/** Partition a pool, keeping every refusal reason so a producer can report the shape of its losses. */
export function partitionPool(receipts, ctxFor) {
  const eligible = [];
  const refused = [];
  const counts = {};
  for (const r of receipts ?? []) {
    const e = eligibilityOf(r, typeof ctxFor === "function" ? ctxFor(r) : ctxFor);
    if (e.eligible) eligible.push({ receipt: r, eligibility: e });
    else {
      refused.push({ receipt: r, eligibility: e });
      for (const reason of e.reasons) counts[reason] = (counts[reason] ?? 0) + 1;
    }
  }
  return { eligible, refused, counts };
}
