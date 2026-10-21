/**
 * PARLAY LAB V2 · COMBINED PRICE FROM RECORDED LEG PRICES — shared by the tier board and the Smart Betslip.
 *
 * What this number IS: the arithmetic product of the recorded single-leg prices, i.e. what a sportsbook would pay
 * on a parlay of INDEPENDENT legs at those prices. Its reciprocal is the market-implied probability, which still
 * contains every book's margin. It is a fact about recorded prices, not a model estimate.
 *
 * What it is NOT: a same-game price. Legs from one game are correlated and books price same-game parlays with
 * their own (unpublished) adjustments, so for any same-game set this returns no price and says so.
 *
 * No validated correlation model exists in this codebase (lib/build/compatibility.mjs, lib/products/correlation.mjs),
 * so a MODEL joint probability is always null with a stated reason — never the naive independent product passed
 * off as one.
 */
import { americanToDecimal, decimalToAmerican } from "../odds-math.ts";

export const COMBINED_PRICE_UNAVAILABLE = "Combined price unavailable";
export const MODEL_JOINT_UNAVAILABLE_REASON = "No validated correlation model";
export const MARKET_IMPLIED_LABEL = "Market-implied, from the recorded prices (includes each book's margin)";

/** Event identity used for same-game detection. Fails closed: a leg with no event cannot be shown distinct. */
export const eventKeyOf = (leg) => {
  const e = leg?.eventId ?? leg?.gamePk ?? leg?.gameId ?? null;
  return e == null || e === "" ? null : `${String(leg?.sport ?? "").toLowerCase()}:${e}`;
};

/** Groups of ≥2 legs that share one event (or have no event identity). */
export function sameGameGroups(legs) {
  const by = new Map();
  (legs ?? []).forEach((l, i) => {
    const k = eventKeyOf(l) ?? `__unknown__:${i}`;
    by.set(k, [...(by.get(k) ?? []), i]);
  });
  const groups = [...by.entries()].filter(([, idx]) => idx.length > 1).map(([event, idx]) => ({ event, legIndexes: idx }));
  const unknown = (legs ?? []).some((l) => eventKeyOf(l) == null);
  return { groups, sameGame: groups.length > 0, unknownEvent: unknown };
}

const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

/**
 * @param {ReadonlyArray<{ price: number|null, eventId?: unknown, sport?: string }>} legs
 * @returns {{ available: boolean, decimal: number|null, american: number|null, text: string,
 *   marketImpliedProbability: number|null, marketImpliedLabel: string, modelJointProbability: null,
 *   modelJointProbabilityReason: string, sameGame: boolean }}
 */
export function combinedPrice(legs) {
  const list = legs ?? [];
  const sg = sameGameGroups(list);
  const base = { marketImpliedLabel: MARKET_IMPLIED_LABEL, modelJointProbability: null, modelJointProbabilityReason: MODEL_JOINT_UNAVAILABLE_REASON, sameGame: sg.sameGame || sg.unknownEvent };
  const decs = list.map((l) => (Number.isFinite(l?.price) && l.price !== 0 ? americanToDecimal(l.price) : null));
  if (list.length < 2 || base.sameGame || decs.some((d) => d == null || !Number.isFinite(d) || d <= 1)) {
    return { ...base, available: false, decimal: null, american: null, text: COMBINED_PRICE_UNAVAILABLE, marketImpliedProbability: null };
  }
  const decimal = decs.reduce((a, d) => a * d, 1);
  const american = decimalToAmerican(decimal);
  return {
    ...base,
    available: true,
    decimal: Number(decimal.toFixed(6)),
    american,
    text: signed(american),
    marketImpliedProbability: Number((1 / decimal).toFixed(6)),
  };
}

export { signed as signedAmerican };
