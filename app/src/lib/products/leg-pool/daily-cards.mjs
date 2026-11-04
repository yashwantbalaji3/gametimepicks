/**
 * DAILY SUGGESTED CARDS (`gtp.suggested-cards@1`). PURE over a leg pool (leg-pool.mjs). One output that the Bank Builder
 * and Moonshot pages, the parlay tiers, results tracking and the social graphics all read, so they cannot disagree.
 *
 * SELECTION IS THE EXISTING LEVEL A ENGINE, never a second computation:
 *   NBA-only   nba-game-winner-tiers@1 (nbaGameWinnerTiers): Bank Builder = 2 legs in Low/Medium; Moonshot = Longshot,
 *              3–5 legs; parlay tiers Low (2) / Medium (≤3) / High (≤4) / Longshot (≤5), the D2 bands of the joint.
 *   Cross      level-a-mixed@1 (levelAMixed): the same rules, legs from two or more sports.
 * The pool decides WHICH legs enter: Bank Builder (conservative) takes only guard `pass` legs; Moonshot and the parlay
 * tiers take `pass` and `review` legs, each review flag shown on the leg.
 *
 * STATES. model-only (a card, no price) · insufficient (not enough eligible legs: the reason, never a forced card) ·
 * blocked (the sport's input failed freshness or is closed) · qualified (priced with fresh permitted odds — reserved,
 * never emitted: no such odds exist today).
 * No price, payout, line, book or link is ever written. Deterministic: no wall-clock field.
 */
import { createHash } from "node:crypto";
import { nbaGameWinnerTiers, NBA_GW_POLICY } from "../level-a/nba-game-winner-tiers.mjs";
import { levelAMixed, LEVEL_A_MIXED_POLICY } from "../level-a/mixed.mjs";
import { LEVEL_A_LABEL, TIER_METHOD } from "../level-a/suggestions.mjs";
import { PUBLIC_RISK_TIERS, PUBLIC_RISK_LABELS, PARLAY_ODDS_BANDS } from "../../parlays/risk-odds-bands.mjs";

export const SUGGESTED_CARDS_SCHEMA = "gtp.suggested-cards@1";
export const CARD_STATE = Object.freeze({ QUALIFIED: "qualified", MODEL_ONLY: "model-only", BLOCKED: "blocked", INSUFFICIENT: "insufficient" });
export const PRICING = Object.freeze({
  state: "MODEL_ONLY",
  note: "No fresh, permitted sportsbook odds are available, so every card is a model suggestion: no price, no payout, not a bet. Settles on the official final.",
});

/* A tier's threshold as a joint-probability range (the D2 band of the model-fair price, restated as a chance so no
   number on the page reads like a sportsbook price). */
const pOfAmerican = (a) => (a >= 0 ? 100 / (a + 100) : -a / (100 - a));
const pct = (p) => `${(p * 100).toFixed(1)}%`;
export const TIER_THRESHOLD = Object.freeze(Object.fromEntries(PUBLIC_RISK_TIERS.map((t) => {
  const b = PARLAY_ODDS_BANDS[t];
  const hi = pOfAmerican(b.minAmerican); const lo = b.maxAmerican == null ? null : pOfAmerican(b.maxAmerican);
  return [t, lo == null ? `model joint chance below ${pct(hi)}` : `model joint chance ${pct(lo)} to ${pct(hi)}`];
})));

const idOf = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** A pool leg in the public contract (the Level A leg's own fields plus the pool's guard). */
function publicLeg(poolLeg) {
  const { leg, ...rest } = poolLeg;
  return { ...rest, settlement: leg?.settlement ?? null };
}

function publicCard(card, byKey, scope) {
  const legs = card.legs.map((l) => publicLeg(byKey.get(`${l.sport}:${l.eventId}:${l.market}`)));
  const flagged = legs.filter((l) => l.guard?.state === "review");
  return {
    id: idOf(`${card.policy}|${card.tier}|${legs.map((l) => l.legId).sort().join("|")}`),
    policy: card.policy, scope, tier: card.tier, tierLabel: card.tierLabel, sports: card.sports,
    legs, jointProbability: Math.round(card.jointProbability * 1e4) / 1e4, jointShown: card.jointShown,
    band: { tier: card.tier, rule: TIER_THRESHOLD[card.tier] ?? null, method: card.method ?? TIER_METHOD },
    rationale: card.whySelected,
    confidence: flagged.length
      ? `${flagged.length} leg${flagged.length === 1 ? " carries" : "s carry"} an availability flag (shown on the leg). Model estimates are not yet validated over a large forward sample.`
      : "Model estimates are not yet validated over a large forward sample.",
    dependency: card.dependency, disclosure: card.disclosure ?? null,
    status: "MODEL_ONLY", priced: false, price: null, payout: null,
  };
}

const section = (r, policy, byKey, scope, blockedReason) => {
  if (blockedReason) return { policy, state: CARD_STATE.BLOCKED, card: null, reason: blockedReason };
  return r?.card
    ? { policy, state: CARD_STATE.MODEL_ONLY, card: publicCard(r.card, byKey, scope), reason: null }
    : { policy, state: CARD_STATE.INSUFFICIENT, card: null, reason: `Insufficient eligible legs: ${r?.reason ?? "no eligible legs"}.` };
};

/**
 * @param {ReturnType<import("./leg-pool.mjs").buildLegPool>} pool
 */
export function dailySuggestedCards(pool) {
  const byKey = new Map([...pool.nbaLegs, ...pool.crossLegs].map((l) => [l.legId, l]));
  const nbaAll = pool.nbaLegs.filter((l) => ["pass", "review"].includes(l.guard.state)).map((l) => l.leg);
  const nbaPass = pool.nbaLegs.filter((l) => l.guard.state === "pass").map((l) => l.leg);
  const gw = (legs) => nbaGameWinnerTiers({ legs, accessor: pool.accessor, receiptOf: pool.receiptOf, disclosure: pool.display.disclosure, enabled: true });
  const nbaWide = gw(nbaAll);
  const nbaSafe = gw(nbaPass);
  const cross = pool.crossLegs.map((l) => l.leg);
  const mixWide = levelAMixed({ crossSportLegs: cross, nbaLegs: nbaWide.legs, disclosure: pool.display.disclosure, enabled: true });
  const mixSafe = levelAMixed({ crossSportLegs: cross, nbaLegs: nbaSafe.legs, disclosure: pool.display.disclosure, enabled: true });

  const nbaState = pool.sports.nba?.state;
  const nbaBlocked = nbaState === "blocked" ? `NBA input blocked: ${pool.sports.nba.reason}` : nbaState === "no-games" ? "No NBA games with an official forecast on this date." : null;
  const excludedFromBank = pool.nbaLegs.length - nbaPass.length;
  const bankNba = section(nbaSafe.bankBuilder, `${NBA_GW_POLICY}/bank-builder`, byKey, "nba", nbaBlocked);
  if (bankNba.state === CARD_STATE.INSUFFICIENT && excludedFromBank) bankNba.reason += ` ${excludedFromBank} favoured side${excludedFromBank === 1 ? " was" : "s were"} kept out of Bank Builder by an availability flag.`;

  const tiers = (r, policy, scope, blocked) => PUBLIC_RISK_TIERS.map((tier) => {
    const t = r.find((x) => x.tier === tier);
    return { tier, tierLabel: PUBLIC_RISK_LABELS[tier], threshold: TIER_THRESHOLD[tier] ?? null, ...section(t, policy, byKey, scope, blocked) };
  });

  return {
    schema: SUGGESTED_CARDS_SCHEMA,
    productDay: pool.productDay, evaluatedAt: pool.evaluatedAt, legPool: pool.version,
    label: LEVEL_A_LABEL, pricing: PRICING,
    inputs: pool.inputs,
    sports: pool.sports,
    bankBuilder: {
      nba: bankNba,
      cross: section(mixSafe.bankBuilder, `${LEVEL_A_MIXED_POLICY}/bank-builder`, byKey, "cross", null),
    },
    moonshot: {
      nba: section(nbaWide.moonshot, `${NBA_GW_POLICY}/moonshot`, byKey, "nba", nbaBlocked),
      cross: section(mixWide.moonshot, `${LEVEL_A_MIXED_POLICY}/moonshot`, byKey, "cross", null),
    },
    parlays: {
      nba: tiers(nbaWide.tiers, `${NBA_GW_POLICY}/parlay-lab`, "nba", nbaBlocked),
      cross: tiers(mixWide.parlayLab, `${LEVEL_A_MIXED_POLICY}/parlay-lab`, "cross", null),
    },
    legs: [...pool.nbaLegs, ...pool.crossLegs].map(publicLeg),
    refused: pool.refused,
    playerProjections: { nba: pool.playerProjections },
  };
}
