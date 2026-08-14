/**
 * NFL paper-product eligibility (Program 177 · Release C).
 *
 * Answers one reader question the site could not previously answer: "you publish NFL simulations —
 * why is there no NFL in Bank Builder, Moonshot or the Vault?" Before this, the answer existed
 * only as an absence. An absence is indistinguishable from an oversight, and readers correctly
 * read silence as "nobody looked".
 *
 * This evaluates every current NFL event against the SAME gate the money path enforces
 * (`permitsProductLeg`, true only for VALIDATED_PICK) and produces a typed, dated verdict per
 * product with the reason in words and the list of things that would change it.
 *
 * Two rules make the verdict honest rather than decorative:
 *
 *   1. NOTHING QUALIFIES BY DEFAULT. A product is eligible only if at least one event passes the
 *      gate. Zero passing events is EVALUATED_NONE_QUALIFY, which is a real finding — distinct
 *      from NO_EVENTS ("there was nothing to look at"), which is not.
 *   2. THE MACHINERY IS PROVEN, NOT ASSUMED. The evaluator has no NFL-specific escape hatch: hand
 *      it a hypothetical validated event and it qualifies. Its guard test does exactly that, so
 *      today's refusal is demonstrably the gate and not an unimplemented branch.
 *
 * Pure: no fs, no fetch, no clock of its own.
 */

import { permitsProductLeg } from "./output-state.mjs";

/** Closed set. A caller that sees anything else has a defect, not a new case. */
export const PRODUCT_ELIGIBILITY_STATES = Object.freeze([
  "ELIGIBLE",              // at least one event passes the product-leg gate
  "EVALUATED_NONE_QUALIFY", // the evaluator ran over real events and none passed
  "NO_EVENTS",             // there was nothing to evaluate — not a finding about the model
  "PRODUCT_GATED",         // the product itself is held for a reason of its own (e.g. the Vault)
]);

const WHAT_WOULD_QUALIFY = Object.freeze([
  "an NFL model version that meets its own preregistered promotion bar on held-out data",
  "enough settled experimental forecasts to measure whether it is calibrated",
  "an explicit validated block on the forecast — the classifier requires one and the public-beta engine never emits it",
]);

/**
 * @param {object} p
 * @param {Array<object>} p.events   canonical index events (each carries `state` and `lifecycle`)
 * @param {string} p.nowIso
 * @param {{state: string, reason: string}|null} [p.vault] the End Zone Vault's own current outcome
 */
export function evaluateNflProductEligibility({ events, nowIso, vault = null }) {
  const now = Date.parse(nowIso);
  if (!Number.isFinite(now)) throw new Error("evaluateNflProductEligibility: nowIso must be a real instant");

  // Only PRE-KICKOFF events can ever be a leg. A started game is not a "failed" candidate — it is
  // not a candidate at all, and counting it as one would understate how much was actually examined.
  const rows = (events ?? []).map((e) => {
    const started = e.lifecycle === "STARTED" || e.lifecycle === "SETTLED";
    const passes = !started && permitsProductLeg(e.state);
    return {
      canonicalEventId: e.canonicalEventId,
      matchup: e.matchup,
      kickoffUtc: e.kickoffUtc,
      state: e.state,
      considered: !started,
      qualifies: passes,
      reason: started
        ? "already kicked off — never a candidate for a paper card"
        : passes
          ? "classified VALIDATED_PICK — permitted as a product leg"
          : `classified ${e.state}; only VALIDATED_PICK may become a product leg`,
    };
  });

  const considered = rows.filter((r) => r.considered);
  const qualifying = considered.filter((r) => r.qualifies);

  const teamVerdict = (product, label, note) => {
    if (considered.length === 0) {
      return { product, label, state: "NO_EVENTS", eligible: false, consideredEvents: 0, qualifyingEvents: 0,
        reason: "no pre-kickoff NFL event was available to evaluate — this says nothing about the model", whatWouldQualify: [] };
    }
    if (qualifying.length === 0) {
      return { product, label, state: "EVALUATED_NONE_QUALIFY", eligible: false,
        consideredEvents: considered.length, qualifyingEvents: 0,
        reason: `${considered.length} pre-kickoff NFL game${considered.length === 1 ? " was" : "s were"} evaluated and none qualified: ${note}`,
        whatWouldQualify: [...WHAT_WOULD_QUALIFY] };
    }
    return { product, label, state: "ELIGIBLE", eligible: true,
      consideredEvents: considered.length, qualifyingEvents: qualifying.length,
      reason: `${qualifying.length} NFL game${qualifying.length === 1 ? "" : "s"} passed the product-leg gate`,
      whatWouldQualify: [] };
  };

  const note = "the NFL model is an explicitly experimental preseason beta, and only a validated model version may contribute a leg to a paper card";

  const products = [
    teamVerdict("bank-builder", "Bank Builder", note),
    teamVerdict("moonshot", "Moonshot", note),
    // The card builder asks the same question of the same gate, so it gets the same answer here.
    // build-legs.ts states it in its own words for the /build surface; a guard asserts the two
    // never drift, rather than coupling a .ts module into this pure evaluator.
    teamVerdict("build-inventory", "Card builder", note),
  ];

  // The Vault is NOT evaluated by this gate — it is a player product with its own state machine and
  // its own reasons (market absence, role evidence). Re-deciding it here would create a second
  // source of truth for the same product, which is the failure the canonical index exists to stop.
  products.push(
    vault
      ? { product: "end-zone-vault", label: "End Zone Vault", state: "PRODUCT_GATED", eligible: vault.state === "ACTIVE",
          consideredEvents: considered.length, qualifyingEvents: vault.state === "ACTIVE" ? 1 : 0,
          reason: `the Vault reports ${vault.state} on its own evaluation: ${vault.reason}`, whatWouldQualify: [] }
      : { product: "end-zone-vault", label: "End Zone Vault", state: "NO_EVENTS", eligible: false,
          consideredEvents: 0, qualifyingEvents: 0,
          reason: "the Vault produced no outcome for this window", whatWouldQualify: [] },
  );

  return {
    evaluatedAt: nowIso,
    gate: "output-state.permitsProductLeg — true only for VALIDATED_PICK",
    consideredEvents: considered.length,
    qualifyingEvents: qualifying.length,
    events: rows,
    products,
    plainEnglish:
      qualifying.length === 0 && considered.length > 0
        ? "We looked at every NFL game on the slate today and none of them may enter a paper card. That is the rule working, not a gap: the NFL model is still experimental, and an experimental forecast is never allowed to become a product leg no matter how confident it looks."
        : qualifying.length > 0
          ? "At least one NFL game passed the product-leg gate."
          : "There was no pre-kickoff NFL game to evaluate.",
  };
}
