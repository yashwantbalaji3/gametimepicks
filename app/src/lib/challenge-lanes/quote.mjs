/**
 * NEWER QUOTE (founder 2026-11-04): a later price check on a card that is already staked. It never touches the lane log:
 * the posted record (PRICE_VERIFIED + PAYOUT_COMPUTED VERIFIED) stays the record. The quote is a separate, labelled
 * comparison, written only to GTP_PRIVATE_DATA_DIR next to its snapshot, and never auto-published.
 *
 * Pure: newerQuote(events, snapshot, { date }) → { ok, ... } or { ok:false, refusal }.
 */
import { canonical, sha256 } from "./chain.mjs";
import { laneState } from "./lanes.mjs";
import { priceRatio, payoutCents, decimalToAmerican } from "./payout.mjs";
import { priceForCard } from "./odds.mjs";

export const QUOTE_SCHEMA = "gtp.challenge-lane.newer-quote@1";
export const QUOTE_LABEL = "NEWER QUOTE — not the posted record; the staked price and payout are unchanged";

const product = (legs) => {
  let n = 1n; let d = 1n;
  for (const l of legs) { const r = priceRatio(l.oddsFormat, l.price); if (!r) return null; n *= BigInt(r.n); d *= BigInt(r.d); }
  return { n, d };
};

export function newerQuote(events, snapshot, { date }) {
  const s = laneState(events);
  const pay = s.open?.date === date ? s.open.payoutEvent : null;
  if (!pay) return { ok: false, laneId: s.laneId, refusal: "NOT_STAKED: only a staked (VERIFIED) card gets a newer quote" };
  const staked = events.find((e) => e.sha256 === pay.inputs.priceEventSha256)?.price;
  const p = priceForCard(s.open.cardEvent.card, snapshot);
  if (!p.ok) return { ok: false, laneId: s.laneId, refusal: p.refusals.join("; ") };
  /* The posted record's own book: a quote from another book is not a like-for-like comparison. */
  if (p.price.legs.some((l) => l.book !== pay.inputs.book)) return { ok: false, laneId: s.laneId, refusal: `BOOK_CHANGED: the staked book ${pay.inputs.book} no longer prices every leg first` };
  const was = new Map(staked.legs.map((l) => [l.legId, l]));
  const legs = p.price.legs.map((l) => ({ legId: l.legId, selectionCode: l.selectionCode, stakedPrice: was.get(l.legId)?.price ?? null, quotePrice: l.price, changed: was.get(l.legId)?.price !== l.price, fetchedAt: l.fetchedAt }));
  const r = product(p.price.legs);
  const { grossPayoutCents, profitCents } = payoutCents(pay.inputs.stakeCents, r);
  const quoteDecimal = Number(r.n) / Number(r.d);
  const body = {
    schema: QUOTE_SCHEMA, label: QUOTE_LABEL, laneId: s.laneId, runId: s.runId, date, step: s.step,
    record: { payoutEventSha256: pay.sha256, priceEventSha256: pay.inputs.priceEventSha256, priceSnapshotSha256: pay.inputs.priceSnapshotSha256, decimalPrice: pay.inputs.decimalPrice, grossPayoutCents: pay.grossPayoutCents, profitCents: pay.profitCents },
    quote: { priceSnapshotSha256: snapshot.snapshotSha256, capturedAt: p.price.legs[0]?.fetchedAt ?? null, book: pay.inputs.book, decimalPrice: quoteDecimal, american: decimalToAmerican(quoteDecimal), stakeCents: pay.inputs.stakeCents, grossPayoutCents, profitCents },
    legs, changedLegs: legs.filter((l) => l.changed).map((l) => l.legId),
  };
  return { ok: true, ...body, quoteSha256: sha256(canonical(body)) };
}
