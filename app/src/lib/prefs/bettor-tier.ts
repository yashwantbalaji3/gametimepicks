/**
 * BETTOR TIERS — an internal segmentation, resolved from the daily bankroll a reader states.
 *
 * ── What a bankroll can honestly change, and what it cannot ─────────────────────────────────────
 * It cannot change which legs are good. A $20 bankroll and a $2,000 one face the same slate at the
 * same prices, and nothing about the size of a stake makes a selection more likely to land.
 *
 * It cannot change card LENGTH either, which is the tempting answer. Measured within every price
 * band separately, the shorter card wins and one extra leg is catastrophic rather than merely
 * worse: medium 3 legs +1.7% against 4 legs −31.3%; high 4 legs +6.0% against 5 legs −41.4%;
 * longshot 5 legs −7.0% against 6 legs −76.2%. Length belongs to the BAND. Handing a bigger
 * bankroll longer cards would be selling variance as a privilege.
 *
 * What it can honestly change is HOW MANY cards a day are put in front of someone — how far down
 * the risk ladder the day's suggestions run. That is the only lever here, and it is deliberately
 * the only one.
 *
 * ── Why it is internal ──────────────────────────────────────────────────────────────────────────
 * The tier is never shown. A visible ladder of metal names turns a bankroll into a status and gives
 * a reader a reason to inflate the number they type — on a stream whose every band is negative,
 * that is the last incentive worth building. It exists so the page can lead with fewer, calmer
 * cards for a smaller bankroll, and nothing else.
 */

export type BettorTierId = "bronze" | "silver" | "gold" | "diamond";

export interface BettorTierSpec {
  readonly id: BettorTierId;
  /** Inclusive lower bound on the stated DAILY bankroll. */
  readonly minBankroll: number;
  /** Exclusive upper bound; null on the top tier. */
  readonly maxBankroll: number | null;
  /** How many of the four risk levels this tier is shown, calmest first. */
  readonly cardsPerDay: number;
}

export const BETTOR_TIERS: readonly BettorTierSpec[] = [
  { id: "bronze", minBankroll: 0, maxBankroll: 50, cardsPerDay: 1 },
  { id: "silver", minBankroll: 50, maxBankroll: 100, cardsPerDay: 2 },
  { id: "gold", minBankroll: 100, maxBankroll: 250, cardsPerDay: 3 },
  { id: "diamond", minBankroll: 250, maxBankroll: null, cardsPerDay: 4 },
];

/** The tier a stated daily bankroll falls in. Null bankroll → null tier; the page behaves as before. */
export function tierForBankroll(bankroll: number | null): BettorTierSpec | null {
  if (bankroll == null || !Number.isFinite(bankroll) || bankroll <= 0) return null;
  return (
    BETTOR_TIERS.find((t) => bankroll >= t.minBankroll && (t.maxBankroll == null || bankroll < t.maxBankroll)) ??
    BETTOR_TIERS[BETTOR_TIERS.length - 1]
  );
}

/**
 * The risk levels a tier is shown, CALMEST FIRST.
 *
 * The order is not cosmetic. A tier that sees one card sees the low-risk one — the band with the
 * best measured hit rate by a distance (41.1% against longshot's 4.7%). Ordering by anything else
 * would hand the smallest bankroll the wildest card.
 */
export const RISK_ORDER = ["low", "medium", "high", "longshot"] as const;

export function risksForTier(tier: BettorTierSpec | null): readonly string[] {
  if (!tier) return RISK_ORDER;                 // no bankroll stated: show everything, hide nothing
  return RISK_ORDER.slice(0, tier.cardsPerDay);
}
