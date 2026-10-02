/**
 * RECOMMENDATION RECEIPT V2 — Session 7 · the one leg-level truth contract for Suggested Parlays, Bank
 * Builder and Moonshot.
 *
 * ── WHY A V2 AND NOT A FOURTH CONTRACT ─────────────────────────────────────────────────────────
 *
 * Three leg contracts existed on 2026-10-02 and none was read by a live product:
 *   · `eligible-leg/contract.mjs` (ProductEligibleLeg v1) — team markets, registry, price, timing. It
 *     writes the committed daily manifest and the public availability counts. UNCHANGED here.
 *   · `candidate-universe.mjs` + `eligible-leg/v2.mjs` (#724/#725) — player-prop gates: family state,
 *     role, availability, probability basis, settlement tri-state. Built for NFL boards only.
 *   · `product-eligible-leg.mjs` + `recommendation-receipt.mjs` (§13/§14) — definitions, never wired.
 * This module is their composition for every leg class (team market AND player prop) with ONE field
 * set, and it re-uses their constants rather than re-deciding them. The older modules stay importable
 * for the code that already reads them; new product code reads this.
 *
 * ── THE FIELD THAT MATTERS MOST: probabilityKind ───────────────────────────────────────────────
 *
 * MODEL · MARKET_IMPLIED · NONE, always explicit. A de-vigged book price is MARKET_IMPLIED and lives in
 * `marketImpliedProbability`; it can never be carried in `probability`. A model number exists in
 * `probability` only when the model is cleared to be read (`probabilityDetail` MODEL_PUBLISHED). A
 * demoted or experimental model's number is kept in `unusableModelProbability`, labelled, so it is not
 * lost and cannot be picked up by accident.
 *
 * Missing is null, never zero. A price that was not read is null, never -110.
 * Pure: no fs, no clock.
 */

export const RECEIPT_V2_SCHEMA = "recommendation-receipt@2";

export const PROBABILITY_KIND = Object.freeze({
  MODEL: "MODEL",
  MARKET_IMPLIED: "MARKET_IMPLIED",
  NONE: "NONE",
});

/** Where a probability came from, one level below the kind. */
export const PROBABILITY_DETAIL = Object.freeze({
  /** A GameTimePicks model publishes this number and the family is cleared to be read. */
  MODEL_PUBLISHED: "MODEL_PUBLISHED",
  /** A GameTimePicks model publishes it, but the sport/model is experimental — not a product number. */
  MODEL_EXPERIMENTAL: "MODEL_EXPERIMENTAL",
  /** A GameTimePicks model published it and lost to the market — demoted to market context. */
  MODEL_DEMOTED: "MODEL_DEMOTED",
  /** The model publishes a distribution (mean / p10..p90) and no validated P(over line) mapping. */
  MODEL_DISTRIBUTION_UNCONVERTED: "MODEL_DISTRIBUTION_UNCONVERTED",
  /** Only the book's de-vigged price exists. */
  MARKET_IMPLIED: "MARKET_IMPLIED",
  NONE: "NONE",
});

const KIND_OF = Object.freeze({
  MODEL_PUBLISHED: "MODEL",
  MODEL_EXPERIMENTAL: "MODEL",
  MODEL_DEMOTED: "MODEL",
  MODEL_DISTRIBUTION_UNCONVERTED: "NONE",
  MARKET_IMPLIED: "MARKET_IMPLIED",
  NONE: "NONE",
});

/** Team market (one side of a game) vs a named player/fighter. Role and availability apply to players. */
export const LEG_CLASS = Object.freeze({ TEAM: "TEAM", PLAYER: "PLAYER" });

const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const prob = (x) => { const p = num(x); return p !== null && p > 0 && p < 1 ? p : null; };
const str = (x) => (typeof x === "string" && x.length ? x : x == null ? null : String(x));

/**
 * Build one frozen receipt. Every field is present; anything unknown is null.
 */
export function makeReceiptV2(input) {
  const i = input ?? {};
  const detail = PROBABILITY_DETAIL[i.probabilityDetail] ?? PROBABILITY_DETAIL.NONE;
  const kind = KIND_OF[detail];
  const modelNumber = prob(i.modelProbability);
  const usable = detail === PROBABILITY_DETAIL.MODEL_PUBLISHED;
  const r = {
    schema: RECEIPT_V2_SCHEMA,
    receiptId: null,
    legClass: i.legClass === LEG_CLASS.PLAYER ? LEG_CLASS.PLAYER : LEG_CLASS.TEAM,

    identity: {
      sport: str(i.sport)?.toLowerCase() ?? null,
      eventId: str(i.eventId),
      eventStartUtc: str(i.eventStartUtc),
      participantId: str(i.participantId),
      participantDisplay: str(i.participantDisplay),
      teamId: str(i.teamId),
      opponentId: str(i.opponentId),
      matchup: str(i.matchup),
    },

    market: {
      family: str(i.family),
      marketKey: str(i.marketKey),
      side: str(i.side),
      line: num(i.line),
      binary: i.binary === true,
      sportsbook: str(i.sportsbook),
      /* ⚠ null when unread — never a default price. */
      price: num(i.price),
      marketCapturedAt: str(i.marketCapturedAt),
      marketReceiptId: str(i.marketReceiptId),
      marketImpliedProbability: prob(i.marketImpliedProbability),
      selectionLabel: str(i.selectionLabel),
    },

    forecast: {
      forecastOwner: str(i.forecastOwner),
      forecastId: str(i.forecastId),
      modelVersion: str(i.modelVersion),
      projection: num(i.projection),
      probabilityKind: kind,
      probabilityDetail: detail,
      /* ⚠ THE ONLY PLACE A GAMETIMEPICKS PROBABILITY MAY BE READ FROM. */
      probability: kind === PROBABILITY_KIND.MODEL && usable ? modelNumber : null,
      unusableModelProbability: kind === PROBABILITY_KIND.MODEL && !usable ? modelNumber : null,
      confidence: str(i.confidence),
      modelStatus: str(i.modelStatus),
      publicationStatus: str(i.publicationStatus),
      generatedAt: str(i.generatedAt),
      /* Stamped by the product freeze, never by the universe build. */
      frozenAt: null,
    },

    context: {
      availabilityState: str(i.availabilityState),
      roleState: str(i.roleState),
      rosterTeam: str(i.rosterTeam),
      familyValidationState: str(i.familyValidationState),
      settlementSupport: str(i.settlementSupport),
      withheldReason: str(i.withheldReason),
      sourceRefs: Array.isArray(i.sourceRefs) ? i.sourceRefs.map(String) : [],
    },
  };
  r.receiptId = receiptIdFor(r);
  return Object.freeze(r);
}

/** Stable id: sport:event:family:participant|side[:line]. Deterministic, so a re-run names the same leg. */
export function receiptIdFor(r) {
  const id = r.identity, m = r.market;
  return [id.sport, id.eventId, m.marketKey ?? m.family, id.participantId ?? "-", m.side, m.line ?? ""].map((x) => x ?? "?").join(":");
}

/** The dependency group two legs share if they come from one event. */
export const correlationGroupOf = (r) => `event:${r.identity.sport}:${r.identity.eventId}`;

/**
 * Correlation tags — descriptive only (correlation.mjs owns the taxonomy; nothing here is a coefficient).
 * Team ids are tagged for BOTH sides of a team market, because a leg on a game depends on both teams.
 */
export function correlationTagsOf(r) {
  const t = [`sport:${r.identity.sport}`, correlationGroupOf(r), `family:${r.market.family}`];
  if (r.identity.participantId) t.push(`entity:${r.identity.sport}:${r.identity.participantId}`);
  if (r.identity.teamId) t.push(`team:${r.identity.sport}:${r.identity.teamId}`);
  if (r.identity.opponentId) t.push(`opponent:${r.identity.sport}:${r.identity.opponentId}`);
  return t;
}
