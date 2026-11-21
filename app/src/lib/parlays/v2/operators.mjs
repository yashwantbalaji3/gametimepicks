/**
 * PARLAY LAB V2 · THE OPERATOR SEAM — the ONE place V2 asks "may this sportsbook's price be shown?"
 *
 * The canonical allowlist (ELIGIBLE_OPERATOR_KEYS, isEligibleProvider, BOOK_AVAILABILITY_NOTE) lives in
 * `app/src/lib/sports/odds/eligible-operators.mjs`. PR #1130 put that file on main; this seam was never connected to
 * it, so the seam still FAILS CLOSED: `isVerifiedOperator` answers false for every label, and every V2 surface shows
 * "Price not verified" instead of a book name and price. Connecting it opens verified prices on V2 surfaces, so it is
 * a deliberate change of its own, not a follow-up to that merge.
 *
 * TO CONNECT (one-line change, nothing else in V2 moves):
 *     import { isEligibleProvider, BOOK_AVAILABILITY_NOTE } from "../../sports/odds/eligible-operators.mjs";
 *     export const OPERATOR_SEAM = Object.freeze({ state: "CONNECTED", source: "eligible-operators@1" });
 *     export const isVerifiedOperator = isEligibleProvider;
 * and re-export BOOK_AVAILABILITY_NOTE in place of the local copy below.
 *
 * Every V2 function that needs the rule takes it as a PARAMETER (dependency injection) and defaults to this seam, so
 * tests exercise the eligible path with an injected allowlist (`makeOperatorPredicate`) while production stays closed.
 * Pure: no fs, no clock.
 */

/** Where the seam stands. The UI reads `state` to explain a board full of "Price not verified". */
export const OPERATOR_SEAM = Object.freeze({
  state: "NOT_CONNECTED",
  source: null,
  note: "The verified-sportsbook list is not connected yet, so no sportsbook price is shown as verified.",
});

/**
 * The availability sentence printed beside any book name. The canonical owner is eligible-operators.mjs's
 * BOOK_AVAILABILITY_NOTE (identical wording); this local copy stands until the seam is connected.
 */
export const BOOK_AVAILABILITY_NOTE = "Sportsbook availability varies by state.";

/** Fold a provider key or display title to one comparable token: "BetOnline.ag" → "betonlineag", "ESPN BET" → "espnbet". */
export function operatorToken(label) {
  return typeof label === "string" ? label.trim().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

/** FAIL CLOSED until the seam is connected: no label is a verified operator. */
export function isVerifiedOperator(_label) {
  return false;
}

/**
 * Build an operator predicate from an explicit allowlist of provider keys and/or display titles (tests, and the
 * eventual connection). Unknown, empty and non-string labels are never eligible.
 * @param {readonly string[]} allow
 * @returns {(label: unknown) => boolean}
 */
export function makeOperatorPredicate(allow) {
  const set = new Set((allow ?? []).map(operatorToken).filter(Boolean));
  return (label) => {
    const t = operatorToken(label);
    return t !== "" && set.has(t);
  };
}
