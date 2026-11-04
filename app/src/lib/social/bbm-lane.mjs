/**
 * BANK BUILDER & MOONSHOT CHALLENGE LANES V2, the graphics' view of a lane (SPEC ~/gtp-evidence/bbm-v2/SPEC.md rev. 2).
 * PURE: no I/O, no clock, no network.
 *
 * There is ONE fold of a lane: the engine's `laneDisplay` (challenge-lanes/display.mjs), which the website calls too, so
 * a step, rung, status, bankroll or pace can never be computed two ways. This module only shapes that result for a card:
 * which graphic the day gets (a card, a won step, a held day, a busted lane, a finished ladder), the event the image is
 * drawn from, and the pace line. It derives no number. A graphic shows the lane's latest day, the state laneDisplay folds.
 */
import { canonical, sha256, verifyChain } from "../challenge-lanes/chain.mjs";
import { laneDisplay, RUNG } from "../challenge-lanes/display.mjs";
import { LANES, laneState } from "../challenge-lanes/lanes.mjs";
import { decimalToAmerican } from "../challenge-lanes/payout.mjs";
import { verifyLaneProjection } from "../challenge-lanes/projection.mjs";

export { RUNG };
export const LANE_PROJECTION_SCHEMA = "gtp.challenge-lane.public@1";
/** Post order and lane letters (SPEC rev. 2 §5: two posts a day, A then B). Terms and packages are the engine's LANES. */
export const BBM_LANES = Object.freeze(Object.fromEntries(Object.entries(LANES).map(([id, L]) => [id, Object.freeze({ ...L, letter: L.slot, maxLegs: L.product === "bank-builder" ? 2 : null })])));
/** What the graphic draws for the day. IN_PLAY (a staked step not yet settled, with no new card) refuses. */
export const VIEW = Object.freeze({ CARD: "CARD", WON: "WON", NO_ELIGIBLE_CARD: "NO_ELIGIBLE_CARD", BUSTED: "BUSTED", COMPLETE: "COMPLETE", FINISHED_SHORT: "FINISHED_SHORT", IN_PLAY: "IN_PLAY" });
/** Public status vocabulary (SPEC rev. 2 §3), exactly laneDisplay's `status`. */
export const BADGE = Object.freeze({ ACTIVE: "ACTIVE", WON: "WON", LOST: "LOST", HELD: "HELD", COMPLETED: "COMPLETED", FINISHED_SHORT: "FINISHED SHORT" });
/**
 * Founder decision 2026-11-04 (SPEC §7, "USE OUR EXISTING THE ODDS API SUBSCRIPTION"): odds and calculated payouts may
 * appear on BBM V2 graphics (socialFeedPrices ON for these graphics only). They come only from the engine's private
 * PRICE_VERIFIED / PAYOUT_COMPUTED events; nothing here computes a price or a payout.
 */
export const P1_PRICE_SOURCE_DECIDED = true;

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
  return { state: d.pace.state === "on" ? "ON_PACE" : "BEHIND", shortfallCents: d.pace.behindCents ?? 0, milestoneCents: d.pace.milestoneCents, nextMilestoneCents: d.pace.nextMilestoneCents ?? d.rungs[d.step - 1]?.milestoneCents ?? null };
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
  // The image's source event is laneDisplay's: the day's CARD_FROZEN, or its latest STATUS.
  const eventOf = (type) => (d.day.sourceEventType === type ? d.day.sourceEventSha256 : null) ?? [...run.events].reverse().find((e) => e.type === type && e.date === date)?.sha256 ?? null;
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

/** A fixture price (the engine's FIXTURE-NOT-A-BOOK provider, or a book labelled SAMPLE) draws only with its SAMPLE ribbon. */
const isFixturePrice = (leg) => /^FIXTURE/i.test(String(leg?.provider ?? "")) || /SAMPLE PRICE|NOT REAL/i.test(String(leg?.book ?? ""));

/**
 * The verified price of the lane's card on `date`, read from the engine's private run log (SPEC §7), or null when the
 * card is not priced. `{ refused }` when the log cannot back a printed price. Checks: the chain verifies and is the run
 * the public file projects (same head); the PAYOUT_COMPUTED is VERIFIED and names this day's CARD_FROZEN and its own
 * PRICE_VERIFIED; that price covers exactly the card's legs; gross - profit = stake. Every number is the engine's.
 */
export function pricedDay(events, { date, doc = null }) {
  if (!Array.isArray(events) || !events.length) return { refused: "no private lane log" };
  if (!verifyChain(events).ok) return { refused: "the private lane log chain does not verify" };
  if (doc && doc.runs.at(-1).headSha256 !== events.at(-1).sha256) return { refused: "the private lane log is not the run the public file projects (head differs)" };
  const card = events.findLast((e) => e.type === "CARD_FROZEN" && e.date === date);
  if (!card) return null;
  const pc = events.findLast((e) => e.type === "PAYOUT_COMPUTED" && e.date === date && e.step === card.step);
  if (!pc) return null;
  // A refused payout leaves the card unpriced (the engine holds the lane); the graphic says it awaits verified prices.
  if (pc.result !== "VERIFIED") return { unpricedReason: `PAYOUT_COMPUTED ${pc.result}: ${(pc.refusals ?? []).map((r) => r.code ?? r).join(", ")}` };
  const pv = events.find((e) => e.type === "PRICE_VERIFIED" && e.sha256 === pc.inputs?.priceEventSha256);
  if (!pv) return { refused: "PAYOUT_COMPUTED names no PRICE_VERIFIED in this log" };
  if (pc.inputs.cardEventSha256 !== card.sha256 || pv.cardEventSha256 !== card.sha256) return { refused: "the price is not for this day's frozen card" };
  const legIds = card.card.legs.map((l) => String(l.legId)).sort();
  const priced = (pv.price?.legs ?? []).map((l) => String(l.legId)).sort();
  if (legIds.join() !== priced.join()) return { refused: "the price does not cover exactly the card's legs" };
  const ints = [pc.inputs.stakeCents, pc.grossPayoutCents, pc.profitCents];
  if (!ints.every(Number.isInteger) || pc.grossPayoutCents - pc.profitCents !== pc.inputs.stakeCents) return { refused: "PAYOUT_COMPUTED amounts do not hold (gross - profit = stake)" };
  const legs = Object.fromEntries(pv.price.legs.map((l) => [String(l.legId), { price: l.price, oddsFormat: l.oddsFormat, book: l.book, fetchedAt: l.fetchedAt }]));
  const books = [...new Set(pv.price.legs.map((l) => l.book))];
  const fetched = pv.price.legs.map((l) => l.fetchedAt).sort();
  const method = pc.inputs.method ?? pv.price.parlay?.method ?? null;
  return {
    stakeCents: pc.inputs.stakeCents, grossCents: pc.grossPayoutCents, profitCents: pc.profitCents,
    decimalPrice: pc.inputs.decimalPrice, combinedAmerican: decimalToAmerican(pc.inputs.decimalPrice), method,
    // Same-game legs have no book offer for the whole slip: their product is only an estimate (SPEC §7).
    estimate: method !== "LEG_PRODUCT", legs, books, capturedAt: fetched[0] ?? null,
    // Disclosed, never refused (SPEC rev. 2 §2): the engine's own combined price under its own required pace multiple.
    belowPace: typeof pc.inputs.pace === "number" && typeof pc.inputs.decimalPrice === "number" ? pc.inputs.decimalPrice < pc.inputs.pace : null,
    fixture: pv.price.legs.some(isFixturePrice), payoutEventSha256: pc.sha256, priceEventSha256: pv.sha256,
  };
}

/** The tracked bankroll from the private log (the engine's laneState fold), for a priced lane whose public file withholds it. */
export const privateBankrollCents = (events) => laneState(events).bankrollCents;
