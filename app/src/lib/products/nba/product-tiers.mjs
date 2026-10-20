/**
 * NBA PRODUCT TIERS — INERT. How one NBA leg (nba-leg.mjs) would be QUALIFIED for each product tier.
 *
 * FOUNDER RULE: one official forecast per game across every product; products differ only in qualification, payout
 * and correlation controls. So a tier view never touches the leg: it holds the SAME frozen leg object (same lean,
 * same pOver / pUnder / pPush / EV, same snapshot) and adds only a qualification verdict and the tier's payout and
 * relative-risk description. No tier re-derives, filters by, or reverses a lean.
 *
 * NO NEW NUMBERS. Every bar is read from the constant that already owns it:
 *   Bank Builder    SELECTION_POLICIES["bank-builder@1"].bars (maxLegOdds, maxLegsPerGame, legsPerLane)
 *   Moonshot        SELECTION_POLICIES["moonshot@1"].bars (teamMarketsOnly, minCombinedOdds, minLegs, targetLegs)
 *   Parlay Lab      PARLAY_ODDS_BANDS (combined-price band) + BAND_MAX_LEGS (leg cap) — founder decision D2
 *   every tier      LEG_BOUNDS (price range, staleness, 30-minute activation cutoff); a settlement path for the market
 *
 * RISK WORDS ARE RELATIVE. A description says how a tier compares with the others ("lower relative risk than…"),
 * never that a leg or card is safe, guaranteed or certain. RISK_OVERCLAIM is the test's ban list.
 *
 * Pure: the clock is an argument.
 */
import { LEG_BOUNDS } from "../eligible-leg/contract.mjs";
import { SELECTION_POLICIES } from "../selection-policy.mjs";
import { PARLAY_ODDS_BANDS, PUBLIC_RISK_BAND_TEXT } from "../../parlays/risk-odds-bands.mjs";
import { BAND_MAX_LEGS } from "../../parlays/multi-sport.mjs";
import { MARKETS as NBA_SETTLED_MARKETS } from "../../sports/nba/settlement-contract.mjs";

/** Words a tier description may never use about a leg or a card. */
export const RISK_OVERCLAIM = /\b(safe|safest|safer|guarantee[sd]?|sure thing|risk[- ]free|can(?:'|no)t lose|certain(?:ty)?|lock of)\b/i;

const BB = SELECTION_POLICIES["bank-builder@1"].bars;
const MS = SELECTION_POLICIES["moonshot@1"].bars;
const LOSS_NOTE = "Any leg can lose, and a card loses when one leg does.";

export const TIER_REASON = Object.freeze({
  LOCKED: "LOCKED",
  PRICE_STALE: "PRICE_STALE",
  PRICE_OUT_OF_RANGE: "PRICE_OUT_OF_RANGE",
  LEG_PRICE_ABOVE_TIER_MAX: "LEG_PRICE_ABOVE_TIER_MAX",
  TEAM_MARKETS_ONLY: "TEAM_MARKETS_ONLY",
  NO_SETTLEMENT_PATH: "NO_SETTLEMENT_PATH",
  UNKNOWN_TIER: "UNKNOWN_TIER",
});

const lab = (band) => Object.freeze({
  id: `parlay-lab-${band}`,
  product: "parlay-lab",
  band,
  policy: "PARLAY_ODDS_BANDS + BAND_MAX_LEGS (founder decision D2)",
  legRules: Object.freeze({ oddsMin: LEG_BOUNDS.oddsMin, oddsMax: LEG_BOUNDS.oddsMax, playerMarkets: true }),
  cardRules: Object.freeze({ combinedBand: PARLAY_ODDS_BANDS[band], combinedBandText: PUBLIC_RISK_BAND_TEXT[band], maxLegs: BAND_MAX_LEGS[band], oneLegPerEvent: true }),
  payout: `paper card priced in the ${PARLAY_ODDS_BANDS[band].label} band (${PUBLIC_RISK_BAND_TEXT[band]} combined), up to ${BAND_MAX_LEGS[band]} legs`,
  relativeRisk: {
    low: `The shortest-priced of the four Parlay Lab tiers, so the lowest relative risk among them — not no risk. ${LOSS_NOTE}`,
    medium: `Longer combined prices than Low, so a higher relative risk than Low and a lower one than High. ${LOSS_NOTE}`,
    high: `Longer combined prices than Medium; cards in this tier lose more often than Low or Medium cards. ${LOSS_NOTE}`,
    longshot: `The longest-priced Parlay Lab tier and the highest relative risk; most cards in this tier are expected to lose. ${LOSS_NOTE}`,
  }[band],
});

export const NBA_PRODUCT_TIERS = Object.freeze({
  "bank-builder": Object.freeze({
    id: "bank-builder",
    product: "bank-builder",
    policy: "bank-builder@1",
    legRules: Object.freeze({ oddsMin: LEG_BOUNDS.oddsMin, oddsMax: Math.min(LEG_BOUNDS.oddsMax, BB.maxLegOdds), playerMarkets: true }),
    cardRules: Object.freeze({ legsPerLane: BB.legsPerLane, maxLegsPerGame: BB.maxLegsPerGame, oneLegPerEvent: true }),
    payout: `two-leg paper cards toward a ladder rung target; each leg priced no longer than +${BB.maxLegOdds}`,
    relativeRisk: `Shorter leg prices than Moonshot or the longer Parlay Lab tiers, so a lower relative risk than those — not no risk. ${LOSS_NOTE}`,
    note: "bank-builder@1 records MLB team markets as its candidate source; an NBA player leg would ship as a new frozen policy version, never as an edit to @1.",
  }),
  moonshot: Object.freeze({
    id: "moonshot",
    product: "moonshot",
    policy: "moonshot@1",
    legRules: Object.freeze({ oddsMin: LEG_BOUNDS.oddsMin, oddsMax: LEG_BOUNDS.oddsMax, playerMarkets: !MS.teamMarketsOnly }),
    cardRules: Object.freeze({ minLegs: MS.minLegs, targetLegs: MS.targetLegs, minCombinedOdds: MS.minCombinedOdds, oneLegPerEvent: true }),
    payout: `${MS.minLegs}–${MS.targetLegs}-leg paper cards priced at +${MS.minCombinedOdds} or longer`,
    relativeRisk: `A longshot product: the highest relative risk of the paper products, and most cards are expected to lose. ${LOSS_NOTE}`,
    note: "moonshot@1 is team-markets-only, so it refuses an NBA player leg at qualification — with the same lean every other tier shows.",
  }),
  "parlay-lab-low": lab("low"),
  "parlay-lab-medium": lab("medium"),
  "parlay-lab-high": lab("high"),
  "parlay-lab-longshot": lab("longshot"),
});

/** Today's NBA settlement contract grades team markets only; no player-prop grader exists. Injectable for tests. */
export const nbaSettlesFamily = (family) => NBA_SETTLED_MARKETS.includes(family);

/**
 * One tier's view of one leg. The leg is held by reference (frozen) — never copied, edited or re-evaluated.
 * @param {object} leg      a produced nba-leg (nbaLegFromEvaluation(...).leg)
 * @param {string} tierId   a key of NBA_PRODUCT_TIERS
 * @param {{ now: string, settles?: (family: string) => boolean }} ctx
 */
export function tierView(leg, tierId, { now, settles = nbaSettlesFamily } = {}) {
  const tier = NBA_PRODUCT_TIERS[tierId];
  const reasons = [];
  if (!tier) reasons.push(TIER_REASON.UNKNOWN_TIER);
  const nowMs = Date.parse(now ?? "");
  if (!Number.isFinite(nowMs)) throw new TypeError("tierView: `now` must be an ISO instant");
  const lockMs = Date.parse(leg?.eventLockAt ?? "");
  if (!Number.isFinite(lockMs) || nowMs >= lockMs) reasons.push(TIER_REASON.LOCKED);
  const capMs = Date.parse(leg?.capturedAt ?? "");
  if (!Number.isFinite(capMs) || nowMs - capMs > LEG_BOUNDS.maxPriceAgeMs) reasons.push(TIER_REASON.PRICE_STALE);
  const price = leg?.price?.sideAmerican;
  if (!Number.isFinite(price) || price < LEG_BOUNDS.oddsMin || price > LEG_BOUNDS.oddsMax) reasons.push(TIER_REASON.PRICE_OUT_OF_RANGE);
  if (tier) {
    if (Number.isFinite(price) && price > tier.legRules.oddsMax && !reasons.includes(TIER_REASON.PRICE_OUT_OF_RANGE)) reasons.push(TIER_REASON.LEG_PRICE_ABOVE_TIER_MAX);
    if (!tier.legRules.playerMarkets) reasons.push(TIER_REASON.TEAM_MARKETS_ONLY);
  }
  if (!settles(leg?.family)) reasons.push(TIER_REASON.NO_SETTLEMENT_PATH);
  return Object.freeze({
    tier: tierId,
    product: tier?.product ?? null,
    leg, // the same frozen object every tier holds
    qualification: Object.freeze({ qualified: reasons.length === 0, reasons: Object.freeze(reasons) }),
    payout: tier?.payout ?? null,
    relativeRisk: tier?.relativeRisk ?? null,
  });
}
