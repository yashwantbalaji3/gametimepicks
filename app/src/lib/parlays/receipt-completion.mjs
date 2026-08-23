/**
 * COMPLETING A SETTLEMENT IS NOT REWRITING ONE.
 *
 * The lab settler refuses to overwrite a receipt that differs from the one on disk, and that
 * refusal is correct and load-bearing: a settled day must never be silently restated. But it made
 * every day with a PENDING card permanently unfinishable. Once a receipt exists saying "pending",
 * results arriving later produce a receipt that differs, the settler refuses, and the card is
 * orphaned — no scheduled run will revisit it either, because settlement targets ET-yesterday and
 * only ET-yesterday.
 *
 * That is not hypothetical. The 2026-08-22 UFC cards settled as pending at 05:53 because the only
 * results source the settler read was days behind. By the time our own ESPN capture supplied the
 * winners, the day was closed to correction, and those three cards would have sat pending forever
 * while the Lab's published record computed over the cards that happened to settle on time.
 *
 * THE DISTINCTION THIS DRAWS:
 *
 *   NO_CHANGE        the receipts are identical — nothing to do.
 *   COMPLETION_ONLY  every difference is a card moving OUT of pending into a decided outcome, and
 *                    nothing else about any card moved. Safe to write.
 *   REWRITE          anything else — a decided outcome changing, a card appearing or vanishing, a
 *                    price or leg set differing. Refused, loudly, as before.
 *
 * The asymmetry is deliberate. pending → decided adds information that did not exist before, and
 * every other transition replaces information that did. A decided outcome never moves, not even
 * back to pending: a source that stops answering must not be able to un-settle a graded card.
 */

export const RECEIPT_CHANGE = Object.freeze({
  NO_CHANGE: "NO_CHANGE",
  COMPLETION_ONLY: "COMPLETION_ONLY",
  REWRITE: "REWRITE",
});

const PENDING = "pending";
const idOf = (c) => String(c?.slipId ?? "");
/*
 * Everything about a card except its OUTCOMES. A card carries two of them: its own `result` and a
 * positional `legs` array of per-leg results. Both move together when a card completes — a card
 * cannot go from pending to loss while its legs stay pending — so both are excluded here and both
 * are checked under the same asymmetric rule below. Missing the leg array made the first version
 * refuse every real completion as "legs or prices moved".
 */
const withoutResults = (c) => { const { result, legs, ...rest } = c ?? {}; return JSON.stringify(rest); };

/**
 * pending → decided is a completion; anything else is a rewrite. Applied identically to a card's
 * own result and to each of its legs, because a leg that was graded must not be re-graded either.
 */
function classifyOutcomeMove(id, label, from, to, completed, reasons) {
  const f = String(from ?? PENDING), t = String(to ?? PENDING);
  if (f === t) return;
  if (f === PENDING) { completed.push({ slipId: id, label, from: f, to: t }); return; }
  reasons.push(`${label} on card ${id} was settled ${f} and this run says ${t}`);
}

/**
 * @param {Array<object>} prior  cards from the receipt already on disk
 * @param {Array<object>} next   cards this run produced
 * @returns {{ state: string, completed: Array<{slipId: string, from: string, to: string}>, reasons: string[] }}
 */
export function classifyReceiptChange(prior, next) {
  const reasons = [];
  const a = new Map((prior ?? []).map((c) => [idOf(c), c]));
  const b = new Map((next ?? []).map((c) => [idOf(c), c]));

  for (const id of a.keys()) if (!b.has(id)) reasons.push(`card ${id} is on the recorded receipt and missing from this run`);
  for (const id of b.keys()) if (!a.has(id)) reasons.push(`card ${id} appeared in this run and is not on the recorded receipt`);

  const completed = [];
  for (const [id, before] of a) {
    const after = b.get(id);
    if (!after) continue;
    if (withoutResults(before) !== withoutResults(after)) {
      reasons.push(`card ${id} differs in more than its outcomes — legs or prices moved`);
      continue;
    }
    const beforeLegs = before.legs ?? [], afterLegs = after.legs ?? [];
    if (beforeLegs.length !== afterLegs.length) {
      reasons.push(`card ${id} had ${beforeLegs.length} legs and this run has ${afterLegs.length}`);
      continue;
    }
    // A decided outcome never moves — not to another outcome, and not back to pending. A source
    // that stops answering must not be able to un-settle a card that was already graded.
    classifyOutcomeMove(id, "the card", before.result, after.result, completed, reasons);
    for (let i = 0; i < beforeLegs.length; i += 1) {
      classifyOutcomeMove(id, `leg ${i + 1}`, beforeLegs[i], afterLegs[i], completed, reasons);
    }
  }

  if (reasons.length) return { state: RECEIPT_CHANGE.REWRITE, completed, reasons };
  if (completed.length === 0) return { state: RECEIPT_CHANGE.NO_CHANGE, completed, reasons };
  return { state: RECEIPT_CHANGE.COMPLETION_ONLY, completed, reasons };
}
