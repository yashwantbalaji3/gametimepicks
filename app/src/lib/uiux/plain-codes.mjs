/**
 * Internal state CODES inside reader-facing sentences (2026-10-17).
 *
 * Several public sentences are not written by a component but carried in data: a registration's frozen
 * `nextEvaluationCondition` ("…running it earlier returns INSUFFICIENT_SAMPLE by design"), a ladder's refusal reason
 * ("the capability registry lists UFC as SCAFFOLD_ONLY"), an NFL family's withheld reason (RESEARCH_ONLY), a model
 * status detail (SECOND_LOOK_REJECTED — failed bar: …). Those records are history or producer output and are never
 * edited to suit a page; the page renders the codes in reader words instead. The map is CLOSED: an unknown code is
 * printed as written (a guard test lists every code that reaches the public export), so nothing is reworded by guess,
 * and every phrase keeps the code's meaning.
 */
export const PLAIN_CODES = Object.freeze({
  // Model-evaluation verdicts — quoted, because the sentence names a verdict (the readout's chip prints the same words).
  INSUFFICIENT_SAMPLE: "“insufficient sample”",
  INSUFFICIENT_COVERAGE: "“insufficient coverage”",
  WINDOW_NOT_OPEN: "“window not open”",
  PROMOTION_EARNED: "“promotion earned”",
  // Capability / lifecycle states.
  SCAFFOLD_ONLY: "early-stage (scaffold only)",
  RESEARCH_ONLY: "research only, not published as a forecast",
  PRIVATE_RESEARCH: "private research",
  BASELINE_ONLY: "baseline only",
  WATCHLIST_ONLY: "watchlist only",
  SHADOW_ELIGIBLE: "eligible for a private test",
  PROCEED_TO_FORWARD_SHADOW: "cleared for a private forward test",
  SECOND_LOOK_ELIGIBLE: "cleared on a second review",
  SECOND_LOOK_REJECTED: "not cleared on a second review",
});

const CODE = new RegExp(`\\b(${Object.keys(PLAIN_CODES).join("|")})\\b`, "g");

/** Replace known internal codes in a sentence with reader words; everything else is printed as written. */
export function plainCodes(text) {
  if (typeof text !== "string") return text;
  return text.replace(CODE, (code) => PLAIN_CODES[code]);
}
