/**
 * THE RECOMMENDATION RECEIPT (§13) — what the model said, frozen at the moment it said it.
 *
 * §13 makes this the PREREQUISITE for Parlay Lab V2, Bank Builder V2 and Moonshot V2, and the
 * audit says why in one line: of 371 optimizer legs published today, `projection` 371/371,
 * `edgePct` 371/371, **`probability` 0/371**. Every published Bank Builder and Moonshot probability
 * is a de-vigged market price. So §15's correlation framework has no marginals, §28's joint
 * calibration has nothing to bucket, and no audit can separate the selector's contribution from the
 * price it inherited.
 *
 * ⚠ AND THE PROBABILITY IS NOT MISSING UPSTREAM — IT IS DROPPED. The leg above carries
 * `leanId: "Nolan_Arenado-batter_hits_runs_rbis-1.5"`, and that lean on the MLB board carries
 * `modelProbOver` (523 of 569 rows do). This is the same shape as two other findings this week:
 * MLB's StatsAPI identity survives to the optimizer and is absent from published predictions, and
 * the NFL board's frozen DraftKings line never reached the tracked row. A projection step that
 * narrows a record is where this product loses things.
 *
 * ── THE FIELD §13 CARES MOST ABOUT, AND WHY IT IS AN ENUM ──────────────────────────────────────
 *
 * §13: "If a continuous projection has no validated probability mapping, record that explicitly and
 * make the leg ineligible for probability-dependent logic rather than inventing a probability."
 *
 * A nullable number cannot say that. `null` collapses four different situations that must stay
 * apart, and the one that matters most is the fourth — a market whose model DOES publish a
 * probability and LOST to the market with it. Writing that number into a receipt as though it were
 * usable is precisely how a demoted model reaches a product.
 *
 *   MODEL_VALIDATED       a calibrated probability from a family whose verdict permits publication
 *   MODEL_DEMOTED         a probability exists and the market beats it — recorded, never used
 *   NO_VALIDATED_MAPPING  a projection exists; no probability mapping has been validated
 *   ABSENT                the model published neither
 *
 * Only MODEL_VALIDATED makes a leg eligible for probability-dependent logic. The other three are
 * recorded in full, because "we know this and may not use it" is a different fact from "we do not
 * know this", and a later recalibration turns the second state into the first without a migration.
 *
 * ⚠ MARKET-IMPLIED PROBABILITY HAS ITS OWN FIELD AND CAN NEVER OCCUPY THE MODEL'S. §13 forbids the
 * substitution in words; here it is forbidden by structure — `marketImpliedProbability` is a
 * separate key, `probabilityBasis` never takes a market value, and `modelProbability` is dropped
 * unless the basis says it may be read.
 *
 * WRITE-ONCE. Settlement adds truth beside a receipt; it never rewrites one. This module has no
 * mutator and no writer — the same enforcement-by-absence `forecast-join.mjs` uses.
 */

export const RECEIPT_SCHEMA_VERSION = 1;

export const PROBABILITY_BASIS = Object.freeze({
  MODEL_VALIDATED: "MODEL_VALIDATED",
  MODEL_DEMOTED: "MODEL_DEMOTED",
  NO_VALIDATED_MAPPING: "NO_VALIDATED_MAPPING",
  ABSENT: "ABSENT",
});

/** The ONLY basis on which a leg may enter probability-dependent logic. */
export function probabilityIsUsable(basis) {
  return basis === PROBABILITY_BASIS.MODEL_VALIDATED;
}

/**
 * Availability and role, which §12 and §14 both require and which are frequently unknown.
 * ⚠ `UNKNOWN` is a member, because `UNKNOWN is not ACTIVE` is a rule this product has already
 * broken once by omission.
 */
export const AVAILABILITY_STATES = Object.freeze(["ACTIVE_CONFIRMED", "ACTIVE_EXPECTED", "QUESTIONABLE", "OUT", "UNKNOWN"]);
export const ROLE_STATES = Object.freeze(["STARTER", "RESERVE", "ROTATION", "UNKNOWN"]);

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const str = (x) => (typeof x === "string" && x.length ? x : null);

/**
 * Freeze one recommendation.
 *
 * Every §13 field is present explicitly. Anything unstated is null and NOT zero, so a price the
 * producer failed to read is indistinguishable from one the book did not offer, and neither can be
 * mistaken for even money.
 */
export function makeRecommendationReceipt(input) {
  const basis = PROBABILITY_BASIS[input.probabilityBasis] ?? PROBABILITY_BASIS.ABSENT;

  return {
    schemaVersion: RECEIPT_SCHEMA_VERSION,

    /* identity */
    receiptId: str(input.receiptId),
    sport: str(input.sport),
    eventId: str(input.eventId),
    participantId: input.participantId == null ? null : String(input.participantId),
    participantName: str(input.participantName),
    marketFamily: str(input.marketFamily),
    side: str(input.side),

    /* the market, as it stood. `price` is null when unread — never -110. */
    sportsbook: str(input.sportsbook),
    line: num(input.line),
    price: num(input.price),
    marketCapturedAt: str(input.marketCapturedAt),

    /* what the model said */
    modelProjection: num(input.modelProjection),
    probabilityBasis: basis,
    /* ⚠ DROPPED unless the basis permits reading it. A MODEL_DEMOTED probability is preserved
       separately, so the number is not lost and cannot be picked up by accident. */
    modelProbability: probabilityIsUsable(basis) ? num(input.modelProbability) : null,
    unusableProbability: probabilityIsUsable(basis) ? null : num(input.modelProbability),
    unusableProbabilityReason: probabilityIsUsable(basis) ? null : str(input.probabilityReason),
    modelVersion: str(input.modelVersion),
    calibrationVersion: str(input.calibrationVersion),

    /* ⚠ THE MARKET'S PROBABILITY, LABELLED AS THE MARKET'S. It may inform a reader and may never
       stand in for the model's — §13 forbids the substitution and this shape forbids it too. */
    marketImpliedProbability: num(input.marketImpliedProbability),
    marketImpliedIsDevigged: input.marketImpliedIsDevigged === true,

    /* the world the recommendation was made in */
    availabilityState: AVAILABILITY_STATES.includes(input.availabilityState) ? input.availabilityState : "UNKNOWN",
    roleState: ROLE_STATES.includes(input.roleState) ? input.roleState : "UNKNOWN",
    roleConfidence: num(input.roleConfidence),

    /* provenance */
    publishedAt: str(input.publishedAt),
    product: str(input.product),
    selector: str(input.selector),
    selectionReason: str(input.selectionReason),
  };
}

/**
 * Decide the basis for one market, from the registries rather than from a caller's opinion.
 *
 * @param {object} q
 * @param {number|null} q.modelProbability   what the model published, if anything
 * @param {string|null} q.calibrationVerdict the market's verdict, where a calibration registry has one
 * @param {boolean} q.familyPublished        is the family published at all
 */
export function probabilityBasisFor({ modelProbability, calibrationVerdict = null, familyPublished = true }) {
  const p = num(modelProbability);
  if (!familyPublished) {
    return { basis: PROBABILITY_BASIS.ABSENT, reason: "the family is not published" };
  }
  if (p === null) {
    return {
      basis: PROBABILITY_BASIS.NO_VALIDATED_MAPPING,
      reason: "the model publishes a projection and no validated probability mapping for it",
    };
  }
  if (calibrationVerdict && calibrationVerdict !== "PUBLIC_MODEL_OK") {
    return {
      basis: PROBABILITY_BASIS.MODEL_DEMOTED,
      reason: `the market's calibration verdict is ${calibrationVerdict} — the market's price is the better probability`,
    };
  }
  return { basis: PROBABILITY_BASIS.MODEL_VALIDATED, reason: null };
}
