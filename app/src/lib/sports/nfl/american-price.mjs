/**
 * An American price is valid only as a finite integer with |price| ≥ 100 (+150, −120). PURE, no imports, client-safe
 * (it lives outside lib/odds/, which no client bundle may reach): the NFL line adapter (prop-line-adapter.mjs) and the
 * scenario builder's leg screen (leg-screen.mjs, which reaches a client bundle) share this one rule.
 */
export const isAmerican = (v) => typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && Math.abs(v) >= 100;
