/**
 * TEST-ONLY SAMPLE PRICES (SPEC §5/§7: "fixture prices only in samples, visibly labelled"). Not a bookmaker's price,
 * not captured from any provider: the book is "SAMPLE BOOK" and the odds are made up. Turns the engine's laneDisplay of
 * a lane into the PRICED shape bb-redesign proposed to betting-engine (laneDisplay + day.price), so the site's priced
 * layout can be tested and shown on the gated dev route before the engine's encrypted priced fold exists. Never read by
 * a public page.
 */
import { laneDisplay } from "../../../challenge-lanes/display.mjs";

export const SAMPLE_BOOK = "SAMPLE BOOK";
export const SAMPLE_CAPTURED_AT = "2026-11-03T22:15:00Z";

export function samplePricedDisplay(doc, { stakeCents = doc.baseCents } = {}) {
  const d = laneDisplay(doc);
  if (!d.day?.card) return d;
  const legs = d.day.card.legs.map((l, i) => {
    const oddsAmerican = i % 2 ? -150 : 120;
    return { legId: l.legId, book: SAMPLE_BOOK, oddsAmerican, decimal: oddsAmerican > 0 ? 1 + oddsAmerican / 100 : 1 + 100 / -oddsAmerican, line: null, capturedAt: SAMPLE_CAPTURED_AT };
  });
  const decimal = legs.reduce((p, l) => p * l.decimal, 1);
  const gross = Math.round(stakeCents * decimal);
  return { ...d, day: { ...d.day, price: { legs, combined: { method: "LEG_PRODUCT", decimal, american: Math.round((decimal - 1) * 100), book: SAMPLE_BOOK }, stakeCents, grossPayoutCents: gross, profitCents: gross - stakeCents } } };
}
