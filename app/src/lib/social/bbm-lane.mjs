/**
 * BANK BUILDER & MOONSHOT CHALLENGE LANES V2, the graphics' view of a lane (SPEC ~/gtp-evidence/bbm-v2/SPEC.md rev. 2).
 * PURE: no I/O, no clock, no network.
 *
 * There is ONE fold of a lane: the engine's `laneDisplay` (challenge-lanes/display.mjs), which the website calls too, so
 * a step, rung, status, bankroll or pace can never be computed two ways. This module only shapes that result for a card:
 * which graphic the day gets (a card, a won step, a held day, a busted lane, a finished ladder), the event the image is
 * drawn from, and the pace line. It derives no number. A graphic shows the lane's latest day, the state laneDisplay folds.
 */
import { canonical, sha256 } from "../challenge-lanes/chain.mjs";
import { laneDisplay, RUNG } from "../challenge-lanes/display.mjs";
import { LANES } from "../challenge-lanes/lanes.mjs";
import { verifyLaneProjection } from "../challenge-lanes/projection.mjs";

export { RUNG };
export const LANE_PROJECTION_SCHEMA = "gtp.challenge-lane.public@1";
/** Post order and lane letters (SPEC rev. 2 §5: two posts a day, A then B). Terms and packages are the engine's LANES. */
export const BBM_LANES = Object.freeze(Object.fromEntries(Object.entries(LANES).map(([id, L]) => [id, Object.freeze({ ...L, letter: L.slot, maxLegs: L.product === "bank-builder" ? 2 : null })])));
/** What the graphic draws for the day. IN_PLAY (a staked step not yet settled, with no new card) refuses. */
export const VIEW = Object.freeze({ CARD: "CARD", WON: "WON", NO_ELIGIBLE_CARD: "NO_ELIGIBLE_CARD", BUSTED: "BUSTED", COMPLETE: "COMPLETE", FINISHED_SHORT: "FINISHED_SHORT", IN_PLAY: "IN_PLAY" });
/** Public status vocabulary (SPEC rev. 2 §3), exactly laneDisplay's `status`. */
export const BADGE = Object.freeze({ ACTIVE: "ACTIVE", WON: "WON", LOST: "LOST", HELD: "HELD", COMPLETED: "COMPLETED", FINISHED_SHORT: "FINISHED SHORT" });
/** Founder blocker P1 (SPEC §7): no permitted price source, so no price-derived number reaches an exported graphic. */
export const P1_PRICE_SOURCE_DECIDED = false;

/** Seal a projection the way the engine does (verifyLaneProjection's rule); test fixtures only. */
export const sealProjection = (doc) => { const { contentSha256: _c, ...rest } = doc; return { ...rest, contentSha256: sha256(canonical(rest)) }; };

/** [] when the file verifies and carries the lane's fixed terms with prices withheld. */
export function projectionViolations(doc) {
  if (!verifyLaneProjection(doc)) return ["the lane file does not verify (verifyLaneProjection)"];
  const L = LANES[doc.laneId];
  if (!L) return [`unknown lane ${doc.laneId}`];
  const v = [];
  for (const k of ["product", "slot", "baseCents", "targetCents", "steps"]) if (doc[k] !== L[k]) v.push(`${k} ${doc[k]} is not ${L[k]} for ${doc.laneId}`);
  if (doc.prices?.state !== "WITHHELD_P1") v.push(`prices ${doc.prices?.state}: a public projection withholds prices`);
  return v;
}

/** laneDisplay's pace in the card's shape; the next milestone is the current step's. */
function paceOf(d) {
  if (!d.pace) return null;
  if (d.pace.state === "withheld") return { state: "WITHHELD" };
  return { state: d.pace.state === "on" ? "ON_PACE" : "BEHIND", shortfallCents: d.pace.behindCents ?? 0, milestoneCents: d.pace.milestoneCents, nextMilestoneCents: d.rungs[d.step - 1]?.milestoneCents ?? null };
}

/**
 * The graphic's view of one lane on one ET posting date. Throws on a file that does not verify; `view: null` with a
 * reason when there is nothing to draw (not the lane's latest day, a step in play, no card yet).
 */
export function laneView(doc, date) {
  const bad = projectionViolations(doc);
  if (bad.length) throw new Error(`lane projection refused:\n  - ${bad.join("\n  - ")}`);
  const L = BBM_LANES[doc.laneId];
  const run = doc.runs.at(-1);
  const d = laneDisplay(doc, { date });
  const base = { laneId: doc.laneId, product: doc.product, letter: L.letter, date, baseCents: d.baseCents, targetCents: d.targetCents, steps: d.steps, payout: null };
  if (!d.day) return { ...base, view: null, reason: `no day ${date} in ${doc.laneId}` };
  if (run.days.at(-1).date !== date) return { ...base, view: null, reason: `${date} is not the lane's latest day (${run.days.at(-1).date}); a graphic shows the lane as it stands` };
  const eventOf = (type) => [...run.events].reverse().find((e) => e.type === type && e.date === date)?.sha256 ?? null;
  const v = { ...base, runId: d.runId, step: d.step, rungs: d.rungs, cleared: d.rungs.filter((r) => r.state === RUNG.COMPLETED).length, bankrollCents: d.trackedBankrollCents, bankrollWithheld: d.trackedBankrollWithheld, pace: paceOf(d), staked: d.day.staked === true, badge: d.status, dayStatus: d.day.status, reason: d.day.reason ?? d.reason };
  if (!Object.values(BADGE).includes(d.status)) return { ...v, view: null, reason: `status ${d.status} is not in the public vocabulary` };
  if (d.status === BADGE.LOST) {
    const lost = d.history.findLast((x) => x.stepOutcome === "LOSS");
    return { ...v, view: VIEW.BUSTED, bustedAt: { step: lost?.step ?? d.step, date: lost?.date ?? null }, step: lost?.step ?? d.step, card: lost?.card ?? null, legResults: lost?.legResults ?? [], eventSha256: eventOf("STATUS") ?? eventOf("STEP_SETTLED") };
  }
  if (d.status === BADGE.COMPLETED) return { ...v, view: VIEW.COMPLETE, card: null, eventSha256: eventOf("STATUS") };
  if (d.status === BADGE.FINISHED_SHORT) return { ...v, view: VIEW.FINISHED_SHORT, card: null, eventSha256: eventOf("STATUS") };
  if (d.day.stepOutcome === "WIN") return { ...v, view: VIEW.WON, step: d.day.step, card: d.day.card, legResults: d.day.legResults, eventSha256: eventOf("CARD_FROZEN") };
  if (d.day.card) return { ...v, view: VIEW.CARD, card: d.day.card, eventSha256: eventOf("CARD_FROZEN") };
  if (d.inPlay) return { ...v, view: VIEW.IN_PLAY, card: null, reason: `step ${d.step} is in play and has not settled` };
  if (d.status === BADGE.HELD) return { ...v, view: VIEW.NO_ELIGIBLE_CARD, card: null, eventSha256: eventOf("STATUS") };
  return { ...v, view: null, card: null, reason: `${d.status}: no card frozen for ${date} yet` };
}
