/**
 * PROPOSED (NOT ACTIVE) SELECTION POLICY VERSIONS FOR NBA PLAYER LEGS.
 *
 * bank-builder@1 and moonshot@2 are frozen (selection-policy.mjs): neither may be edited to admit an NBA player leg.
 * moonshot@2 is team-markets-only by design, and bank-builder@1 records MLB team markets as its candidate source. If
 * NBA player props are ever to enter Bank Builder, that is a NEW version with its own pre-frozen bars, written here
 * as a PROPOSAL so it can be reviewed before any output is seen (the champion / challenger rule in
 * selection-policy.mjs). Nothing reads this file outside its test: it is not in SELECTION_POLICIES, not in
 * CURRENT_POLICY, not the CHALLENGER slot. Adopting it is a founder decision in its own PR.
 *
 * Every number is READ from the constant that already owns it (bank-builder@1 bars, LEG_BOUNDS, BAND_MAX_LEGS) — no
 * new methodology constant is introduced. The only new content is which market kind the version would admit and
 * the extra gates such a leg would need.
 */
import { SELECTION_POLICIES } from "../selection-policy.mjs";
import { LEG_BOUNDS } from "../eligible-leg/contract.mjs";

const BB1 = SELECTION_POLICIES["bank-builder@1"].bars;

export const PROPOSED_NBA_POLICIES = Object.freeze({
  "bank-builder-nba-player@0-proposed": Object.freeze({
    status: "PROPOSED",
    active: false,
    product: "bank-builder",
    basedOn: "bank-builder@1",
    proposedAt: "2026-10-21",
    bars: Object.freeze({
      lanes: BB1.lanes,
      legsPerLane: BB1.legsPerLane,
      maxLegOdds: BB1.maxLegOdds,
      maxLegsPerGame: BB1.maxLegsPerGame,
      seedStake: BB1.seedStake,
      activationCutoffMinutes: BB1.activationCutoffMinutes,
      legOddsMin: LEG_BOUNDS.oddsMin,
      maxPriceAgeMs: LEG_BOUNDS.maxPriceAgeMs,
      marketKinds: Object.freeze(["PLAYER_PROP"]),
      onePlayerExposurePerCard: true,
      sameGame: "REFUSE",
      candidateSource: "products/nba/nba-leg.mjs legs (official snapshot + shared evaluator lean + verified, authorized two-way price)",
      ranking: "unchanged from bank-builder@1 (market-implied joint probability toward the rung goal); the lean is never re-derived",
    }),
    requires: Object.freeze([
      "registry: canEnterPredictionProducts(\"nba\") — NBA is HISTORICAL_ONLY today",
      "price: an NBA odds authorization receipt and an operator-verified two-way price per leg",
      "settlement: an NBA player-prop grader in sports/nba/settlement-contract.mjs (it grades team markets only today)",
      "founder approval of this version, frozen before any of its output is seen",
    ]),
  }),
});
