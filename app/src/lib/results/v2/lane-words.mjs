/**
 * RESULTS V2 · THE WORDS FOR A PRODUCT LANE AND ITS LEGS (Session 3) — one owner for the Results day page, Ask's evidence
 * and Ask's cards, so a lane can never read one way on /results/date/<d>/ and another in Ask.
 *
 * Two states were rendered as something they are not:
 *
 * 1. A lane the receipt records as `status: "awaiting"` with NO legs. The ledger's own words for that state are "awaiting
 *    the next qualified card (no card placed)", and the settlement collector skips it because "awaiting/candidate carry no
 *    exposure" (scripts/_settlement-collect.mjs). The day page and Ask said "Pending — not settled yet" over an empty leg
 *    table — an open bet that never existed (09-29: all four lanes; 09-30: Moonshot A).
 * 2. A leg still "pending" inside a lane that is already decided (09-23 Bank Builder B: lost on another leg; the catch-up
 *    never re-grades a decided lane). It read "Pending — not settled yet" beside "Lost".
 *
 * Both are COPY: no grade, no settlement rule and no money changes. The receipt's own fields decide each state.
 */

/** A lane's display state: the owner's result, except a no-card lane, which is "awaiting" (the receipt's own status). */
export function laneState(lane) {
  const legs = Array.isArray(lane?.legs) ? lane.legs.length : 0;
  if (lane?.status === "awaiting" && legs === 0) return "awaiting";
  return String(lane?.result ?? lane?.status ?? "pending");
}

/** A lane whose outcome is settled — its remaining legs can no longer change it. */
export const LANE_DECIDED = Object.freeze(new Set(["won", "lost", "void", "push"]));

/** A leg's display state: "pending" inside a decided lane is "not-graded" — never a loss, never re-graded here. */
export function legState(legResult, laneResult) {
  const r = String(legResult ?? "pending");
  return r === "pending" && LANE_DECIDED.has(String(laneResult)) ? "not-graded" : r;
}

/** Long form — the Results day page. */
export const LANE_WORD = Object.freeze({
  won: "Won",
  lost: "Lost",
  void: "Void",
  push: "Push",
  pending: "Pending — not settled yet",
  active: "Open — a leg is still pending",
  awaiting: "No card placed",
  "not-graded": "Not graded — lane already decided",
});

/** The sentence under a no-card lane, in the ledger's own terms. */
export const AWAITING_NOTE = "No card was placed for this lane on this day — it was awaiting its next qualified card, so nothing settled.";
