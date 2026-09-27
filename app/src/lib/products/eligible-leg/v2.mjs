/**
 * PRODUCT ELIGIBLE LEG V2 — one contract, composed from the two owners that already exist.
 *
 * ⚠ NOT A THIRD EVALUATOR. V1 (`contract.mjs`) already owns identity, price range, staleness, event
 * cutoffs and market support, and it is what produces today's committed manifest. The candidate
 * universe (`../candidate-universe.mjs`) owns the dimensions V1 has no field for: family state, role,
 * availability, probability BASIS and settlement. V2 composes them and adds the field set the
 * products need. Re-implementing either would make two normalisers for one rule.
 *
 * ⚠ V1'S BEHAVIOUR IS UNCHANGED, DELIBERATELY. V1 drives the committed artifact and the current
 * public products; altering it tonight would move published numbers behind a frozen baseline. V2 is
 * additive, and the funnel below is a report.
 *
 * ── WHAT V2 EXISTS TO PREVENT ──────────────────────────────────────────────────────────────────
 *
 * 🔴 In V1, `MARKET_PRICED_NO_FORECAST` is INFORMATIONAL — "recorded but does not refuse the leg".
 * That is how all 78 MLB legs in today's manifest are admitted while carrying no GameTimePicks model
 * probability at all: they are de-vigged bookmaker prices, under a policy whose own state is
 * `ADMITTED_PENDING_FOUNDER_DECISION` (gate F1).
 *
 * V2 does NOT flip that policy — the admission is a founder decision, not mine. What it makes
 * impossible is the MASQUERADE: `probabilityBasis` is required, and a leg whose basis is not
 * `MODEL_PUBLISHED` cannot carry a `modelProbability` at all. A market-implied number can therefore
 * never be read as a GameTimePicks model probability by a downstream selector, whatever the policy
 * decides about admitting it.
 *
 * ⚠ THIS MODULE CANNOT BE IMPORTED FROM PLAIN NODE. It imports V1, which imports
 * `sport-capability-registry.ts`, so every consumer needs tsx. `api/ask.mjs` runs as plain node on
 * Vercel and therefore may NEVER import this — anything Ask needs must be derived into a committed
 * artifact by a build step first. That constraint has already cost this repo one production crash.
 */
import { evaluateLeg, REASON, correlationKeysFor } from "./contract.mjs";
import { evaluateCandidate, CANDIDATE_STATE, SETTLEMENT_SUPPORT } from "../candidate-universe.mjs";

export const PRODUCT_ELIGIBLE_LEG_V2_SCHEMA_VERSION = 2;

/**
 * Where a probability came from. REQUIRED on every V2 leg.
 *
 * ⚠ `MODEL_DISTRIBUTION_UNCONVERTED` is its own basis and not a missing one. The NFL player families
 * publish mean/p10..p90; P(over line) needs a distributional assumption, which is a gated modelling
 * step. "We have a distribution and have not converted it" is a different, more useful statement than
 * "we have nothing", and collapsing them would hide 551 NFL rows behind a null.
 */
export const PROBABILITY_BASIS = Object.freeze({
  MODEL_PUBLISHED: "MODEL_PUBLISHED",
  MODEL_DISTRIBUTION_UNCONVERTED: "MODEL_DISTRIBUTION_UNCONVERTED",
  MARKET_IMPLIED: "MARKET_IMPLIED",
  NONE: "NONE",
});

/** The only basis a GameTimePicks model probability may come from. */
export const MODEL_PROBABILITY_BASES = Object.freeze(new Set([PROBABILITY_BASIS.MODEL_PUBLISHED]));

/** V2 reason codes: V1's, plus the dimensions V1 cannot express. */
export const REASON_V2 = Object.freeze({
  ...REASON,
  FAMILY_STATE_NOT_CLEARED: "FAMILY_STATE_NOT_CLEARED",
  ROLE_NOT_CONFIRMED: "ROLE_NOT_CONFIRMED",
  AVAILABILITY_BLOCKED: "AVAILABILITY_BLOCKED",
  NO_MODEL_PROBABILITY: "NO_MODEL_PROBABILITY",
  SETTLEMENT_NOT_PROVEN: "SETTLEMENT_NOT_PROVEN",
  /* Recorded, never silent: the leg's probability is the book's, not ours. */
  PROBABILITY_IS_MARKET_IMPLIED: "PROBABILITY_IS_MARKET_IMPLIED",
});

const STATE_TO_REASON = Object.freeze({
  [CANDIDATE_STATE.INELIGIBLE_MODEL_STATUS]: REASON_V2.FAMILY_STATE_NOT_CLEARED,
  [CANDIDATE_STATE.INELIGIBLE_ROLE]: REASON_V2.ROLE_NOT_CONFIRMED,
  [CANDIDATE_STATE.INELIGIBLE_AVAILABILITY]: REASON_V2.AVAILABILITY_BLOCKED,
  [CANDIDATE_STATE.INELIGIBLE_NO_MODEL_PROBABILITY]: REASON_V2.NO_MODEL_PROBABILITY,
  [CANDIDATE_STATE.INELIGIBLE_SETTLEMENT]: REASON_V2.SETTLEMENT_NOT_PROVEN,
  [CANDIDATE_STATE.INELIGIBLE_IDENTITY]: REASON_V2.MISSING_IDENTITY,
  [CANDIDATE_STATE.INELIGIBLE_MARKET]: REASON_V2.MARKET_NOT_SUPPORTED,
  [CANDIDATE_STATE.INELIGIBLE_FRESHNESS]: REASON_V2.STALE,
});

/**
 * Evaluate a V2 candidate. Composes both owners and emits the full field set.
 *
 * @param ctx.asOf           publication instant — never a wall clock
 * @param ctx.maxPriceAgeMs  REQUIRED staleness bound
 */
export function evaluateLegV2(candidate, ctx) {
  const c = candidate ?? {};
  const basis = String(c.probabilityBasis ?? PROBABILITY_BASIS.NONE);

  /*
   * ⚠ THE ANTI-MASQUERADE RULE, APPLIED BEFORE ANY GATE RUNS. A probability whose basis is not
   * MODEL_PUBLISHED is not carried as `modelProbability` at all — it moves to
   * `marketImpliedProbability`. A downstream selector therefore cannot read the book's number as
   * ours even by accident, which is a stronger guarantee than a reason code it might ignore.
   */
  const modelProbability = MODEL_PROBABILITY_BASES.has(basis) ? (c.modelProbability ?? null) : null;
  const marketImpliedProbability = basis === PROBABILITY_BASIS.MARKET_IMPLIED
    ? (c.modelProbability ?? c.marketImpliedProbability ?? null)
    : (c.marketImpliedProbability ?? null);

  /* The candidate-universe gates see the CORRECTED probability, so a market-implied leg fails the
     model-probability gate rather than passing on the book's number. */
  const cu = evaluateCandidate({ ...c, modelProbability }, { asOf: ctx?.asOf, maxPriceAgeMs: ctx?.maxPriceAgeMs });

  /* V1's gates, run only when the candidate carries a V1-shaped leg. Its reasons are merged, never
     re-derived, so the two owners cannot disagree about a price or an event cutoff. */
  const v1 = c.legId ? evaluateLeg({ ...c, schemaVersion: 1 }, { asOf: ctx?.asOf }) : null;

  const reasons = new Set();
  for (const s of cu.states) { if (s !== CANDIDATE_STATE.ELIGIBLE && STATE_TO_REASON[s]) reasons.add(STATE_TO_REASON[s]); }
  for (const r of v1?.eligibilityReasonCodes ?? []) { if (r !== REASON.MARKET_PRICED_NO_FORECAST) reasons.add(r); }
  if (basis === PROBABILITY_BASIS.MARKET_IMPLIED) reasons.add(REASON_V2.PROBABILITY_IS_MARKET_IMPLIED);

  const explicitIneligibilityReasons = [...reasons].sort();

  return Object.freeze({
    schemaVersion: PRODUCT_ELIGIBLE_LEG_V2_SCHEMA_VERSION,
    legId: c.legId ?? legIdFor(c),
    sport: c.sport ?? null,
    eventId: c.eventId ?? null,
    eventStartUtc: c.eventStartUtc ?? c.kickoffUtc ?? null,
    participantId: c.participantId ?? null,
    participant: c.participant ?? null,
    marketFamily: c.marketFamily ?? null,
    marketKey: c.marketKey ?? null,
    side: c.side ?? null,
    sportsbook: c.sportsbook ?? null,
    line: c.line ?? null,
    price: c.price ?? null,
    marketCapturedAt: c.marketCapturedAt ?? null,

    modelProjection: c.modelProjection ?? null,
    modelProbability,
    marketImpliedProbability,
    probabilityBasis: basis,
    modelVersion: c.modelVersion ?? null,
    calibrationVersion: c.calibrationVersion ?? null,
    modelStatus: c.modelStatus ?? c.familyState ?? null,
    productEligibility: explicitIneligibilityReasons.length === 0 ? "ELIGIBLE" : "INELIGIBLE",

    availabilityState: c.participation ?? c.availabilityState ?? null,
    availabilityObservedAt: c.availabilityObservedAt ?? null,
    roleState: c.roleState ?? c.participation ?? null,
    roleConfidence: c.roleConfidence ?? null,
    freshness: { marketCapturedAt: c.marketCapturedAt ?? null, priceAgeMs: cu.priceAgeMs ?? null, asOf: ctx?.asOf ?? null },
    settlementState: cu.settlementSupport,
    settlementSupported: cu.settlementSupport === SETTLEMENT_SUPPORT.PROVEN,

    correlationTags: c.legId ? correlationKeysFor({ ...c, entityIds: c.entityIds ?? (c.participantId ? [c.participantId] : []) }) : correlationTagsFor(c),
    provenance: c.provenance ?? { sourceReceiptRefs: c.sourceReceiptRefs ?? [], forecastOwner: c.forecastOwner ?? null },
    source: c.source ?? null,

    explicitIneligibilityReasons,
    eligible: explicitIneligibilityReasons.length === 0,
  });
}

const legIdFor = (c) =>
  [c.sport, c.eventId, c.marketFamily, c.participantId ?? c.side, c.line ?? ""].filter((x) => x != null).join(":");

/** Correlation tags for a player-prop candidate that has no V1 leg shape. */
export function correlationTagsFor(c) {
  const tags = [`sport:${c.sport}`, `event:${c.sport}:${c.eventId}`, `family:${c.marketFamily}`];
  if (c.participantId) tags.push(`entity:${c.sport}:${c.participantId}`);
  if (c.team) tags.push(`team:${c.sport}:${c.team}`);
  return tags;
}

/**
 * The eligibility funnel, in the order the founder asked for.
 *
 * ⚠ EACH STAGE IS A SUBSET OF THE ONE ABOVE IT, so the drops are attributable. A funnel whose stages
 * were independent counts would show six numbers that cannot be subtracted from each other.
 */
export function eligibilityFunnel(legs) {
  const l = Array.isArray(legs) ? legs : [];
  const has = (leg, r) => !leg.explicitIneligibilityReasons.includes(r);
  const stage = [];
  let cur = l;
  const push = (label, pred) => { cur = cur.filter(pred); stage.push({ stage: label, remaining: cur.length }); };

  stage.push({ stage: "total market rows", remaining: cur.length });
  /*
   * ⚠ "A MODEL OUTPUT", NOT "A NUMERIC PROJECTION", and the difference mattered on real data. For a
   * BINARY market the model's output IS a probability — `anytime_td` carries `probability` and a
   * price but no mean/median. Requiring `modelProjection` dropped all 275 TD rows at this stage as
   * though they had no market or no model, when they have both and are blocked two stages later by
   * their family state (ROLE_UNCERTAIN). A funnel that attributes a drop to the wrong stage sends
   * the reader to fix the wrong thing.
   */
  push("priced + model output", (x) => has(x, REASON_V2.MARKET_NOT_SUPPORTED) && (x.modelProjection != null || x.modelProbability != null));
  push("PUBLISHED family", (x) => has(x, REASON_V2.FAMILY_STATE_NOT_CLEARED));
  push("identity valid", (x) => has(x, REASON_V2.MISSING_IDENTITY));
  push("availability valid", (x) => has(x, REASON_V2.AVAILABILITY_BLOCKED));
  push("role valid", (x) => has(x, REASON_V2.ROLE_NOT_CONFIRMED));
  push("probability valid", (x) => has(x, REASON_V2.NO_MODEL_PROBABILITY) && has(x, REASON_V2.PROBABILITY_IS_MARKET_IMPLIED));
  push("freshness valid", (x) => has(x, REASON_V2.STALE));
  push("settlement proven", (x) => has(x, REASON_V2.SETTLEMENT_NOT_PROVEN));
  stage.push({ stage: "ELIGIBLE", remaining: cur.filter((x) => x.eligible).length });

  return {
    stages: stage,
    /* The first stage at which everything was lost — the binding constraint, named. */
    bindingStage: stage.find((s, i) => i > 0 && s.remaining === 0 && stage[i - 1].remaining > 0)?.stage ?? null,
    eligible: cur.filter((x) => x.eligible).length,
    verdict: cur.some((x) => x.eligible) ? "CANDIDATES_AVAILABLE" : "NO_QUALIFYING_PLAY",
  };
}
