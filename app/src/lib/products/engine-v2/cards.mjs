/**
 * CARD ARITHMETIC + DEPENDENCY RULES for V2 selectors (Session 7). Pure.
 *
 * ⚠ THE COMBINED PRICE IS A DERIVED PRODUCT OF INDEPENDENT LEG PRICES (`pricingKind`
 * DERIVED_INDEPENDENT_PRODUCT). No book offered it as one price, and it is never labelled a
 * same-game-parlay price — official cards carry one leg per event (founder D5), so it is never one.
 *
 * ⚠ `jointProbability` IS THE PRODUCT OF EACH LEG'S READABLE PROBABILITY UNDER INDEPENDENCE, and its
 * basis is carried beside it: MARKET_IMPLIED when any leg's only probability is the book's. It is a
 * ranking quantity, never a GameTimePicks forecast, and never shown as "our chance".
 */
import { PROBABILITY_KIND } from "./receipt.mjs";
import { CARD_EXCLUSION } from "./eligibility.mjs";

export const PRICING_KIND = Object.freeze({ DERIVED_INDEPENDENT_PRODUCT: "DERIVED_INDEPENDENT_PRODUCT" });

export const americanToDecimal = (a) => (a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a));
export function decimalToAmerican(d) {
  if (!(d > 1)) return null;
  return d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1));
}

/** The probability a selector may read for one leg, and what kind it is. */
export function readableProbability(receipt) {
  if (receipt.forecast.probability != null) return { p: receipt.forecast.probability, kind: PROBABILITY_KIND.MODEL };
  if (receipt.forecast.probabilityKind === PROBABILITY_KIND.MARKET_IMPLIED && receipt.market.marketImpliedProbability != null) {
    return { p: receipt.market.marketImpliedProbability, kind: PROBABILITY_KIND.MARKET_IMPLIED };
  }
  return { p: null, kind: PROBABILITY_KIND.NONE };
}

/** Per-leg numbers a selector ranks on. `fairRatio` = p × decimal (1.0 = priced exactly at the readable probability). */
export function legMetrics(receipt) {
  const { p, kind } = readableProbability(receipt);
  const decimal = receipt.market.price == null ? null : americanToDecimal(receipt.market.price);
  return { p, kind, decimal, fairRatio: p != null && decimal != null ? p * decimal : null };
}

/** Entities a leg depends on (both teams of a team market — a leg on a game depends on both). */
const entitiesOf = (r) => [r.identity.participantId, r.identity.teamId, r.identity.opponentId].filter(Boolean).map((e) => `${r.identity.sport}:${e}`);

/**
 * Dependency check for a set of legs. Returns the card-level codes it violates (empty = allowed).
 * One leg per event (D5); no entity twice across events (a team, its opponent, a player); no duplicate.
 */
export function cardConflicts(receipts) {
  const codes = new Set(), events = new Set(), ids = new Set(), ents = new Set();
  for (const r of receipts) {
    if (ids.has(r.receiptId)) codes.add(CARD_EXCLUSION.DUPLICATE_LEG);
    ids.add(r.receiptId);
    const ev = `${r.identity.sport}:${r.identity.eventId}`;
    if (!r.identity.eventId || events.has(ev)) codes.add(CARD_EXCLUSION.SAME_EVENT_CONFLICT);
    events.add(ev);
    for (const e of new Set(entitiesOf(r))) { if (ents.has(e)) codes.add(CARD_EXCLUSION.SAME_ENTITY_CONFLICT); }
    for (const e of entitiesOf(r)) ents.add(e);
  }
  return [...codes].sort();
}

/** Price + probability summary of a card. */
export function cardMetrics(receipts) {
  const ms = receipts.map(legMetrics);
  if (ms.some((m) => m.decimal == null || m.p == null)) return null;
  const decimal = ms.reduce((a, m) => a * m.decimal, 1);
  const jointProbability = ms.reduce((a, m) => a * m.p, 1);
  return {
    legCount: receipts.length,
    combinedDecimal: decimal,
    combinedAmerican: decimalToAmerican(decimal),
    pricingKind: PRICING_KIND.DERIVED_INDEPENDENT_PRODUCT,
    jointProbability,
    jointProbabilityBasis: ms.every((m) => m.kind === PROBABILITY_KIND.MODEL) ? "MODEL" : "MARKET_IMPLIED",
    fairRatio: jointProbability * decimal,
    minLegProbability: Math.min(...ms.map((m) => m.p)),
  };
}

/**
 * Deterministic depth-first enumeration of conflict-free combinations of `minLegs..maxLegs` legs,
 * pruned on a decimal ceiling (decimals only grow as legs are added). `pool` must already be ordered;
 * enumeration order is the pool order, so the output order is reproducible.
 */
export function enumerateCards(pool, { minLegs = 2, maxLegs, maxDecimal = Infinity, limit = 200000 }) {
  const out = [];
  const pick = [];
  const rec = (start, dec) => {
    if (out.length >= limit) return;
    if (pick.length >= minLegs) out.push([...pick]);
    if (pick.length === maxLegs) return;
    for (let i = start; i < pool.length; i += 1) {
      const leg = pool[i];
      const d = dec * americanToDecimal(leg.market.price);
      if (d > maxDecimal) continue;
      if (cardConflicts([...pick, leg]).length) continue;
      pick.push(leg); rec(i + 1, d); pick.pop();
    }
  };
  rec(0, 1);
  return out;
}

/** Stable tie-break key: the sorted receipt ids. */
export const cardKey = (receipts) => receipts.map((r) => r.receiptId).sort().join("|");
