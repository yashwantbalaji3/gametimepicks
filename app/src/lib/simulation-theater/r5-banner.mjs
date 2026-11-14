/**
 * SIMULATION THEATER · the R5 scenario banner (eligibility@1 R5, lib/availability/eligibility.mjs gameEligibility). PURE.
 * A game whose official forecast of record is blind to a starting quarterback's absence shows, above the replay, that
 * every run is a scenario and why. Only the QB-blind case carries a banner (founder rule R5; PD row E).
 */
import { gameEligibility } from "../availability/eligibility.mjs";

export const R5_BANNER_TITLE = "Scenario only";
export const R5_BANNER_REASON = "the official forecast for this game does not account for a starting quarterback's absence (availability rule R5), so these runs are hypothetical scenarios and feed no product.";

/** @param {{ teamInputs?: { state?: string } } | null} forecast  the official forecast of record */
export function r5TheaterBanner(forecast) {
  const v = gameEligibility(forecast ?? {});
  return v.reasons.includes("R5_QB_BLIND") ? { code: "R5_QB_BLIND", title: R5_BANNER_TITLE, reason: R5_BANNER_REASON } : null;
}
