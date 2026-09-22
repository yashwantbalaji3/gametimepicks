/**
 * ONE selector for Bank Builder and Moonshot (v1.7 Phase E), driven by a frozen policy.
 *
 * Inputs: guarded ProductEligibleLeg records (the contract's `guardLegs` has already run), the lane's
 * ladder position, and the policy. Output: a card, or NO_QUALIFYING_PLAY with a reason code. Both carry a
 * receipt naming the policy id, the as-of instant, the pool size, and every field the ranking used.
 *
 * Ranking uses ONLY fields the leg contract owns. Where the only probability is the market's, the card
 * says `probabilityBasis: "market-implied"` and the joint p is labelled as the market's expectation, not
 * a forecast. There is no composite score, no hidden weight, no randomness: ties break on the sorted
 * leg-id key, so the same inputs always give the same card.
 *
 * Pure: no fs, no fetch, no clock (asOf is an input).
 */
import { LADDERS, POLICIES, policyId } from "./policies.mjs";

export const NO_PLAY = Object.freeze({
  INSUFFICIENT_CANDIDATES: "INSUFFICIENT_CANDIDATES",   // fewer than the smallest card
  PRICE_UNAVAILABLE: "PRICE_UNAVAILABLE",               // no construction reaches the rung price
  CONCENTRATION_TOO_HIGH: "CONCENTRATION_TOO_HIGH",     // every reaching construction breaks a forbid rule
  MODEL_STATUS_INELIGIBLE: "MODEL_STATUS_INELIGIBLE",   // the pool had legs, none eligible
  SLATE_QUALITY_BELOW_THRESHOLD: "SLATE_QUALITY_BELOW_THRESHOLD", // best joint p under the preregistered floor
  LANE_HELD: "LANE_HELD",                               // a placed card is still pending
  CADENCE_WINDOW: "CADENCE_WINDOW",                     // policy cadence declines today
});

const dec = (american) => (american >= 100 ? 1 + american / 100 : 1 + 100 / -american);
const toAmerican = (d) => (d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)));

/** Ladder position → the rung the lane is on. `position` comes from receipts (ladder-position.mjs shape). */
export function rungFor(policy, position) {
  const ladder = LADDERS[policy.ladder];
  const step = Math.min(Math.max(1, position?.step ?? 1), ladder.length);
  const [start, goal] = ladder[step - 1];
  const stake = position?.stake ?? (step === 1 ? policy.seed : start);
  return { step, steps: ladder.length, start, goal, stake, requiredDecimal: goal / stake, requiredAmerican: toAmerican(goal / stake), isFinal: step === ladder.length };
}

/** The probability a card is ranked on, and what it is. */
function legP(leg) {
  if (typeof leg.probability === "number") return { p: leg.probability, basis: "validated-model" };
  if (typeof leg.marketImpliedProbability === "number") return { p: leg.marketImpliedProbability, basis: "market-implied" };
  return { p: null, basis: "none" };
}

/** Relationship classes between two legs, from correlation keys only. */
export function relationships(a, b) {
  const A = new Set(a.correlationKeys ?? []), out = [];
  const has = (prefix) => [...A].some((k) => k.startsWith(prefix) && (b.correlationKeys ?? []).includes(k));
  if (has("event:")) out.push("sameEvent");
  if (has("entity:")) out.push("sameEntity");
  if (has("family:")) out.push("sameMarketFamily");
  if (has("start:")) out.push("overlappingStart");
  if (a.sport !== b.sport) out.push("crossSport");
  // opponent: the two legs name each other's event partner (entityIds carry [own, opponent] for team legs)
  const aEnt = a.entityIds ?? [], bEnt = b.entityIds ?? [];
  if (!out.includes("sameEvent") && aEnt.length > 1 && bEnt.length > 1 && (aEnt[0] === bEnt[1] || aEnt[1] === bEnt[0])) out.push("opponent");
  return out;
}

function violates(policy, legs) {
  const recorded = new Set();
  for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
    for (const r of relationships(legs[i], legs[j])) {
      const rule = policy.concentration[r] ?? "record";
      if (rule === "forbid") return { forbidden: r };
      recorded.add(r);
    }
  }
  return { forbidden: null, recorded: [...recorded] };
}

/** Enumerate every k-leg construction (k in policy.legsPerCard) with one leg per event. Bounded by pool size. */
function* constructions(pool, sizes) {
  const n = pool.length;
  for (const k of sizes) {
    if (k > n) continue;
    const idx = Array.from({ length: k }, (_, i) => i);
    while (true) {
      yield idx.map((i) => pool[i]);
      let i = k - 1; while (i >= 0 && idx[i] === n - k + i) i--;
      if (i < 0) break;
      idx[i]++; for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }
}

function cardOf(legs, rung, policy) {
  let d = 1, p = 1, basis = "validated-model";
  for (const l of legs) { d *= dec(l.oddsForSide.american); const lp = legP(l); p *= lp.p; if (lp.basis !== "validated-model") basis = lp.basis === "none" ? "none" : "market-implied"; }
  return { legs, decimal: d, american: toAmerican(d), jointP: p, probabilityBasis: basis, reaches: d >= rung.requiredDecimal, key: legs.map((l) => l.legId).sort().join("|") };
}

const better = (a, b) => (b.jointP - a.jointP) || (a.decimal - b.decimal) || (a.legs.length - b.legs.length) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * Select one lane's card.
 * @param {object} args
 * @param {string} args.policyName
 * @param {object[]} args.legs        guarded eligible legs (already `productEligible` at asOf)
 * @param {object} args.position      { step, stake, state: "ready"|"held" }
 * @param {string} args.asOf
 * @param {Set<string>} [args.excludeLegIds]   legs already used by another lane/product
 * @param {Set<string>} [args.excludeEventIds] events already used by the sibling lane
 * @param {object} [args.cadence]     { lastPlacedDate, date } for cadence policies
 */
export function selectLane({ policyName, legs, position, asOf, excludeLegIds = new Set(), excludeEventIds = new Set(), cadence = null }) {
  const policy = POLICIES[policyName]; if (!policy) throw new Error(`unknown policy ${policyName}`);
  const id = policyId(policyName);
  const rung = rungFor(policy, position);
  const receipt = { policyId: id, product: policy.product, asOf, step: rung.step, stake: rung.stake, requiredAmerican: rung.requiredAmerican, requiredDecimal: +rung.requiredDecimal.toFixed(4), poolSize: legs.length };
  const noPlay = (code, detail) => ({ status: "NO_QUALIFYING_PLAY", reason: code, detail: detail ?? null, rung, receipt: { ...receipt, considered: detail?.considered ?? 0 } });

  if (position?.state === "held") return noPlay(NO_PLAY.LANE_HELD);
  if (policy.cadenceDays && cadence?.lastPlacedDate && cadence?.date) {
    const days = (Date.parse(cadence.date) - Date.parse(cadence.lastPlacedDate)) / 86400000;
    if (days < policy.cadenceDays) return noPlay(NO_PLAY.CADENCE_WINDOW, { daysSinceLast: days });
  }

  // Pool: eligible, priced, with a rankable probability, sides per policy, not excluded.
  let pool = legs.filter((l) => l.productEligible && l.oddsForSide && Number.isFinite(l.oddsForSide.american) && legP(l).p != null && !excludeLegIds.has(l.legId) && !excludeEventIds.has(`${l.sport}:${l.eventId}`));
  if (policy.pool === "mlb-only") pool = pool.filter((l) => l.sport === "mlb");
  if (policy.sides === "favourites") pool = pool.filter((l) => legP(l).p >= 0.5);
  // Deterministic order before enumeration.
  pool = pool.slice().sort((a, b) => (legP(b).p - legP(a).p) || (a.legId < b.legId ? -1 : 1));
  const minLegs = Math.min(...policy.legsPerCard);
  if (legs.length > 0 && pool.length === 0) return noPlay(NO_PLAY.MODEL_STATUS_INELIGIBLE, { poolSize: legs.length });
  if (pool.length < minLegs) return noPlay(NO_PLAY.INSUFFICIENT_CANDIDATES, { poolSize: pool.length });

  // Keep enumeration bounded: the top 30 by p is where every safest-fit card lives (legacy bound, kept).
  const bounded = pool.slice(0, 30);
  let best = null, considered = 0, reaching = 0, concentrated = 0;
  for (const legs2 of constructions(bounded, policy.legsPerCard)) {
    considered++;
    const c = cardOf(legs2, rung, policy);
    if (!c.reaches) continue;
    reaching++;
    if (policy.laneB === "value-band" && position?.lane === "B" && policy.valueBand) { if (c.american < policy.valueBand[0] || c.american > policy.valueBand[1]) continue; }
    const v = violates(policy, legs2);
    if (v.forbidden) { concentrated++; continue; }
    c.relationshipsRecorded = v.recorded;
    if (!best || better(c, best) < 0) best = c;
  }
  if (!best) {
    if (reaching === 0) return noPlay(NO_PLAY.PRICE_UNAVAILABLE, { considered, reaching });
    return noPlay(NO_PLAY.CONCENTRATION_TOO_HIGH, { considered, reaching, concentrated });
  }
  if (policy.noPlayFloor) {
    const floor = rung.isFinal && policy.noPlayFloor.final != null ? policy.noPlayFloor.final : rung.step === 1 ? policy.noPlayFloor.step1 : policy.noPlayFloor.later;
    if (best.jointP < floor) return noPlay(NO_PLAY.SLATE_QUALITY_BELOW_THRESHOLD, { considered, reaching, bestJointP: +best.jointP.toFixed(4), floor });
  }
  return {
    status: "CARD", rung,
    card: {
      legs: best.legs.map((l) => ({ legId: l.legId, sport: l.sport, eventId: l.eventId, eventStartUtc: l.eventStartUtc, marketFamily: l.marketFamily, marketKey: l.marketKey, side: l.side, line: l.line, american: l.oddsForSide.american, bookmaker: l.oddsForSide.bookmaker, capturedAt: l.oddsForSide.capturedAt, probability: l.probability, marketImpliedProbability: l.marketImpliedProbability, forecastOwner: l.forecastOwner, forecastId: l.forecastId, modelStatus: l.modelStatus, forecastClass: l.forecastClass, displayMatchup: l.displayMatchup, displaySelection: l.displaySelection, sourceReceiptRefs: l.sourceReceiptRefs })),
      american: best.american, decimal: +best.decimal.toFixed(4), stake: rung.stake, potentialReturn: +(rung.stake * best.decimal).toFixed(2), reachesGoal: best.reaches,
      jointP: +best.jointP.toFixed(4), probabilityBasis: best.probabilityBasis, sports: [...new Set(best.legs.map((l) => l.sport))], relationshipsRecorded: best.relationshipsRecorded,
    },
    receipt: { ...receipt, considered, reaching, concentrated, ranking: policy.ranking, probabilityBasis: best.probabilityBasis },
  };
}

/** Both lanes of one product for one day: Lane A first, Lane B never shares an event with Lane A. */
export function selectProduct({ policyName, legs, positions, asOf, excludeLegIds = new Set(), cadence = null }) {
  const out = {};
  const usedEvents = new Set(), usedLegs = new Set(excludeLegIds);
  for (const lane of ["A", "B"]) {
    const pos = positions?.[lane] ?? { step: 1, state: "ready" };
    const r = selectLane({ policyName, legs, position: { ...pos, lane }, asOf, excludeLegIds: usedLegs, excludeEventIds: usedEvents, cadence: cadence?.[lane] ?? null });
    out[lane] = r;
    if (r.status === "CARD") for (const l of r.card.legs) { usedLegs.add(l.legId); usedEvents.add(`${l.sport}:${l.eventId}`); }
  }
  return out;
}
