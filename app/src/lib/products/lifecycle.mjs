/**
 * THE TRANSITION CONTRACT FOR BANK BUILDER AND MOONSHOT.
 *
 * Both products are step ladders: a card is frozen before its first event, graded from official
 * results, and the outcome decides whether the ladder advances a rung or starts over. That contract
 * was described in prose across several artifacts and implemented nowhere — which is one reason two
 * lanes and a Moonshot card sat pending from 2026-08-17 to 2026-09-05 without anything noticing.
 *
 * This module is the contract, and it is deliberately pure: no filesystem, no clock, no network. It
 * decides, given leg outcomes and a current position, what the next position is. Everything that
 * reads a box score or writes an artifact lives elsewhere and calls in here, so the rules can be
 * tested exhaustively without a fixture repo.
 *
 * THE NEUTRAL CASE, which is the one that gets products into trouble. A card whose legs all push (a
 * line landing exactly on the number, a voided market) returned no money and lost none. Treating it
 * as a win advances a ladder that never cleared its rung; treating it as a loss realizes a loss that
 * never happened; leaving it pending strands it forever, which is precisely the failure this program
 * exists to fix. It is its own outcome — VOID — and it holds position: same cycle, same step, card
 * closed, seed returned. The charter's words: a documented non-advancing paper state.
 */

/** A single leg's graded outcome. `pending` and `unavailable` are distinct: pending means the result
 *  has not arrived yet, unavailable means we could not obtain it (a scratch, a missing box score). */
export const LEG = Object.freeze({
  WON: "won", LOST: "lost", PUSH: "push", PENDING: "pending", UNAVAILABLE: "unavailable",
});

export const CARD = Object.freeze({
  WON: "won", LOST: "lost", VOID: "void", PENDING: "pending",
});

export const TRANSITION = Object.freeze({
  ADVANCE: "advance",   // won — next rung of the same cycle
  RESTART: "restart",   // lost — this cycle closes, the next one opens at step 1
  HOLD: "hold",         // pending — nothing decided yet
  NEUTRAL: "neutral",   // all push/void — position unchanged, card closed, seed returned
});

/**
 * Grade a card from its leg outcomes.
 *
 * ORDER MATTERS AND IS NOT ARBITRARY. A lost leg settles the card immediately — a parlay with a
 * losing leg cannot be saved by a leg that has not finished, so a single loss decides the card even
 * while other legs are pending. That is the one early decision the products' rules permit, and it is
 * why it is checked first. Everything else waits for every leg.
 */
export function gradeCard(legResults) {
  const legs = [...(legResults ?? [])];
  if (legs.length === 0) return CARD.PENDING;         // an empty card is not a won card
  if (legs.includes(LEG.LOST)) return CARD.LOST;      // decided, even with legs outstanding
  if (legs.some((r) => r === LEG.PENDING || r === LEG.UNAVAILABLE)) return CARD.PENDING;
  if (legs.every((r) => r === LEG.PUSH)) return CARD.VOID;
  // Every leg has finished, none lost, not all pushed: the remainder are wins and pushes. A push is
  // not a win, but it does not block one — the card returns on its winning legs.
  return legs.every((r) => r === LEG.WON || r === LEG.PUSH) ? CARD.WON : CARD.PENDING;
}

const CARD_TO_TRANSITION = Object.freeze({
  [CARD.WON]: TRANSITION.ADVANCE,
  [CARD.LOST]: TRANSITION.RESTART,
  [CARD.VOID]: TRANSITION.NEUTRAL,
  [CARD.PENDING]: TRANSITION.HOLD,
});

/**
 * Advance a ladder position by one settled card.
 *
 * @param {{cycle: number, step: number, maxStep?: number}} position
 * @param {string} cardResult one of CARD
 * @returns {{cycle: number, step: number, transition: string, closedCycle: boolean, reason: string}}
 *
 * A ladder that clears its final rung has COMPLETED the cycle: it does not grow a step it does not
 * have. It closes and the next cycle opens at step 1, the same shape a loss produces — the money
 * differs entirely, the position does not.
 */
export function nextPosition(position, cardResult) {
  const cycle = Number(position?.cycle ?? 1);
  const step = Number(position?.step ?? 1);
  const maxStep = Number(position?.maxStep ?? Infinity);
  const transition = CARD_TO_TRANSITION[cardResult];
  if (!transition) throw new Error(`not a card result: ${JSON.stringify(cardResult)}`);

  if (transition === TRANSITION.HOLD) {
    return { cycle, step, transition, closedCycle: false, reason: "no leg outcome is final yet — the card holds its rung" };
  }
  if (transition === TRANSITION.NEUTRAL) {
    return { cycle, step, transition, closedCycle: false, reason: "every leg pushed — the seed is returned and the rung is unchanged" };
  }
  if (transition === TRANSITION.RESTART) {
    return { cycle: cycle + 1, step: 1, transition, closedCycle: true, reason: `card lost — cycle ${cycle} closes and cycle ${cycle + 1} opens at step 1` };
  }
  if (step >= maxStep) {
    return { cycle: cycle + 1, step: 1, transition, closedCycle: true, reason: `card won and cleared the final rung ${step} — cycle ${cycle} completes and cycle ${cycle + 1} opens at step 1` };
  }
  return { cycle, step: step + 1, transition, closedCycle: false, reason: `card won — cycle ${cycle} advances to step ${step + 1}` };
}

/**
 * The durable identity of one settled card.
 *
 * Two different jobs must never be able to create competing cards for the same rung, and applying
 * the same settlement twice must be a no-op rather than a second advance. Every field here is part
 * of what makes a rung unique: the slate date is included because a cycle can revisit step 1, and
 * without it a restart would collide with the card that caused it.
 */
export function cardIdentity({ product, lane, cycle, step, slateDate }) {
  for (const [k, v] of Object.entries({ product, lane, cycle, step, slateDate })) {
    if (v === null || v === undefined || v === "") throw new Error(`card identity needs ${k}`);
  }
  return `${product}:${String(lane).toLowerCase()}:c${cycle}:s${step}:${slateDate}`;
}

/**
 * Would applying this settlement change anything?
 *
 * The settler calls this before writing. A card already carrying a decided result is never re-graded
 * — not to a different outcome and not back to pending — which is the same asymmetry the parlay
 * receipt classifier enforces: arriving information may complete a record, never restate one.
 */
export function settlementIsNew(recordedResult, incomingResult) {
  const rec = recordedResult ?? null;
  if (incomingResult === CARD.PENDING) return false;          // pending never overwrites anything
  if (rec === null || rec === CARD.PENDING) return true;      // first real outcome
  return false;                                                // already decided — hands off
}
