/**
 * LEVEL A · MIXED-SPORT CARDS (`level-a-mixed@1`). PURE. docs/LEVEL_A_MIXED_SPORT_DESIGN.md (ACCEPTED FOR
 * IMPLEMENTATION, release owner 2026-10-24): one card may combine MLB game-winner, EPL / Ligue 1 1X2 and NBA game-winner
 * legs, from the shared engine (level-a/engine.mjs) and the same D2 bands.
 *
 * THE POOL. The cross-sport tierable legs exactly as levelASuggestions admitted them (official forecast probability,
 * verbatim) plus the NBA legs the NBA game-winner rule admitted (the display accessor's exact number, provenance
 * cross-checked, side strictly above 0.5). Nothing else: an NBA game whose estimate is not published is not in the pool,
 * never imputed. Each leg keeps its own label (per-leg labelling, no cap — release owner 2026-10-24).
 * A mixed card has legs from at least two sports (a one-sport card is shown by that sport's own rule).
 *
 * Switch: LEVEL_A_MIXED_PUBLIC (default false). Off: the Level A model is byte-identical to the model without this.
 */
import { PUBLIC_RISK_TIERS, PUBLIC_RISK_LABELS } from "../../parlays/risk-odds-bands.mjs";
import { BAND_MAX_LEGS } from "../../parlays/multi-sport.mjs";
import { best } from "./engine.mjs";
import { LEVEL_A_LABEL, TIER_METHOD, jointShownFor, tierForJoint } from "./suggestions.mjs";
import { NBA_GW_PRODUCT_RULES } from "./nba-game-winner-tiers.mjs";

export const LEVEL_A_MIXED_POLICY = "level-a-mixed@1";
export const LEVEL_A_MIXED_POLICIES = Object.freeze({
  parlayLab: `${LEVEL_A_MIXED_POLICY}/parlay-lab`,
  bankBuilder: `${LEVEL_A_MIXED_POLICY}/bank-builder`,
  moonshot: `${LEVEL_A_MIXED_POLICY}/moonshot`,
});

/** THE SWITCH. One committed constant, default false; flipped only after a §7-style evidence package on a real day. */
export const LEVEL_A_MIXED_PUBLIC = false;
export const LEVEL_A_MIXED_FLAG = "NEXT_PUBLIC_LEVEL_A_MIXED";
export const levelAMixedEnabled = (env = { [LEVEL_A_MIXED_FLAG]: process.env.NEXT_PUBLIC_LEVEL_A_MIXED }) => LEVEL_A_MIXED_PUBLIC || env[LEVEL_A_MIXED_FLAG] === "1";

export const MIXED_DEPENDENCY = "Assumes the games are independent: every leg is a different game, so no two legs share an outcome. Across sports the games are unrelated; within one sport on the same night results can still be related (travel, schedule, league-wide scoring), and that is not modelled.";

const SPORT_NAME = { mlb: "MLB", nba: "NBA", epl: "Premier League", "ligue-1": "Ligue 1" };
const sportsOf = (legs) => [...new Set(legs.map((l) => l.sport))].sort();
const twoSports = (c) => new Set(c.map((l) => l.sport)).size >= 2;

function cardOf(legs, tier, policy) {
  const joint = legs.reduce((p, l) => p * l.probability, 1);
  const sports = sportsOf(legs);
  return {
    policy, tier, tierLabel: PUBLIC_RISK_LABELS[tier], legs, sports,
    jointProbability: joint, jointShown: jointShownFor(joint, tierForJoint(joint)),
    method: TIER_METHOD, dependency: MIXED_DEPENDENCY,
    whySelected: `Each leg is its sport's official forecast pick, with that sport's own published probability or estimate; this is the combination with the highest joint probability in the ${PUBLIC_RISK_LABELS[tier]} band (${legs.length} legs from ${sports.map((s) => SPORT_NAME[s] ?? s).join(", ")}).`,
    priced: false, price: null, payout: null, label: LEVEL_A_LABEL,
  };
}

const range = (sizes) => (sizes.length === 1 ? (sizes[0] === 2 ? "two" : String(sizes[0])) : `${sizes[0]} to ${sizes.at(-1)}`);

/**
 * The mixed answer: Parlay Center (a card per tier), Bank Builder (2 legs, Low or Medium) and Moonshot (Longshot, up to
 * BAND_MAX_LEGS.longshot legs) — the design's §7 product rules, the same as the NBA game-winner rule's.
 * @param {{ crossSportLegs: object[], nbaLegs: object[], disclosure?: string | null, enabled?: boolean }} input
 */
export function levelAMixed({ crossSportLegs = [], nbaLegs = [], disclosure = null, enabled = levelAMixedEnabled() }) {
  const pool = [...crossSportLegs.filter((l) => l.tierable && typeof l.probability === "number"), ...nbaLegs.filter((l) => l.sport === "nba" && typeof l.probability === "number")];
  const sports = sportsOf(pool);
  const tooFew = sports.length < 2 ? `a mixed card needs legs from two sports; today only ${sports.length === 0 ? "no sport has" : `${sports.map((s) => SPORT_NAME[s] ?? s).join("")} has`} a leg with a published probability` : null;
  const parlayLab = PUBLIC_RISK_TIERS.map((tier) => {
    const sizes = Array.from({ length: BAND_MAX_LEGS[tier] - 1 }, (_, i) => i + 2);
    const top = tooFew ? null : best(pool, sizes, [tier], null, twoSports);
    return { tier, tierLabel: PUBLIC_RISK_LABELS[tier], card: top ? cardOf(top.c, tier, LEVEL_A_MIXED_POLICIES.parlayLab) : null, reason: top ? null : tooFew ?? `no ${range(sizes)} of today's legs from two or more sports combine into the ${PUBLIC_RISK_LABELS[tier]} band` };
  });
  const product = (rule, policy, name) => {
    const top = tooFew ? null : best(pool, rule.sizes, rule.tiers, null, twoSports);
    return { card: top ? cardOf(top.c, top.tier, policy) : null, reason: top ? null : tooFew ?? `no ${range(rule.sizes)} of today's legs from two or more sports combine into the ${rule.tiers.map((t) => PUBLIC_RISK_LABELS[t]).join(" or ")} band (${name})` };
  };
  const bankBuilder = product(NBA_GW_PRODUCT_RULES.bankBuilder, LEVEL_A_MIXED_POLICIES.bankBuilder, "Bank Builder");
  const moonshot = product(NBA_GW_PRODUCT_RULES.moonshot, LEVEL_A_MIXED_POLICIES.moonshot, "Moonshot");
  const cards = [...parlayLab.map((t) => t.card), bankBuilder.card, moonshot.card].filter(Boolean);
  for (const c of cards) if (c.legs.some((l) => l.sport === "nba")) c.disclosure = disclosure; // the display's disclosure travels with a card that shows its estimate
  const hasNba = cards.some((c) => c.legs.some((l) => l.sport === "nba"));
  return { policy: LEVEL_A_MIXED_POLICY, public: enabled === true, parlayLab, bankBuilder, moonshot, sports, disclosure: hasNba ? disclosure : null };
}
