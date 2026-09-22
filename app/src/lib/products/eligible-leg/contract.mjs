/**
 * ProductEligibleLeg v1 — ONE product-facing contract for every sport (v1.7 Phase C).
 *
 * WHY THIS EXISTS
 *   Bank Builder and Moonshot selected from a pool that was MLB-shaped by accident: one loader, one
 *   sport, and a `modelProbability` field that was the de-vigged market price wearing a model's name.
 *   Adding a sport meant adding a loader and hoping. This module makes the product-facing leg a typed
 *   record with derived eligibility, explainable rejection, and a read-time guard that refuses what
 *   the registry refuses even when a malformed artifact contains it.
 *
 * RULES (each has a test)
 *   · `productEligible` is DERIVED here, never set by a normalizer.
 *   · Missing data is null, never zero. A leg with no price is PRICE_UNAVAILABLE, not a 0% leg.
 *   · `probability` is present only when a forecast OWNER defines it. A de-vigged price is
 *     `marketImpliedProbability`, and the leg says `forecastClass: "MARKET_IMPLIED_NO_FORECAST"`.
 *   · No product-side transformation changes the forecast's side.
 *   · Every leg links to its owner artifact (`sourceReceiptRefs`).
 *   · The sport gate is the capability registry (`canEnterPredictionProducts`), read at BOTH the
 *     build and the read boundary — the NBA lesson (a dormant key is not an empty check).
 *
 * PRODUCT POLICY FOR MARKET-PRICED LEGS (frozen v1.7 · founder gate F1 open)
 *   The live products have only ever placed market-priced legs. Refusing them outright would empty
 *   both products on day one of the contract, which is a product decision the founder owns (charter
 *   §29.6). Until that decision, a MARKET_IMPLIED_NO_FORECAST leg from a registry-eligible sport is
 *   ADMITTED with reason code MARKET_PRICED_NO_FORECAST recorded on the leg and on every card built
 *   from it, so the surface can say what it is. `MARKET_PRICED_LEG_POLICY` names the state.
 *
 * Pure: no fs, no fetch, no clock (the clock is an argument).
 */
import { canEnterPredictionProducts, capabilityState } from "../../sport-capability-registry.ts";

export const PRODUCT_ELIGIBLE_LEG_SCHEMA_VERSION = 1;

/** Product policy on legs whose only probability is the market's. See header. */
export const MARKET_PRICED_LEG_POLICY = Object.freeze({
  state: "ADMITTED_PENDING_FOUNDER_DECISION",
  gate: "F1",
  since: "2026-09-21",
});

/** Sports the contract knows how to carry. Unknown sports are refused by the sport gate regardless. */
export const CONTRACT_SPORTS = Object.freeze(["mlb", "nfl", "ufc", "epl", "nba"]);

/** How the leg's probability came to be. */
export const FORECAST_CLASS = Object.freeze({
  VALIDATED_MODEL: "VALIDATED_MODEL",             // a public, validated model owner defines `probability`
  EXPERIMENTAL_MODEL: "EXPERIMENTAL_MODEL",       // a public but experimental owner (never product-eligible)
  MARKET_IMPLIED_NO_FORECAST: "MARKET_IMPLIED_NO_FORECAST", // only a de-vigged price exists
  PRIVATE_OR_SHADOW: "PRIVATE_OR_SHADOW",         // research output that must never reach a product
});

/** Model statuses that can never be promoted (charter §2.3). */
export const BLOCKED_MODEL_STATUSES = Object.freeze(["REJECTED", "STOP", "PAUSED", "HOLDING", "PRIVATE", "SHADOW", "HISTORICAL_ONLY", "UNSUPPORTED"]);

/** Every reason a leg can be refused. Public copy maps these; the code never renders them raw. */
export const REASON = Object.freeze({
  SPORT_NOT_ELIGIBLE: "SPORT_NOT_ELIGIBLE",
  SPORT_UNKNOWN: "SPORT_UNKNOWN",
  MODEL_STATUS_BLOCKED: "MODEL_STATUS_BLOCKED",
  FORECAST_PRIVATE_OR_SHADOW: "FORECAST_PRIVATE_OR_SHADOW",
  FORECAST_EXPERIMENTAL: "FORECAST_EXPERIMENTAL",
  MARKET_NOT_SUPPORTED: "MARKET_NOT_SUPPORTED",
  PRICE_UNAVAILABLE: "PRICE_UNAVAILABLE",
  PRICE_OUT_OF_RANGE: "PRICE_OUT_OF_RANGE",
  PRICE_CAPTURED_AFTER_START: "PRICE_CAPTURED_AFTER_START",
  PRICE_CAPTURED_AFTER_AS_OF: "PRICE_CAPTURED_AFTER_AS_OF",
  STALE: "STALE",
  EVENT_STARTED: "EVENT_STARTED",
  EVENT_INSIDE_CUTOFF: "EVENT_INSIDE_CUTOFF",
  MISSING_IDENTITY: "MISSING_IDENTITY",
  MISSING_OWNER_REF: "MISSING_OWNER_REF",
  SIDE_MISMATCH: "SIDE_MISMATCH",
  PROBABILITY_INVALID: "PROBABILITY_INVALID",
  MARKET_PRICED_NO_FORECAST: "MARKET_PRICED_NO_FORECAST", // informational: admitted under MARKET_PRICED_LEG_POLICY
});

/** Reasons that are recorded but do not refuse the leg. */
const INFORMATIONAL = new Set([REASON.MARKET_PRICED_NO_FORECAST]);

/** Frozen product bounds shared by every sport (the legacy MLB window, unchanged). */
export const LEG_BOUNDS = Object.freeze({ oddsMin: -650, oddsMax: 400, maxPriceAgeMs: 12 * 60 * 60 * 1000, activationCutoffMs: 30 * 60 * 1000 });

/**
 * @typedef {object} ProductEligibleLegV1
 * @property {1} schemaVersion
 * @property {string} legId                 stable id: `${sport}:${eventId}:${marketKey}:${side}[:${line}]`
 * @property {string} sport                 lower-case registry key
 * @property {string} eventId               the sport's canonical event id (MLB gamePk, ESPN event id, …)
 * @property {string} eventStartUtc         ISO instant
 * @property {string[]} entityIds           teams / players / fighters the leg depends on (canonical ids)
 * @property {string} marketFamily          "team_result" | "team_total" | "team_spread" | "player_prop" | "fight_result"
 * @property {string} marketKey             owner's market key (e.g. mlb_moneyline)
 * @property {string} side                  owner's side, verbatim (never transformed)
 * @property {number|null} line             null only when genuinely not applicable
 * @property {string} forecastOwner         owner artifact family (e.g. "mlb/team-markets", "nfl/game-forecasts")
 * @property {string|null} forecastId       owner's id / version for this forecast, null when the owner has none
 * @property {string} forecastClass         FORECAST_CLASS value
 * @property {string} modelStatus           owner's status word (e.g. VALIDATED, PUBLIC_EXPERIMENTAL, MARKET_CONTEXT)
 * @property {number|null} probability      ONLY from a validated owner
 * @property {number|null} marketImpliedProbability   de-vigged price, when a price exists
 * @property {{ american:number, bookmaker:string, capturedAt:string, receipt:string }|null} oddsForSide
 * @property {string} publishedAt           owner's generatedAt
 * @property {string} asOf                  the publication instant the leg was evaluated at
 * @property {boolean} productEligible      DERIVED
 * @property {string[]} eligibilityReasonCodes
 * @property {string[]} correlationKeys     `event:<id>`, `team:<id>`, `entity:<id>`, `family:<f>`, `sport:<s>`, `start:<bucket>`
 * @property {string[]} sourceReceiptRefs   artifact paths the leg was read from
 * @property {string|null} displayMatchup   human label, presentation only
 * @property {string|null} displaySelection presentation only
 */

/** Team-level relationship keys are derived from what the leg names; nothing is inferred. */
export function correlationKeysFor(leg) {
  const keys = [`sport:${leg.sport}`, `event:${leg.sport}:${leg.eventId}`, `family:${leg.marketFamily}`];
  for (const e of leg.entityIds ?? []) keys.push(`entity:${leg.sport}:${e}`);
  if (leg.eventStartUtc) { const t = Date.parse(leg.eventStartUtc); if (Number.isFinite(t)) keys.push(`start:${Math.floor(t / (30 * 60 * 1000))}`); }
  return keys;
}

/**
 * Derive eligibility for one candidate. Returns a full ProductEligibleLegV1 with `productEligible`
 * and `eligibilityReasonCodes` set. Never throws on bad input — a malformed candidate is a refused leg.
 *
 * @param {object} candidate  a normalizer's output (everything except the derived fields)
 * @param {{ asOf: string }} ctx  the publication instant
 */
export function evaluateLeg(candidate, ctx) {
  const reasons = [];
  const asOfMs = Date.parse(ctx?.asOf ?? "");
  const c = candidate ?? {};
  const sport = typeof c.sport === "string" ? c.sport.toLowerCase() : null;

  // Identity first: a leg that cannot be settled cannot be a product leg.
  if (!sport || !c.eventId || !c.marketKey || typeof c.side !== "string" || !c.side) reasons.push(REASON.MISSING_IDENTITY);
  if (!c.forecastOwner || !Array.isArray(c.sourceReceiptRefs) || c.sourceReceiptRefs.length === 0) reasons.push(REASON.MISSING_OWNER_REF);

  // Sport gate: the registry, not the artifact.
  if (sport && !CONTRACT_SPORTS.includes(sport)) reasons.push(REASON.SPORT_UNKNOWN);
  else if (sport && !canEnterPredictionProducts(sport)) reasons.push(REASON.SPORT_NOT_ELIGIBLE);

  // Forecast class / status.
  const fc = c.forecastClass;
  const status = typeof c.modelStatus === "string" ? c.modelStatus.toUpperCase() : "";
  if (fc === FORECAST_CLASS.PRIVATE_OR_SHADOW) reasons.push(REASON.FORECAST_PRIVATE_OR_SHADOW);
  if (fc === FORECAST_CLASS.EXPERIMENTAL_MODEL) reasons.push(REASON.FORECAST_EXPERIMENTAL);
  if (BLOCKED_MODEL_STATUSES.includes(status)) reasons.push(REASON.MODEL_STATUS_BLOCKED);
  if (fc === FORECAST_CLASS.MARKET_IMPLIED_NO_FORECAST) reasons.push(REASON.MARKET_PRICED_NO_FORECAST);
  if (![FORECAST_CLASS.VALIDATED_MODEL, FORECAST_CLASS.EXPERIMENTAL_MODEL, FORECAST_CLASS.MARKET_IMPLIED_NO_FORECAST, FORECAST_CLASS.PRIVATE_OR_SHADOW].includes(fc)) reasons.push(REASON.FORECAST_PRIVATE_OR_SHADOW);

  // Probability: only a validated owner may carry one; and it must be a probability.
  let probability = null;
  if (fc === FORECAST_CLASS.VALIDATED_MODEL) {
    if (typeof c.probability === "number" && c.probability > 0 && c.probability < 1) probability = c.probability;
    else reasons.push(REASON.PROBABILITY_INVALID);
  }
  const mip = typeof c.marketImpliedProbability === "number" && c.marketImpliedProbability > 0 && c.marketImpliedProbability < 1 ? c.marketImpliedProbability : null;

  // Price: owned, in range, captured before the event and before the as-of instant.
  const o = c.oddsForSide ?? null;
  const startMs = Date.parse(c.eventStartUtc ?? "");
  if (!o || !Number.isFinite(o.american) || !o.bookmaker || !o.capturedAt || !o.receipt) reasons.push(REASON.PRICE_UNAVAILABLE);
  else {
    if (o.american < LEG_BOUNDS.oddsMin || o.american > LEG_BOUNDS.oddsMax) reasons.push(REASON.PRICE_OUT_OF_RANGE);
    const capMs = Date.parse(o.capturedAt);
    if (!Number.isFinite(capMs)) reasons.push(REASON.PRICE_UNAVAILABLE);
    else {
      if (Number.isFinite(startMs) && capMs >= startMs) reasons.push(REASON.PRICE_CAPTURED_AFTER_START);
      if (Number.isFinite(asOfMs) && capMs > asOfMs) reasons.push(REASON.PRICE_CAPTURED_AFTER_AS_OF);
      if (Number.isFinite(asOfMs) && asOfMs - capMs > LEG_BOUNDS.maxPriceAgeMs) reasons.push(REASON.STALE);
    }
  }

  // Event timing relative to the as-of instant.
  if (!Number.isFinite(startMs)) reasons.push(REASON.MISSING_IDENTITY);
  else if (Number.isFinite(asOfMs)) {
    if (startMs <= asOfMs) reasons.push(REASON.EVENT_STARTED);
    else if (startMs - asOfMs < LEG_BOUNDS.activationCutoffMs) reasons.push(REASON.EVENT_INSIDE_CUTOFF);
  }

  const refusing = [...new Set(reasons)].filter((r) => !INFORMATIONAL.has(r));
  const leg = {
    schemaVersion: PRODUCT_ELIGIBLE_LEG_SCHEMA_VERSION,
    legId: c.legId ?? (sport && c.eventId && c.marketKey && c.side ? `${sport}:${c.eventId}:${c.marketKey}:${c.side}${c.line != null ? `:${c.line}` : ""}` : null),
    sport, eventId: c.eventId ?? null, eventStartUtc: c.eventStartUtc ?? null,
    entityIds: Array.isArray(c.entityIds) ? [...c.entityIds] : [],
    marketFamily: c.marketFamily ?? null, marketKey: c.marketKey ?? null, side: c.side ?? null,
    line: typeof c.line === "number" ? c.line : null,
    forecastOwner: c.forecastOwner ?? null, forecastId: c.forecastId ?? null, forecastClass: fc ?? null,
    modelStatus: c.modelStatus ?? null,
    probability, marketImpliedProbability: mip,
    oddsForSide: o && Number.isFinite(o.american) ? { american: o.american, bookmaker: o.bookmaker ?? null, capturedAt: o.capturedAt ?? null, receipt: o.receipt ?? null } : null,
    publishedAt: c.publishedAt ?? null, asOf: ctx?.asOf ?? null,
    productEligible: refusing.length === 0,
    eligibilityReasonCodes: [...new Set(reasons)],
    correlationKeys: [],
    sourceReceiptRefs: Array.isArray(c.sourceReceiptRefs) ? [...c.sourceReceiptRefs] : [],
    displayMatchup: c.displayMatchup ?? null, displaySelection: c.displaySelection ?? null,
    registryState: sport ? capabilityState(sport) : null,
  };
  leg.correlationKeys = correlationKeysFor(leg);
  return leg;
}

/**
 * READ-TIME GUARD. A consumer (selector, Ask, page) must pass every leg through this before use, so
 * that an artifact written when a sport was eligible — or hand-edited, or malformed — cannot leak.
 * Returns only legs that are still eligible under the CURRENT registry and the caller's as-of instant.
 */
export function guardLegs(legs, ctx) {
  const kept = [], refused = [];
  for (const raw of Array.isArray(legs) ? legs : []) {
    if (!raw || raw.schemaVersion !== PRODUCT_ELIGIBLE_LEG_SCHEMA_VERSION) { refused.push({ legId: raw?.legId ?? null, reasons: ["SCHEMA_MISMATCH"] }); continue; }
    const re = evaluateLeg(raw, ctx ?? { asOf: raw.asOf });
    if (re.productEligible && raw.productEligible === true) kept.push({ ...raw, correlationKeys: re.correlationKeys });
    else refused.push({ legId: raw.legId ?? null, reasons: re.productEligible ? ["ARTIFACT_SAID_INELIGIBLE"] : re.eligibilityReasonCodes.filter((r) => !INFORMATIONAL.has(r)) });
  }
  return { kept, refused };
}

/**
 * Per sport / day coverage manifest — how "the optimizer found nothing" is told apart from
 * "the input owner produced nothing".
 */
export function buildManifest({ date, asOf, sports }) {
  const out = { schemaVersion: 1, artifact: "product-eligible-legs/manifest", date, asOf, sports: {} };
  for (const [sport, s] of Object.entries(sports ?? {})) {
    const legs = s.legs ?? [];
    const rejected = legs.filter((l) => !l.productEligible);
    const byReason = {};
    for (const l of rejected) for (const r of l.eligibilityReasonCodes) if (!INFORMATIONAL.has(r)) byReason[r] = (byReason[r] ?? 0) + 1;
    out.sports[sport] = {
      registryState: capabilityState(sport),
      registryPermitsProductLegs: canEnterPredictionProducts(sport),
      rawForecastCount: s.rawForecastCount ?? null,
      publicForecastCount: s.publicForecastCount ?? null,
      eventCount: new Set(legs.map((l) => l.eventId)).size,
      marketFamilyCount: new Set(legs.map((l) => l.marketFamily)).size,
      eligibleLegCount: legs.length - rejected.length,
      rejectedLegCount: rejected.length,
      rejectedByReason: byReason,
      staleCount: legs.filter((l) => l.eligibilityReasonCodes.includes(REASON.STALE)).length,
      noPriceCount: legs.filter((l) => l.eligibilityReasonCodes.includes(REASON.PRICE_UNAVAILABLE)).length,
      marketPricedNoForecastCount: legs.filter((l) => l.eligibilityReasonCodes.includes(REASON.MARKET_PRICED_NO_FORECAST)).length,
      ownerNote: s.ownerNote ?? null,
      sourceReceiptRefs: [...new Set(legs.flatMap((l) => l.sourceReceiptRefs))],
    };
  }
  return out;
}

/** Public-safe copy for a sport's day state. Never echoes internal reason text. */
export function publicReasonFor(sportManifest) {
  if (!sportManifest) return "not covered";
  if (!sportManifest.registryPermitsProductLegs) return "not eligible for prediction products";
  if ((sportManifest.rawForecastCount ?? 0) === 0 && (sportManifest.eligibleLegCount ?? 0) === 0) return "no events";
  if (sportManifest.eligibleLegCount === 0) {
    if (sportManifest.noPriceCount > 0) return "no usable prices";
    if (sportManifest.staleCount > 0) return "prices too old";
    return "no eligible markets";
  }
  return `${sportManifest.eligibleLegCount} eligible legs`;
}
