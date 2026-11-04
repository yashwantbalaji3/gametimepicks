/**
 * CHALLENGE LANES · THE ONE DISPLAY FOLD (SPEC rev 2 §3). PURE. The website and the graphics renderer both turn a verified
 * public projection (`gtp.challenge-lane.public@1`, read with public-reader.mjs) into what they show by calling
 * `laneDisplay`, so a step, rung, status, bankroll or pace can never be computed two ways. It adds nothing that is not in
 * the projection: a withheld amount stays null, and milestones come from the file (`milestonesCents`, owned by
 * lanes.mjs MILESTONES).
 */
import { verifyLaneProjection } from "./projection.mjs";
import { LANES } from "./lanes.mjs";

export const RUNG = Object.freeze({ COMPLETED: "completed", ACTIVE: "active", FAILED: "failed", UPCOMING: "upcoming" });
const runNumber = (runId) => Number(/^run-(\d+)$/.exec(String(runId))?.[1] ?? NaN);

function rungsOf(run, milestones) {
  const done = new Set(run.days.filter((d) => d.stepOutcome === "WIN").map((d) => d.step));
  const failed = new Set(run.days.filter((d) => d.stepOutcome === "LOSS").map((d) => d.step));
  const finished = ["COMPLETED", "FINISHED SHORT"].includes(run.publicStatus);
  return Array.from({ length: run.steps }, (_, i) => {
    const step = i + 1;
    const state = done.has(step) ? RUNG.COMPLETED : failed.has(step) ? RUNG.FAILED : !finished && run.publicStatus !== "LOST" && step === run.step ? RUNG.ACTIVE : RUNG.UPCOMING;
    return { step, state, milestoneCents: milestones[i] ?? null };
  });
}

/* Rule version: a v2 day/run says so; anything older is bbm-rules@1 (its bytes predate the field). */
const V1 = "bbm-rules@1";
const dayView = (d) => ({ date: d.date, step: d.step, status: d.status, reason: d.reason, staked: d.staked, card: d.card, legResults: d.legResults, modelCardResult: d.modelCardResult, stepOutcome: d.stepOutcome, receipts: d.receipts,
  ruleVersion: d.ruleVersion ?? V1, withdrawn: d.withdrawn === true, legCount: d.legCount ?? d.card?.legs?.length ?? 0, maxLegs: d.maxLegs ?? null, targetPayoutCents: d.targetPayoutCents ?? null, targetPayoutLabel: d.targetPayoutLabel ?? null, heldCode: d.heldCode ?? null,
  evidenceClass: d.card?.classification && d.card.classification !== "HOLD" ? d.card.classification : null, evidenceLabel: d.card?.evidenceLabel ?? null });

/**
 * @param {object} doc   a public lane projection; refused (throws) unless verifyLaneProjection passes
 * @param {{ date?: string }} [opts]   the day to show; default the run's latest day with a card or status
 */
export function laneDisplay(doc, { date } = {}) {
  if (!verifyLaneProjection(doc)) throw new Error("laneDisplay: the lane file does not verify; refusing to display it");
  const T = LANES[doc.laneId];
  if (!T || doc.product !== T.product || doc.slot !== T.slot || doc.baseCents !== T.baseCents || doc.targetCents !== T.targetCents || doc.steps !== T.steps) throw new Error(`laneDisplay: ${doc.laneId} does not carry the lane's fixed terms; refusing to display it`);
  const run = doc.runs.at(-1);
  const day = date ? run.days.find((d) => d.date === date) ?? null : run.days.at(-1) ?? null;
  const frozen = day && run.events.find((e) => e.type === "CARD_FROZEN" && e.date === day.date);
  /* The event an image of this day is drawn from: the day's CARD_FROZEN, else its latest STATUS (console refEventSha256). */
  const status = day && run.events.filter((e) => e.type === "STATUS" && e.date === day.date).at(-1);
  const milestones = run.milestonesCents ?? doc.milestonesCents ?? [];
  /* The day's price state from the public (withheld) payout events: PRELIMINARY = priced early, AWAITING VERIFICATION. */
  const priceVerification = day && ({ VERIFIED: "VERIFIED", PRELIMINARY: "PRELIMINARY", REFUSED: "REFUSED" }[run.events.filter((e) => e.type === "PAYOUT_COMPUTED" && e.date === day.date).at(-1)?.result] ?? null);
  const L = LANES[doc.laneId];
  const bankroll = run.trackedBankrollCents;
  const p = run.pace;
  return {
    laneId: doc.laneId, product: doc.product, slot: doc.slot, runId: run.runId, runNumber: runNumber(run.runId), ruleVersion: run.ruleVersion ?? V1, laneType: run.laneType ?? doc.laneType ?? null, laneTypeLabel: run.laneTypeLabel ?? doc.laneTypeLabel ?? null,
    step: Math.min(run.step, run.steps), steps: run.steps, stepText: run.stepText, cleared: run.stepsWon,
    status: run.publicStatus, internalStatus: run.status, reason: run.statusReason, inPlay: run.inPlay,
    rungs: rungsOf(run, milestones), // milestone after each step; the base is `baseCents`, not a rung
    baseCents: doc.baseCents, targetCents: doc.targetCents, maxLegs: run.maxLegs ?? doc.maxLegs, milestonesCents: milestones,
    trackedBankrollCents: bankroll, trackedBankrollWithheld: run.trackedBankrollWithheld,
    distanceToTargetCents: bankroll == null ? null : Math.max(0, doc.targetCents - bankroll),
    pace: p.withheld ? { state: "withheld", withheld: p.withheld, milestoneCents: p.milestoneCents, nextMilestoneCents: milestones[run.stepsWon] ?? null, requiredMultiple: null, behindCents: null }
      : { state: p.onPace ? "on" : "behind", withheld: null, milestoneCents: p.milestoneCents, nextMilestoneCents: milestones[run.stepsWon] ?? null, requiredMultiple: p.requiredMultiplier, behindCents: p.behindByCents },
    day: day && { ...dayView(day), packageId: frozen?.packageId ?? L.packageId(day.date), mediaIndex: frozen?.mediaIndex ?? L.mediaIndex, priceVerification, awaitingVerification: priceVerification === "PRELIMINARY", cardEventSha256: frozen?.sha256 ?? null, statusEventSha256: status?.sha256 ?? null, sourceEventSha256: frozen?.sha256 ?? status?.sha256 ?? null, sourceEventType: frozen ? "CARD_FROZEN" : status ? "STATUS" : null },
    history: run.days.map(dayView),
    runs: doc.runs.map((r) => ({ runId: r.runId, ruleVersion: r.ruleVersion ?? V1, laneType: r.laneType ?? null, laneTypeLabel: r.laneTypeLabel ?? null, steps: r.steps, maxLegs: r.maxLegs ?? doc.maxLegs, milestonesCents: r.milestonesCents ?? doc.milestonesCents, supersedes: r.supersedes ?? null, startedAt: r.startedAt, approvedBy: r.approvedBy, endStatus: r.publicStatus, stepsWon: r.stepsWon })),
    prices: doc.prices, label: doc.label, projectionLabel: doc.projectionLabel,
    sourceSha256: doc.contentSha256,
  };
}

/**
 * laneDisplay with the withheld money filled in from the decrypted prices doc (price-display.mjs), for build-time HTML
 * only. Refused (throws) unless the prices were made from the same logs as this projection. Without prices, it is
 * exactly laneDisplay.
 */
export function pricedLaneDisplay(doc, prices, opts = {}) {
  const v = laneDisplay(doc, opts);
  if (prices == null) return { ...v, priced: false };
  if (prices.schema !== "gtp.challenge-lane.prices@1" || prices.laneId !== doc.laneId || prices.projectionSha256 !== doc.contentSha256) throw new Error("pricedLaneDisplay: the prices file was not made from this lane projection; refusing to combine them");
  const run = prices.runs.find((r) => r.runId === v.runId);
  if (!run) return { ...v, priced: false };
  const priceOf = (date) => run.days.filter((d) => d.date === date).at(-1) ?? null;
  const p = run.pace;
  return {
    ...v, priced: true,
    trackedBankrollCents: run.trackedBankrollCents, trackedBankrollWithheld: null,
    distanceToTargetCents: Math.max(0, v.targetCents - run.trackedBankrollCents),
    pace: { state: p.onPace ? "on" : "behind", withheld: null, milestoneCents: p.milestoneCents, nextMilestoneCents: v.pace.nextMilestoneCents, requiredMultiple: p.requiredMultiplier, behindCents: p.behindByCents },
    day: v.day && { ...v.day, price: priceOf(v.day.date) },
    history: v.history.map((d) => ({ ...d, price: priceOf(d.date) })),
  };
}
