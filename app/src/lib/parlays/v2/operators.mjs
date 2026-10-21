/**
 * PARLAY LAB V2 · THE OPERATOR SEAM — the ONE place V2 asks "may this sportsbook's price be shown?"
 *
 * STACKED ON PR #1130. The canonical allowlist (ELIGIBLE_OPERATOR_KEYS, isEligibleProvider,
 * BOOK_AVAILABILITY_NOTE) lives in `app/src/lib/sports/odds/eligible-operators.mjs`, which PR #1130 adds and which
 * is NOT on main. This branch deliberately does not copy that file. A static import of a missing module would break
 * the bundle, so until #1130 merges the seam FAILS CLOSED: `isVerifiedOperator` answers false for every label, and
 * every V2 surface shows "Price not verified" instead of a book name and price.
 *
 * WHEN #1130 LANDS (one-line change, nothing else in V2 moves):
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
  state: "AWAITING_PR_1130",
  source: null,
  note: "The verified-sportsbook list is not connected yet, so no sportsbook price is shown as verified.",
});

/**
 * The availability sentence printed beside any book name. Canonical owner after #1130 is its BOOK_AVAILABILITY_NOTE
 * (identical wording); this local copy exists only so the seam compiles without that file.
 */
export const BOOK_AVAILABILITY_NOTE = "Sportsbook availability varies by state.";

/** Fold a provider key or display title to one comparable token: "BetOnline.ag" → "betonlineag", "ESPN BET" → "espnbet". */
export function operatorToken(label) {
  return typeof label === "string" ? label.trim().toLowerCase().replace(/[^a-z0-9]/g, "") : "";
}

/** FAIL CLOSED until #1130: no label is a verified operator. */
export function isVerifiedOperator(_label) {
  return false;
}

/**
 * Build an operator predicate from an explicit allowlist of provider keys and/or display titles (tests, and the
 * eventual #1130 wiring). Unknown, empty and non-string labels are never eligible.
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
