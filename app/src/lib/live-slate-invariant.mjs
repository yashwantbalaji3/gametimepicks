/**
 * Live-slate invariant classifier (Program 092-095 Lane C).
 *
 * A full-game simulation exists for every SCHEDULED game (its canonical upstream is the board's
 * schedule + projections), while market rows (leans) appear only as books post odds through the
 * day. "No lean claims this gamePk" is therefore an ambiguous symptom: it is the normal morning
 * state of an evening game AND the signature of the 2026-07-28 identity disaster (both halves of
 * a doubleheader mapped to one gamePk; 824490 simulated-but-unreachable while its markets joined
 * the wrong game).
 *
 * This classifier separates the two WITHOUT weakening true-orphan detection. A lean-less sim is
 * legitimate only when ALL of:
 *   1. its gamePk is a scheduled game on the same board (canonical upstream exists),
 *   2. the board has NO gameId->gamePk collision that date (the 07-28 signature — any collision
 *      makes every unclaimed sim suspect),
 *   3. the sim carries NO market snapshot (market data with no market row = mis-join symptom),
 *   4. the sim honestly declares itself not fully available (public status must not present a
 *      partial state as complete).
 */

export const SIM_STATES = Object.freeze({
  CLAIMED: "CLAIMED_BY_MARKET_ROW",
  LEGITIMATE: "LEGITIMATE_PARTIAL_UPSTREAM",
  TRUE_ORPHAN: "TRUE_ORPHAN_NO_UPSTREAM_SOURCE",
  IDENTITY_CONFLICT: "IDENTITY_CONFLICT_ON_SLATE",
  UNSAFE_SOURCE: "POSTGAME_OR_UNSAFE_SOURCE",
  OVERSTATED: "PARTIAL_PRESENTED_AS_COMPLETE",
});

const HARD_FAILURES = new Set([
  SIM_STATES.TRUE_ORPHAN,
  SIM_STATES.IDENTITY_CONFLICT,
  SIM_STATES.UNSAFE_SOURCE,
  SIM_STATES.OVERSTATED,
]);

/*
 * The engine's own non-"ready" completeness members, plus the "pending" status the earlier version
 * of this check accepted. Anything outside this set is not a declaration of incompleteness.
 */
const DECLARED_INCOMPLETE = new Set(["degraded", "unavailable", "pending"]);

export function isHardFailure(state) {
  return HARD_FAILURES.has(state);
}

/**
 * Classify one simulated game against its date's board.
 *
 * @param {object} sim              the full-game simulation entry ({gamePk, market, status, ...})
 * @param {Set<number>} claimedPks  gamePks claimed by at least one market row (lean)
 * @param {Set<number>} boardPks    gamePks of all scheduled games on the board
 * @param {boolean} dateHasCollision  true when ANY gamePk on this board is claimed by >1 gameId
 * @returns {string} one of SIM_STATES
 */
export function classifySim(sim, claimedPks, boardPks, dateHasCollision) {
  const pk = sim?.gamePk;
  if (pk != null && claimedPks.has(pk)) return SIM_STATES.CLAIMED;

  // Unclaimed from here down.
  if (pk == null || !boardPks.has(pk)) return SIM_STATES.TRUE_ORPHAN;
  if (dateHasCollision) return SIM_STATES.IDENTITY_CONFLICT;
  if (sim?.market != null) return SIM_STATES.UNSAFE_SOURCE;

  /*
   * P224: THIS CHECKED A VOCABULARY THE PRODUCER DOES NOT SPEAK.
   *
   * The full-game engine's completeness level is `"ready" | "degraded" | "unavailable"`
   * (lib/mlb/full-game/types.ts). This accepted "unavailable" and "partial" — and "partial" is not
   * a member, so that arm was dead, while "degraded" (300 of the 474 committed sims) was missing
   * altogether. A degraded sim IS declaring itself not fully available: it carries the level, the
   * public status, and notes naming what is absent ("9 of 9 have no posted prop line and are priced
   * at replacement level").
   *
   * The mismatch only surfaced when a degraded sim went UNCLAIMED — gamePk 823176 on 2026-08-29,
   * the second half of a doubleheader whose market rows joined its twin — and the invariant called
   * an honest artifact OVERSTATED.
   *
   * Read against the producer's own vocabulary, as a CLOSED SET. A first pass here accepted
   * "anything not \"ready\"", which is the wrong direction: it would have read an unrecognised
   * level — `{status: "complete", level: "full"}` — as a declaration of partiality and let the
   * exact mutation this state exists to catch through. Absence of a known incompleteness claim is
   * not a claim of incompleteness; unknown vocabulary fails closed to OVERSTATED.
   */
  const status = sim?.status ?? null;
  const level = sim?.completeness?.level ?? null;
  const declaresPartial = DECLARED_INCOMPLETE.has(level) || DECLARED_INCOMPLETE.has(status);
  if (!declaresPartial) return SIM_STATES.OVERSTATED;

  return SIM_STATES.LEGITIMATE;
}
