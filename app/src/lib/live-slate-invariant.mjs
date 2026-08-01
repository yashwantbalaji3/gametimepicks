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

  const status = sim?.status ?? null;
  const level = sim?.completeness?.level ?? null;
  const declaresPartial =
    status === "unavailable" || status === "pending" || level === "unavailable" || level === "partial";
  if (!declaresPartial) return SIM_STATES.OVERSTATED;

  return SIM_STATES.LEGITIMATE;
}
