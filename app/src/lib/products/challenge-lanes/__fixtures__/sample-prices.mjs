/**
 * TEST-ONLY SAMPLE PRICES (SPEC §5/§7: "fixture prices only in samples, visibly labelled"). Not a bookmaker's price,
 * not captured from any provider: the book is "SAMPLE BOOK" and the odds are made up. A plaintext price display in the
 * engine's own shape, folded by the engine's own pricedLaneDisplay, so the site's priced layout can be tested and shown
 * on the gated dev route before a real encrypted price file exists. Never read by a public page.
 */
import { pricedLaneDisplay } from "../../../challenge-lanes/display.mjs";
import { americanToDecimal } from "../../../challenge-lanes/payout.mjs";

export const SAMPLE_BOOK = "SAMPLE BOOK";
export const SAMPLE_CAPTURED_AT = "2026-11-03T22:15:00Z";

/** A made-up plaintext price display (the engine's gtp.challenge-lane.prices@1 shape) for the lane's latest card. */
export function samplePrices(doc, { stakeCents = doc.baseCents } = {}) {
  const run = doc.runs.at(-1);
  const day = run.days.findLast((d) => d.card);
  if (!day) return null;
  const legs = day.card.legs.map((l, i) => ({ legId: l.legId, selectionCode: l.selection.code, oddsFormat: "american", price: i % 2 ? -150 : 120, line: null, fetchedAt: SAMPLE_CAPTURED_AT }));
  const decimalPrice = legs.reduce((p, l) => p * americanToDecimal(l.price), 1);
  const gross = Math.floor(stakeCents * decimalPrice);
  return {
    schema: "gtp.challenge-lane.prices@1", laneId: doc.laneId, projectionSha256: doc.contentSha256,
    runs: [{ runId: run.runId, trackedBankrollCents: stakeCents, step: run.step, status: run.status, pace: { milestoneCents: doc.milestonesCents?.[run.stepsWon] ?? null, requiredMultiplier: 2.51, behindByCents: 0, onPace: true },
      days: [{ date: day.date, step: day.step, result: "VERIFIED", verification: "VERIFIED", verificationLabel: null, refusals: null, book: SAMPLE_BOOK, method: "LEG_PRODUCT", estimate: false, label: null, legs, decimalPrice, pace: 2.51, belowPace: decimalPrice < 2.51, stakeCents, grossPayoutCents: gross, profitCents: gross - stakeCents, stepOutcome: null, bankrollAfterCents: null, priceSnapshotSha256: "5a".repeat(32), priceEventSha256: "6b".repeat(32) }] }],
  };
}

/** The engine's pricedLaneDisplay over the sample prices: the same fold real prices go through. */
export const samplePricedDisplay = (doc, opts) => pricedLaneDisplay(doc, samplePrices(doc, opts));
