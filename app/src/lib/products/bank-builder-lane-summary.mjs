/**
 * BANK BUILDER · ONE LANE SUMMARY FOR EVERY SURFACE. Node-only (reads the committed receipts through ladder-position).
 *
 * Audit F10 (2026-10-23): Home, Today and /bank-builder described the ladder differently. Home summarised Lane A from
 * the placed-card receipts ("awaiting Step 2"); Today summarised Lane A from the dual-ladder store frozen since
 * 2026-08-17 ("awaiting Step 1", which happened to be Lane B's real step); /bank-builder showed both lanes from the
 * receipts. Neither summary named its lane.
 *
 * This reads BOTH lanes from the same owner /bank-builder uses (products/ladder-position.mjs over the committed
 * receipts) and names each one, so every summary that calls it states the same thing: "Lane A awaiting Step 2 · Lane B
 * awaiting Step 1". A lane whose card is still open says so ("Lane A Step 2 card open"). With no placed receipt at all
 * there is no position to report, and the caller keeps its own fallback.
 */
import { positionFromReceipts, readReceipts } from "./ladder-position.mjs";

export const LANES = Object.freeze(["A", "B"]);

/**
 * @param {{ receipts: object[], ladder: ReadonlyArray<{ step: number, start: number, goal: number }> }} input
 * @returns {{ lanes: Array<{ lane: string, nextStep: number, state: string }>, phrase: string|null }}
 */
export function bankBuilderLaneSummaryFrom({ receipts, ladder }) {
  if (!Array.isArray(ladder) || !ladder.length) return { lanes: [], phrase: null };
  const lanes = LANES.map((lane) => {
    const p = positionFromReceipts({ receipts, product: "bank-builder", lane, ladder, seed: ladder[0].start });
    return { lane, nextStep: p.nextStep, state: p.state, placed: Boolean(p.basis) };
  });
  if (!lanes.some((l) => l.placed)) return { lanes, phrase: null };
  const phrase = lanes.map((l) => (l.state === "held" ? `Lane ${l.lane} Step ${l.nextStep} card open` : `Lane ${l.lane} awaiting Step ${l.nextStep}`)).join(" · ");
  return { lanes, phrase };
}

/** The same, reading the committed receipts dated strictly before `today` (the generator's own rule). */
export function bankBuilderLaneSummary({ dataRoot, today, ladder }) {
  return bankBuilderLaneSummaryFrom({ receipts: readReceipts(dataRoot, today), ladder });
}
