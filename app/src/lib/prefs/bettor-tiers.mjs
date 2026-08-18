/**
 * THE BETTOR-TIER TABLE — the single definition, readable from both TypeScript and node scripts.
 *
 * This lived in bettor-tier.ts, which the grid generator cannot import: the generator is a plain
 * .mjs run by node. The alternative was a second copy of the table in the script, and a table
 * defined twice is a table that will disagree — the same defect as the registry keying soccer as
 * "soccer" while the gate keyed it "epl", which returned zero stages and read as "nothing proven".
 *
 * So the data lives here and bettor-tier.ts re-exports it with types. Change a bound in one place.
 *
 * ── What a bankroll can honestly change, and what it cannot ─────────────────────────────────────
 * It cannot change which legs are good: the same slate at the same prices faces every reader.
 *
 * It cannot change card LENGTH either, which is the tempting answer. Measured within every price
 * band separately, the shorter card wins and one extra leg is catastrophic rather than merely
 * worse: medium 3 legs +1.7% against 4 legs -31.3%; high 4 legs +6.0% against 5 legs -41.4%;
 * longshot 5 legs -7.0% against 6 legs -76.2%. Length belongs to the BAND.
 *
 * What it can honestly change is HOW MANY cards a day are put in front of someone. That is the only
 * lever here, and it is deliberately the only one.
 */

/** @typedef {{ id: string, minBankroll: number, maxBankroll: number|null, cardsPerDay: number }} BettorTierSpec */

/** @type {readonly BettorTierSpec[]} */
export const BETTOR_TIERS = [
  { id: "bronze", minBankroll: 0, maxBankroll: 50, cardsPerDay: 1 },
  { id: "silver", minBankroll: 50, maxBankroll: 100, cardsPerDay: 2 },
  { id: "gold", minBankroll: 100, maxBankroll: 250, cardsPerDay: 3 },
  { id: "diamond", minBankroll: 250, maxBankroll: null, cardsPerDay: 4 },
];

/**
 * The risk levels, CALMEST FIRST.
 *
 * The order is not cosmetic. A tier that sees one card sees the low-risk one — the band with the
 * best measured hit rate by a distance (41.1% against longshot's 4.7%). Ordering by anything else
 * would hand the smallest bankroll the wildest card.
 */
export const RISK_ORDER = ["low", "medium", "high", "longshot"];

/** The tier a stated daily bankroll falls in. Null bankroll → null tier. */
export function tierForBankroll(bankroll) {
  if (bankroll == null || !Number.isFinite(bankroll) || bankroll <= 0) return null;
  return (
    BETTOR_TIERS.find((t) => bankroll >= t.minBankroll && (t.maxBankroll == null || bankroll < t.maxBankroll)) ??
    BETTOR_TIERS[BETTOR_TIERS.length - 1]
  );
}

export function risksForTier(tier) {
  if (!tier) return RISK_ORDER;                 // no bankroll stated: show everything, hide nothing
  return RISK_ORDER.slice(0, tier.cardsPerDay);
}
