/**
 * SUGGESTED PARLAYS V2 — SHADOW SELECTOR (Session 7). Nothing public reads this.
 *
 * ── WHY A V2 EXISTS ────────────────────────────────────────────────────────────────────────────
 *
 * V1 ranks optimizer slips by `score = Σ edgePct/100 − 0.05·(legs−2)` (pipeline/parlay_optimizer.py),
 * and `edgePct` is the MLB prop model's projection against the line. Every one of those families is
 * DEMOTED_TO_MARKET_CONTEXT (it lost to the market), so since F-1 (2026-09-30) V1 withholds every card:
 * its leg pool is structurally empty, not empty for a day. V2 builds the four tiers from the one leg
 * floor (eligibility.mjs) instead.
 *
 * ── THE POLICY (preregistered here, frozen by hash; NOT tuned on any outcome) ───────────────────
 *
 * Tiers are the canonical public bands (risk-odds-bands.mjs) and V1's leg caps. Each tier has its own
 * objective, so the four cards are not "one core card plus weaker legs":
 *
 *   Low Risk     maximise the joint readable probability inside −200…+100        (controlled risk)
 *   Medium Risk  maximise fair ratio (joint p × combined decimal), every leg p ≥ 0.40  (balance)
 *   High Risk    maximise fair ratio, every leg p ≥ 0.35                          (more variance, floor kept)
 *   Longshot     maximise fair ratio, every leg p ≥ 0.25                          (upside, never odds-hunting)
 *
 * "Fair ratio" is how close the combined price is to the readable probability — for a market-implied
 * leg it is the share of the price the bookmaker did NOT keep. It ranks the least-taxed card in a
 * band; it never ranks by payout, so the longshot tier cannot become "the biggest number available".
 * Ties: higher joint p, fewer legs, then receipt ids. Legs are disjoint across tiers (filled low →
 * longshot, as V1). One leg per event; no team/player twice. No card in a tier → NO_QUALIFYING_CARD
 * with a typed reason; a floor is never lowered to fill a tier.
 *
 * ⚠ TODAY EVERY ELIGIBLE LEG IS MARKET-IMPLIED (MLB team markets, F1 transitional), so every V2 card is
 * a MARKET CONSTRUCTION and says so: `jointProbabilityBasis: "MARKET_IMPLIED"`. Publishing V2 would
 * change the leg source and the ranking of a public product — a founder/methodology gate (§24, §72).
 */
import { createHash } from "node:crypto";
import { PARLAY_ODDS_BANDS, PUBLIC_RISK_TIERS, getRiskBucketForCombinedOdds } from "../../parlays/risk-odds-bands.mjs";
import { americanToDecimal, cardMetrics, cardKey, enumerateCards, legMetrics } from "./cards.mjs";

export const SP_POLICY_V2 = Object.freeze({
  name: "SP-V2",
  product: "suggested-parlays",
  legFloor: "leg-floor@2",
  tiers: Object.freeze({
    low: { objective: "maxJointProbability", maxLegs: 2, minLegProbability: null },
    medium: { objective: "maxFairRatio", maxLegs: 3, minLegProbability: 0.40 },
    high: { objective: "maxFairRatio", maxLegs: 4, minLegProbability: 0.35 },
    longshot: { objective: "maxFairRatio", maxLegs: 5, minLegProbability: 0.25 },
  }),
  minLegs: 2,
  legsDisjointAcrossTiers: true,
  fillOrder: PUBLIC_RISK_TIERS,
  sameEvent: "forbid",
  sameEntity: "forbid",
  poolCapPerTier: 24,
  bands: PARLAY_ODDS_BANDS,
});

/** A policy's id is its content hash: changing any bar changes the id every receipt carries. */
export const spPolicyIdOf = (policy) => `${policy.name}@${createHash("sha256").update(JSON.stringify(policy)).digest("hex").slice(0, 12)}`;
export const spPolicyId = spPolicyIdOf(SP_POLICY_V2);

export const SP_NO_CARD = Object.freeze({
  NO_ELIGIBLE_LEGS: "NO_ELIGIBLE_LEGS",
  TOO_FEW_EVENTS: "TOO_FEW_EVENTS",
  NO_CARD_IN_BAND: "NO_CARD_IN_BAND",
  LEG_FLOOR_EXCLUDES_ALL: "LEG_FLOOR_EXCLUDES_ALL",
});

/* The canonical bucket owner decides the band — never a second copy of the boundaries. */
const inBand = (american, tier) => getRiskBucketForCombinedOdds(american) === tier;

function better(objective) {
  return (a, b) => {
    /* Fair ratio is compared at 0.01 resolution: single-book prices differ in the third decimal from
       rounding alone, and ranking on that would be ranking on noise. Within it, joint probability decides. */
    const q = (x) => Math.round(x * 100);
    const primary = objective === "maxJointProbability" ? b.m.jointProbability - a.m.jointProbability : q(b.m.fairRatio) - q(a.m.fairRatio);
    if (Math.abs(primary) > 1e-12) return primary;
    if (Math.abs(b.m.jointProbability - a.m.jointProbability) > 1e-12) return b.m.jointProbability - a.m.jointProbability;
    if (a.m.legCount !== b.m.legCount) return a.m.legCount - b.m.legCount;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  };
}

/** Why a leg is on the card — only what the receipt and policy prove. */
function legReason(r, tierSpec) {
  const m = legMetrics(r);
  const prob = m.kind === "MODEL" ? `GameTimePicks model probability ${(m.p * 100).toFixed(1)}%` : `market-implied (de-vigged ${r.market.sportsbook}) ${(m.p * 100).toFixed(1)}% — not a GameTimePicks forecast`;
  const floor = tierSpec.minLegProbability != null ? `; clears this tier's ${Math.round(tierSpec.minLegProbability * 100)}% per-leg floor` : "";
  return `passed every leg-floor@2 gate; ${prob}${floor}`;
}

/**
 * Select all four tiers from the eligible receipts. Deterministic for identical inputs.
 * @param {object[]} eligibleReceipts  receipts that passed evaluateReceiptV2 at `asOf`
 */
export function selectSuggestedParlaysV2(eligibleReceipts, { asOf }) {
  const used = new Set();
  const tiers = [];
  const legs = [...(eligibleReceipts ?? [])].filter((r) => legMetrics(r).p != null && r.market.price != null);
  const events = new Set(legs.map((r) => `${r.identity.sport}:${r.identity.eventId}`));
  for (const tier of SP_POLICY_V2.fillOrder) {
    const spec = SP_POLICY_V2.tiers[tier];
    const band = SP_POLICY_V2.bands[tier];
    const base = { tier, label: band.label, band: { minAmerican: band.minAmerican, maxAmerican: band.maxAmerican }, objective: spec.objective, maxLegs: spec.maxLegs, minLegProbability: spec.minLegProbability };
    if (!legs.length) { tiers.push({ ...base, state: "NO_QUALIFYING_CARD", reasonCode: SP_NO_CARD.NO_ELIGIBLE_LEGS, card: null, alternatives: [] }); continue; }
    if (events.size < SP_POLICY_V2.minLegs) { tiers.push({ ...base, state: "NO_QUALIFYING_CARD", reasonCode: SP_NO_CARD.TOO_FEW_EVENTS, card: null, alternatives: [] }); continue; }
    const floorOk = legs.filter((r) => !used.has(r.receiptId) && (spec.minLegProbability == null || legMetrics(r).p >= spec.minLegProbability));
    if (floorOk.length < SP_POLICY_V2.minLegs) { tiers.push({ ...base, state: "NO_QUALIFYING_CARD", reasonCode: SP_NO_CARD.LEG_FLOOR_EXCLUDES_ALL, card: null, alternatives: [] }); continue; }
    /* Bounded, deterministic pool: the tier's own per-leg key, then receipt id. */
    const key = spec.objective === "maxJointProbability" ? (r) => legMetrics(r).p : (r) => legMetrics(r).fairRatio;
    const pool = [...floorOk].sort((a, b) => (key(b) - key(a)) || (a.receiptId < b.receiptId ? -1 : 1)).slice(0, SP_POLICY_V2.poolCapPerTier);
    const maxDecimal = band.maxAmerican == null ? Infinity : americanToDecimal(band.maxAmerican);
    const cands = enumerateCards(pool, { minLegs: SP_POLICY_V2.minLegs, maxLegs: spec.maxLegs, maxDecimal })
      .map((c) => ({ legs: c, m: cardMetrics(c), key: cardKey(c) }))
      .filter((c) => c.m && inBand(c.m.combinedAmerican, tier))
      .sort(better(spec.objective));
    if (!cands.length) { tiers.push({ ...base, state: "NO_QUALIFYING_CARD", reasonCode: SP_NO_CARD.NO_CARD_IN_BAND, card: null, alternatives: [], candidatesConsidered: 0 }); continue; }
    const best = cands[0];
    for (const r of best.legs) used.add(r.receiptId);
    tiers.push({
      ...base,
      state: "PUBLISHABLE",
      card: {
        legs: best.legs.map((r) => ({ receiptId: r.receiptId, sport: r.identity.sport, eventId: r.identity.eventId, eventStartUtc: r.identity.eventStartUtc, matchup: r.identity.matchup, family: r.market.family, marketKey: r.market.marketKey, side: r.market.side, line: r.market.line, selection: r.market.selectionLabel, price: r.market.price, sportsbook: r.market.sportsbook, marketCapturedAt: r.market.marketCapturedAt, marketReceiptId: r.market.marketReceiptId, probabilityKind: r.forecast.probabilityKind, readableProbability: legMetrics(r).p, forecastId: r.forecast.forecastId, correlationGroup: `event:${r.identity.sport}:${r.identity.eventId}`, reason: legReason(r, spec) })),
        ...best.m,
        rationale: `${band.label}: of ${cands.length} conflict-free cards inside the band, this one ${spec.objective === "maxJointProbability" ? "has the highest joint probability" : "has the highest fair ratio at 0.01 resolution (least of the price kept by the book), then the highest joint probability"}; then fewer legs.`,
      },
      alternatives: cands.slice(1, 4).map((c) => ({ key: c.key, combinedAmerican: c.m.combinedAmerican, jointProbability: c.m.jointProbability, fairRatio: c.m.fairRatio, legs: c.m.legCount })),
      candidatesConsidered: cands.length,
    });
  }
  return { policy: spPolicyId, asOf, tiers };
}
