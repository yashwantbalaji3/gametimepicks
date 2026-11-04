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
import { lanePriceDisplay, socialPricesAuthorized } from "../challenge-lanes/price-display.mjs";
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
 * appear on BBM V2 graphics, from the engine's private price fold only; nothing here computes a price or a payout. A real
 * price still prints only when the committed display record authorizes NBA social (socialPricesOk).
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
  // The image's source event is laneDisplay's own: the day's CARD_FROZEN, or its latest STATUS.
  const eventOf = (type) => (type === "CARD_FROZEN" ? d.day.cardEventSha256 : type === "STATUS" ? d.day.statusEventSha256 : null) ?? [...run.events].reverse().find((e) => e.type === type && e.date === date)?.sha256 ?? null;
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
const isFixturePrice = (provider, book) => /^FIXTURE/i.test(String(provider ?? "")) || /SAMPLE|FIXTURE|NOT REAL/i.test(String(book ?? ""));

/**
 * Real prices on these graphics need the committed display record's NBA "challengeGraphics" surface, read through the
 * engine's socialPricesAuthorized (founder 2026-11-04: on; the social feed stays off). Off → AWAITING VERIFIED PRICES.
 */
export const socialPricesOk = (record) => socialPricesAuthorized(record).ok === true;

/**
 * The day's verified price for the lane's card, through the engine's one price fold (lanePriceDisplay over the private
 * run log), or null when the card is not priced. `{ refused }` when the log cannot back a printed price;
 * `{ unpricedReason }` for a REFUSED payout (the lane is held, never shown with a number). Every number is the engine's.
 */
export function pricedDay(events, { date, doc = null }) {
  if (!Array.isArray(events) || !events.length) return { refused: "no private lane log" };
  if (!verifyChain(events).ok) return { refused: "the private lane log chain does not verify" };
  if (doc && doc.runs.at(-1).headSha256 !== events.at(-1).sha256) return { refused: "the private lane log is not the run the public file projects (head differs)" };
  const card = events.findLast((e) => e.type === "CARD_FROZEN" && e.date === date);
  if (!card) return null;
  const day = lanePriceDisplay(events[0].laneId, [events]).runs.at(-1).days.findLast((d) => d.date === date && d.step === card.step);
  if (!day) return null;
  // VERIFIED stakes the step; PRELIMINARY (an early build, engine 435b30cec8) prints with its tag and stakes nothing.
  if (day.result !== "VERIFIED" && day.result !== "PRELIMINARY") return { unpricedReason: `PAYOUT_COMPUTED ${day.result}: ${(day.refusals ?? []).join(", ")}` };
  const legIds = card.card.legs.map((l) => String(l.legId)).sort();
  if (legIds.join() !== day.legs.map((l) => String(l.legId)).sort().join()) return { refused: "the price does not cover exactly the card's legs" };
  if (![day.stakeCents, day.grossPayoutCents, day.profitCents].every(Number.isInteger) || day.grossPayoutCents - day.profitCents !== day.stakeCents) return { refused: "the payout amounts do not hold (gross - profit = stake)" };
  const pv = events.findLast((e) => e.type === "PRICE_VERIFIED" && e.cardEventSha256 === card.sha256);
  const providers = (pv?.price?.legs ?? []).map((l) => l.provider);
  const books = day.book ? [day.book] : [...new Set((pv?.price?.legs ?? []).map((l) => l.book))];
  if (books.length !== 1) return { refused: `every leg must come from one book (got ${books.length})` };
  const fetched = day.legs.map((l) => l.fetchedAt).filter(Boolean).sort();
  // PRELIMINARY (founder P0 2026-11-04) is the engine's own verdict on the day's latest price (lanePriceDisplay).
  const stake = events.findLast((e) => e.type === "STAKE_SET" && e.date === date && e.step === card.step);
  return {
    preliminary: day.verification === "PRELIMINARY", postScheduledAt: stake?.postScheduledAt ?? null, changedFromEarlier: day.changedFromEarlier ?? null,
    stakeCents: day.stakeCents, grossCents: day.grossPayoutCents, profitCents: day.profitCents,
    decimalPrice: day.decimalPrice, combinedAmerican: decimalToAmerican(day.decimalPrice), method: day.method,
    // Anything but one book's product over different games carries its label (SPEC §7); lanes never produce it.
    estimate: day.estimate === true || day.method !== "LEG_PRODUCT", label: day.label,
    legs: Object.fromEntries(day.legs.map((l) => [String(l.legId), { price: l.price, oddsFormat: l.oddsFormat, line: l.line, fetchedAt: l.fetchedAt }])),
    books, capturedAt: day.capturedAt ?? fetched[0] ?? null, belowPace: day.belowPace,
    fixture: providers.some((x) => isFixturePrice(x, null)) || books.some((b) => isFixturePrice(null, b)),
    priceSnapshotSha256: pv?.price?.priceSnapshotSha256 ?? null,
    // The engine's payout event this image prints (the console records the post against it).
    payoutEventSha256: events.findLast((e) => e.type === "PAYOUT_COMPUTED" && e.date === date && e.step === card.step && e.result === day.result)?.sha256 ?? null,
    // The price-capture event that payout was computed from (the engine's priceEventSha256; card@2 mirrors it).
    priceEventSha256: events.findLast((e) => e.type === "PAYOUT_COMPUTED" && e.date === date && e.step === card.step && e.result === day.result)?.inputs?.priceEventSha256 ?? pv?.sha256 ?? null,
  };
}

/** The tracked bankroll from the private log (the engine's laneState fold), for a priced lane whose public file withholds it. */
export const privateBankrollCents = (events) => laneState(events).bankrollCents;
