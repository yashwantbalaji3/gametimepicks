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

/*
 * The table itself lives in bettor-tiers.mjs so the grid generator — a plain node script that cannot
 * import TypeScript — reads the SAME bounds this file types. Two copies would drift.
 */
import {
  BETTOR_TIERS as TIERS_DATA,
  RISK_ORDER as RISK_ORDER_DATA,
  tierForBankroll as tierForBankrollImpl,
  risksForTier as risksForTierImpl,
} from "./bettor-tiers.mjs";

export const BETTOR_TIERS = TIERS_DATA as readonly BettorTierSpec[];
export const RISK_ORDER = RISK_ORDER_DATA as readonly string[];

/** The tier a stated daily bankroll falls in. Null bankroll → null tier; the page behaves as before. */
export const tierForBankroll = tierForBankrollImpl as (b: number | null) => BettorTierSpec | null;

/**
 * The risk levels a tier is shown, CALMEST FIRST — see bettor-tiers.mjs for why the order matters.
 */
export const risksForTier = risksForTierImpl as (t: BettorTierSpec | null) => readonly string[];
