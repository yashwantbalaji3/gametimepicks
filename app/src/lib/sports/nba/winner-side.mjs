/**
 * THE PREGAME WINNER SIDE (Stage 12-S1). PURE, no I/O, never reads an outcome.
 *
 * Stage 3 Q3 (founder, 2026-10-06): every winner-capable forecast freezes `publishedSide` or `TOO_CLOSE` before
 * the start, and no Results reader may infer a side afterwards. Until this slice an NBA receipt froze two winner
 * probabilities (`elo.pHome`, `sim.pHome`) and no side, so every NBA winner row could only ever be NO_PICK.
 *
 * Founder decisions (Yash, 2026-10-07 03:21Z):
 *   N2  Elo sets the frozen winner side for the initial generation, and the exact model generation is recorded
 *       beside every frozen side so a later challenger can be compared against it.
 *   N4  (open) no abstention band: only an exact 0.5 is TOO_CLOSE — the same rule as NFL F3D-1.
 *
 * The side is computed at write time, inside the receipt, so the payload hash freezes it with the probability.
 */

export const TOO_CLOSE = "TOO_CLOSE"; // the Stage 3A helper's word
export const WINNER_HEADS = Object.freeze(["sim", "elo"]);
export const DECIDED_WINNER_HEAD = "elo"; // N2
export const WINNER_SIDE_RULE = "nba-winner-side@1";

/**
 * @param forecast    a game's forecast block ({ elo: { pHome }, sim: { pHome } })
 * @param head        "elo" | "sim" — which frozen probability is the winner forecast of record
 * @param generation  the exact model version that produced the probability (N2)
 * @returns {{ publishedSide: "HOME"|"AWAY"|"TOO_CLOSE"|null, sideRule }}  null = the head's probability is missing
 */
export function frozenWinnerSide(forecast, { head = DECIDED_WINNER_HEAD, generation = null } = {}) {
  if (!WINNER_HEADS.includes(head)) throw new Error(`nba winner side: head must be one of ${WINNER_HEADS.join("/")}, got ${head}`);
  const p = forecast?.[head]?.pHome;
  const sideRule = { id: WINNER_SIDE_RULE, head, tooClose: "exact 0.5 only (no band; N4 open)", generation: generation == null ? null : String(generation) };
  if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) return { publishedSide: null, sideRule };
  return { publishedSide: p === 0.5 ? TOO_CLOSE : p > 0.5 ? "HOME" : "AWAY", sideRule };
}
