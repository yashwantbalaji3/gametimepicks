/**
 * Pure parlay odds math. A combined price is null if ANY leg lacks a price — never fabricated.
 */
export function americanToDecimal(odds: number | null | undefined): number | null {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0) return null;
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

export function decimalToAmerican(dec: number | null | undefined): number | null {
  if (typeof dec !== "number" || !Number.isFinite(dec) || dec <= 1) return null;
  return dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
}

/** Combined decimal price of legs; null if any leg price is missing. */
export function combinedDecimal(oddsList: Array<number | null>): number | null {
  let dec = 1;
  for (const o of oddsList) {
    const d = americanToDecimal(o);
    if (d == null) return null;
    dec *= d;
  }
  return dec;
}

export function combinedAmerican(oddsList: Array<number | null>): number | null {
  return decimalToAmerican(combinedDecimal(oddsList) ?? undefined);
}

/** Independent-leg hit probability (product). Null if any model probability is missing. */
export function combinedHitProbability(probs: Array<number | null>): number | null {
  let p = 1;
  for (const x of probs) {
    if (typeof x !== "number" || !Number.isFinite(x) || x <= 0) return null;
    p *= x;
  }
  return p;
}

export function payoutMultiple(oddsList: Array<number | null>): number | null {
  return combinedDecimal(oddsList);
}
