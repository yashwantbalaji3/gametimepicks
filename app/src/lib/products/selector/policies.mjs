/**
 * Frozen selector policies (v1.7 Phase E). Every policy here is preregistered in
 * docs/V17_SELECTOR_PREREGISTRATION.md; the hash of the JSON below is the policy id a receipt carries.
 * Changing a number here changes the hash, so a card can never quietly be produced by a policy other
 * than the one its receipt names.
 *
 * A policy is data. The executor (select.mjs) is one function that reads it.
 */
import { createHash } from "node:crypto";

/** Rung ladders: [start, goal] pairs. The required decimal is goal / carried stake, never the nominal. */
export const LADDERS = Object.freeze({
  "bb-5": [[100, 200], [200, 700], [700, 1400], [1400, 3500], [3500, 10000]],
  "bb-4": [[100, 250], [250, 900], [900, 3200], [3200, 10000]],
  "bb-3": [[100, 300], [300, 1500], [1500, 10000]],
  "ms-3": [[25, 100], [100, 400], [400, 1000]],
});

const BASE_CONCENTRATION = Object.freeze({
  sameEvent: "forbid",         // two legs from one event
  sameEntity: "forbid",        // same team / player / fighter twice
  opponent: "forbid",          // a team and its opponent in one card
  sameMarketFamily: "record",  // allowed, recorded
  crossSport: "record",        // recorded, never treated as independence
  overlappingStart: "record",  // starts within 30 min, recorded
});

const bb = (over) => ({
  product: "bank-builder", ladder: "bb-5", seed: 100, lanes: 2, legsPerCard: [2, 3, 4], sides: "favourites",
  laneB: "safest",             // legacy: "value-band"
  valueBand: null,             // legacy: [200, 700] (American) for Lane B
  noPlayFloor: null,           // { step1: p, later: p } on the market-implied joint p
  pool: "mlb-only",            // "eligible-universe" for cross-sport
  ranking: "maxJointP-then-smallestOvershoot-then-fewerLegs-then-legId",
  concentration: BASE_CONCENTRATION,
  ...over,
});
const ms = (over) => ({
  product: "moonshot", ladder: "ms-3", seed: 25, lanes: 2, legsPerCard: [2], sides: "both",
  laneB: "safest", valueBand: null, noPlayFloor: null, pool: "mlb-only", cadenceDays: null,
  ranking: "maxJointP-then-smallestOvershoot-then-fewerLegs-then-legId",
  concentration: BASE_CONCENTRATION,
  ...over,
});

/** The registry. Keys are the preregistration names. */
export const POLICIES = Object.freeze({
  "BB-LEGACY": bb({ laneB: "value-band", valueBand: [200, 700], concentration: { ...BASE_CONCENTRATION, sameEntity: "record", opponent: "record" } }),
  "BB-C1": bb({}),
  "BB-C2": bb({ noPlayFloor: { step1: 0.42, later: 0.30 } }),
  "BB-C3": bb({ noPlayFloor: { step1: 0.42, later: 0.30 }, pool: "eligible-universe" }),
  "BB-C4": bb({ noPlayFloor: { step1: 0.42, later: 0.30 }, ladder: "bb-3" }),
  "BB-C5": bb({ noPlayFloor: { step1: 0.42, later: 0.30 }, ladder: "bb-4" }),
  // Look 2 (2026-09-22, forward-only): a RELATIVE floor — decline when today's best qualifying joint p is
  // below `ratio` × the best the rung achieved on the last `window` days, once `minDays` are known.
  "BB-C2b": bb({ relativeFloor: { ratio: 0.9, window: 7, minDays: 3 } }),
  "MS-LEGACY": ms({ concentration: { ...BASE_CONCENTRATION, sameEntity: "record", opponent: "record" } }),
  "MS-C1": ms({ noPlayFloor: { step1: 0.20, later: 0.20, final: 0.32 } }),
  "MS-C2": ms({ noPlayFloor: { step1: 0.20, later: 0.20, final: 0.32 }, legsPerCard: [2, 3] }),
  "MS-C3": ms({ noPlayFloor: { step1: 0.20, later: 0.20, final: 0.32 }, pool: "eligible-universe" }),
  "MS-C4": ms({ noPlayFloor: { step1: 0.20, later: 0.20, final: 0.32 }, cadenceDays: 3 }),
});

export function policyHash(name) {
  const p = POLICIES[name]; if (!p) throw new Error(`unknown policy ${name}`);
  return createHash("sha256").update(JSON.stringify({ name, ...p, ladder: LADDERS[p.ladder] })).digest("hex").slice(0, 12);
}
export function policyId(name) { return `${name}@${policyHash(name)}`; }
export const LIVE_POLICY = Object.freeze({ "bank-builder": "BB-LEGACY", moonshot: "MS-LEGACY" });
