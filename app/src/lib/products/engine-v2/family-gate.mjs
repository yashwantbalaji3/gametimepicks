/**
 * FAMILY-LEVEL PRODUCT GATE — Session 8 · B.
 *
 * The sport registry admits a sport into official products only at FULL_MODEL. NFL sits at
 * EXPERIMENTAL_PUBLIC, and promoting the whole sport would let one good family launder every weaker one
 * into Bank Builder. This gate is the narrower door: ONE sport-family may lift SPORT_GATED, and only when
 * both of these hold —
 *
 *   1. a founder GRANT names it (FAMILY_PRODUCT_GRANTS below — code, so a grant is a reviewed PR, never a
 *      data edit), and
 *   2. the family's EVIDENCE, derived fresh from the committed artifacts at every universe build, has zero
 *      blockers. A grant can never outlive its evidence: a forward breach, a settlement path that stops
 *      proving itself, or prices that stop arriving close the door the same day.
 *
 * Nothing is granted today. Every NFL family's blockers are derived and published in the daily universe
 * (`nflFamilyGate`), so "why isn't NFL in Bank Builder?" has a typed, current answer.
 *
 * The gate never makes a probability, never converts a projection, and never reads a sportsbook price as a
 * model number. It only decides whether the existing leg floor may consider a family at all; every other
 * leg-floor gate (role, availability, price, freshness, cutoff, settlement) still applies per leg.
 */

/** Founder-granted sport-families. Empty: no family has been granted. Shape when one is:
 *  { sport: "nfl", family: "anytime_td", grantedBy: "founder", grantedAt: "<ISO>", decisionRef: "<doc path>" } */
export const FAMILY_PRODUCT_GRANTS = Object.freeze([]);

export const FAMILY_GATE_STATE = Object.freeze({ PRODUCT_ELIGIBLE: "PRODUCT_ELIGIBLE", GATED: "GATED" });

/** Typed blockers. Each one names the evidence it reads. */
export const FAMILY_BLOCKER = Object.freeze({
  FAMILY_NOT_PUBLISHED: "FAMILY_NOT_PUBLISHED",                 // model-status / board family state is not PUBLISHED
  NO_MODEL_PROBABILITY: "NO_MODEL_PROBABILITY",                 // the family publishes a projection, not a probability
  MODEL_FORWARD_BREACHED: "MODEL_FORWARD_BREACHED",             // the published model's forward receipt breached its bars
  MODEL_FORWARD_ACCUMULATING: "MODEL_FORWARD_ACCUMULATING",     // the forward receipt has no verdict yet (n < needed)
  MODEL_FORWARD_UNREGISTERED: "MODEL_FORWARD_UNREGISTERED",     // no forward receipt for the published model
  ROLE_CONFIRMATION_UNAVAILABLE: "ROLE_CONFIRMATION_UNAVAILABLE", // no candidate on the slate carries a confirmed role
  PRICES_NOT_CAPTURED: "PRICES_NOT_CAPTURED",                   // no candidate carries a real sportsbook price
  SETTLEMENT_NOT_PROVEN: "SETTLEMENT_NOT_PROVEN",               // the family has never graded through the canonical path
  NO_FOUNDER_GRANT: "NO_FOUNDER_GRANT",
});

const PUBLISHED_STATES = new Set(["PUBLISHED", "VALIDATED_PICK", "ADOPTED"]);

/**
 * Derive one family's gate from its evidence. Pure.
 * @param {object} o
 * @param {string} o.sport
 * @param {string} o.family
 * @param {string|null} o.publicationState       family state as published (model-status / board)
 * @param {string|null} o.modelVersion           the model the board names for this family
 * @param {object|null} o.forward                forward receipt entry for THAT model: {state, n, needed, metrics}
 * @param {object} o.slate                       {candidates, modelProbability, roleConfirmed, priced, settlementProven}
 * @param {Array}  [o.grants]
 */
export function deriveFamilyGate({ sport, family, publicationState, modelVersion, forward, slate, grants = FAMILY_PRODUCT_GRANTS }) {
  const blockers = [];
  if (!PUBLISHED_STATES.has(String(publicationState ?? ""))) blockers.push(FAMILY_BLOCKER.FAMILY_NOT_PUBLISHED);
  if (!(slate?.modelProbability > 0)) blockers.push(FAMILY_BLOCKER.NO_MODEL_PROBABILITY);
  if (!forward) blockers.push(FAMILY_BLOCKER.MODEL_FORWARD_UNREGISTERED);
  else if (forward.state === "FORWARD_BREACHED") blockers.push(FAMILY_BLOCKER.MODEL_FORWARD_BREACHED);
  else if (forward.state !== "FORWARD_PASSED") blockers.push(FAMILY_BLOCKER.MODEL_FORWARD_ACCUMULATING);
  if (!(slate?.roleConfirmed > 0)) blockers.push(FAMILY_BLOCKER.ROLE_CONFIRMATION_UNAVAILABLE);
  if (!(slate?.priced > 0)) blockers.push(FAMILY_BLOCKER.PRICES_NOT_CAPTURED);
  if (!slate?.settlementProven) blockers.push(FAMILY_BLOCKER.SETTLEMENT_NOT_PROVEN);
  const grant = (grants ?? []).find((g) => g?.sport === sport && g?.family === family) ?? null;
  if (!grant) blockers.push(FAMILY_BLOCKER.NO_FOUNDER_GRANT);
  return {
    sport, family, modelVersion: modelVersion ?? null, publicationState: publicationState ?? null,
    state: blockers.length === 0 ? FAMILY_GATE_STATE.PRODUCT_ELIGIBLE : FAMILY_GATE_STATE.GATED,
    blockers,
    evidence: { forward: forward ? { state: forward.state, n: forward.n ?? null, needed: forward.needed ?? null, metrics: forward.metrics ?? null } : null, slate },
    grant,
  };
}

/** The set the leg floor reads: `${sport}:${family}` for every PRODUCT_ELIGIBLE family. */
export function grantedFamilyKeys(gates) {
  return new Set((gates ?? []).filter((g) => g.state === FAMILY_GATE_STATE.PRODUCT_ELIGIBLE).map((g) => `${g.sport}:${g.family}`));
}

/**
 * The NFL families from the slate's own receipts plus the committed status / forward evidence.
 * @param {{ receipts: Array, forwardReceipt: object|null, familyState: Map }} o
 *   receipts = RecommendationReceiptV2 rows for NFL player boards on the slate.
 */
export function deriveNflFamilyGates({ receipts, forwardReceipt, familyState, grants = FAMILY_PRODUCT_GRANTS }) {
  const byFamily = new Map();
  for (const r of receipts ?? []) {
    if (r?.identity?.sport !== "nfl" || r?.legClass !== "PLAYER") continue;
    const fam = r.market?.family;
    const s = byFamily.get(fam) ?? { candidates: 0, modelProbability: 0, roleConfirmed: 0, priced: 0, settlementProven: false, modelVersions: new Set() };
    s.candidates += 1;
    if (r.forecast?.probabilityKind === "MODEL" && r.forecast?.probability != null) s.modelProbability += 1;
    if (["AVAILABLE_ROLE_CONFIRMED", "STARTER", "CONFIRMED"].includes(String(r.context?.roleState ?? r.context?.availabilityState ?? ""))) s.roleConfirmed += 1;
    if (r.market?.sportsbook && r.market?.price != null) s.priced += 1;
    if (r.context?.settlementSupport === "PROVEN") s.settlementProven = true;
    if (r.forecast?.modelVersion) s.modelVersions.add(r.forecast.modelVersion);
    byFamily.set(fam, s);
  }
  return [...byFamily.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))).map(([family, s]) => {
    const modelVersion = s.modelVersions.size === 1 ? [...s.modelVersions][0] : null;
    /* The forward receipt is the share-level program's: it judges ONLY the share-level models. A family whose
       board number comes from another model (props-v1, anytime-td-v1) has no forward receipt of its own. */
    const forwardKey = family === "anytime_td" ? "anytime_td" : `player_${String(family).replace(/^player_/, "")}`;
    const forward = /share-level|opportunity/.test(String(modelVersion ?? "")) ? forwardReceipt?.families?.[forwardKey] ?? null : null;
    const slate = { candidates: s.candidates, modelProbability: s.modelProbability, roleConfirmed: s.roleConfirmed, priced: s.priced, settlementProven: s.settlementProven };
    return deriveFamilyGate({ sport: "nfl", family, publicationState: familyState?.get?.(family) ?? null, modelVersion, forward, slate, grants });
  });
}
