import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  evaluateLegV2, eligibilityFunnel, PROBABILITY_BASIS as PB, REASON_V2 as R,
  PRODUCT_ELIGIBLE_LEG_V2_SCHEMA_VERSION,
} from "./v2.mjs";
import { NFL_FAMILY_MARKET_SHAPE, candidatesFromNflBoard } from "./from-nfl-board.mjs";
import { SETTLEMENT_SUPPORT as SS } from "../candidate-universe.mjs";

const ASOF = "2026-09-26T23:23:23Z";
const H12 = 12 * 3_600_000;
const ctx = { asOf: ASOF, maxPriceAgeMs: H12 };

const ok = (over = {}) => ({
  sport: "nfl", eventId: "nfl-1", participantId: "nfl-athlete-1", participant: "A",
  marketFamily: "player_rush_yds", familyState: "PUBLISHED", binary: false,
  line: 69.5, price: -110, sportsbook: "draftkings", marketCapturedAt: "2026-09-26T16:49:46Z",
  modelProjection: 38.02, modelProbability: 0.41, probabilityBasis: PB.MODEL_PUBLISHED,
  participation: "AVAILABLE_ROLE_CONFIRMED", settlementSupport: SS.PROVEN, ...over,
});

test("a fully-satisfied V2 leg is ELIGIBLE and carries the full field set", () => {
  const l = evaluateLegV2(ok(), ctx);
  assert.equal(l.eligible, true, JSON.stringify(l.explicitIneligibilityReasons));
  assert.equal(l.schemaVersion, PRODUCT_ELIGIBLE_LEG_V2_SCHEMA_VERSION);
  assert.equal(l.productEligibility, "ELIGIBLE");
  /* Every field the products were promised. A missing one is a silent contract regression. */
  for (const f of [
    "sport", "eventId", "participantId", "marketFamily", "sportsbook", "line", "price",
    "marketCapturedAt", "modelProjection", "modelProbability", "probabilityBasis", "modelVersion",
    "calibrationVersion", "modelStatus", "productEligibility", "availabilityState",
    "availabilityObservedAt", "roleState", "roleConfidence", "freshness", "settlementState",
    "settlementSupported", "correlationTags", "provenance", "source", "explicitIneligibilityReasons",
  ]) assert.ok(f in l, `V2 leg is missing ${f}`);
});

/* ── THE ANTI-MASQUERADE RULE ───────────────────────────────────────────────────────────────── */

test("🔴 a market-implied probability CANNOT be carried as modelProbability", () => {
  /*
   * All 78 MLB legs in today's manifest are de-vigged bookmaker prices admitted because V1 treats
   * MARKET_PRICED_NO_FORECAST as informational. V2 does not flip that policy — the admission is a
   * founder decision — but the number is MOVED, so a selector cannot read the book's figure as ours
   * even by accident. A reason code alone could be ignored; a null cannot.
   */
  const l = evaluateLegV2(ok({ probabilityBasis: PB.MARKET_IMPLIED, modelProbability: 0.52 }), ctx);
  assert.equal(l.modelProbability, null, "the book's number must not sit in modelProbability");
  assert.equal(l.marketImpliedProbability, 0.52, "it is preserved, just not as ours");
  assert.ok(l.explicitIneligibilityReasons.includes(R.NO_MODEL_PROBABILITY));
  assert.ok(l.explicitIneligibilityReasons.includes(R.PROBABILITY_IS_MARKET_IMPLIED));
  assert.equal(l.eligible, false);
});

test("an unconverted distribution is its own basis, not a missing one", () => {
  /* 551 NFL rows are here. Collapsing them to NONE would hide "we have a distribution and have not
     converted it" behind "we have nothing" — two different next actions. */
  const l = evaluateLegV2(ok({ probabilityBasis: PB.MODEL_DISTRIBUTION_UNCONVERTED, modelProbability: null, modelProjection: 38.02 }), ctx);
  assert.equal(l.probabilityBasis, PB.MODEL_DISTRIBUTION_UNCONVERTED);
  assert.equal(l.modelProjection, 38.02);
  assert.equal(l.modelProbability, null);
  assert.ok(l.explicitIneligibilityReasons.includes(R.NO_MODEL_PROBABILITY));
  /* And it is NOT reported as market-implied — that would blame the wrong subsystem. */
  assert.ok(!l.explicitIneligibilityReasons.includes(R.PROBABILITY_IS_MARKET_IMPLIED));
});

test("a probability with no declared basis is not trusted", () => {
  const l = evaluateLegV2(ok({ probabilityBasis: undefined, modelProbability: 0.41 }), ctx);
  assert.equal(l.probabilityBasis, PB.NONE);
  assert.equal(l.modelProbability, null, "an undeclared basis defaults to NONE, so the number is not ours");
});

/* ── THE DIMENSIONS V1 COULD NOT EXPRESS ────────────────────────────────────────────────────── */

test("role, availability, family state and settlement each produce their own typed reason", () => {
  const cases = [
    [{ participation: "AVAILABLE_ROLE_UNCERTAIN" }, R.ROLE_NOT_CONFIRMED],
    [{ participation: "QUESTIONABLE" }, R.AVAILABILITY_BLOCKED],
    [{ familyState: "ESTIMATE_BELOW_BAR" }, R.FAMILY_STATE_NOT_CLEARED],
    [{ familyState: "ROLE_UNCERTAIN" }, R.FAMILY_STATE_NOT_CLEARED],
    [{ settlementSupport: SS.SCHEDULED_UNPROVEN }, R.SETTLEMENT_NOT_PROVEN],
    [{ settlementSupport: SS.UNSUPPORTED }, R.SETTLEMENT_NOT_PROVEN],
    [{ marketCapturedAt: "2026-09-20T00:00:00Z" }, R.STALE],
    [{ eventId: null }, R.MISSING_IDENTITY],
  ];
  for (const [over, reason] of cases) {
    const l = evaluateLegV2(ok(over), ctx);
    assert.ok(l.explicitIneligibilityReasons.includes(reason), `${JSON.stringify(over)} → expected ${reason}, got ${l.explicitIneligibilityReasons}`);
  }
});

test("settlementState survives as a tri-state, not a boolean", () => {
  assert.equal(evaluateLegV2(ok({ settlementSupport: SS.SCHEDULED_UNPROVEN }), ctx).settlementState, SS.SCHEDULED_UNPROVEN);
  assert.equal(evaluateLegV2(ok({ settlementSupport: SS.UNSUPPORTED }), ctx).settlementState, SS.UNSUPPORTED);
  assert.equal(evaluateLegV2(ok(), ctx).settlementSupported, true);
  assert.equal(evaluateLegV2(ok({ settlementSupport: SS.SCHEDULED_UNPROVEN }), ctx).settlementSupported, false);
});

test("correlation tags name sport, event, family, entity and team", () => {
  const l = evaluateLegV2(ok({ team: "CAR" }), ctx);
  for (const t of ["sport:nfl", "event:nfl:nfl-1", "family:player_rush_yds", "entity:nfl:nfl-athlete-1", "team:nfl:CAR"]) {
    assert.ok(l.correlationTags.includes(t), `missing tag ${t} in ${JSON.stringify(l.correlationTags)}`);
  }
});

/* ── THE EXTRACTOR ──────────────────────────────────────────────────────────────────────────── */

test("🔴 anytime_td prices live under yesOdds — a family's price key is DECLARED, not guessed", () => {
  /*
   * A throwaway harness read `overOdds ?? price` and reported all 275 TD rows as unpriced, blaming
   * the market stage for a drop that belongs two stages later at family state. Per-family shapes are
   * declared so a renamed field shows up as a GAP, not as a zero.
   */
  assert.equal(NFL_FAMILY_MARKET_SHAPE.anytime_td.priceKey, "yesOdds");
  assert.equal(NFL_FAMILY_MARKET_SHAPE.anytime_td.binary, true);
  assert.equal(NFL_FAMILY_MARKET_SHAPE.player_rush_yds.priceKey, "overOdds");

  const board = {
    providerEventId: "401872949", kickoffUtc: "2026-09-27T17:00Z", matchup: "CAR @ CLE",
    generatedAt: ASOF,
    players: [{
      playerId: "nfl-athlete-1", name: "A", team: "CAR", participation: "AVAILABLE_ROLE_UNCERTAIN",
      markets: {
        anytime_td: { probability: 0.4465, market: { yesOdds: -125, sportsbook: "draftkings", capturedAt: "2026-09-26T16:49:46Z" } },
        player_rush_yds: { median: 38.02, market: { line: 69.5, overOdds: -110, sportsbook: "draftkings", capturedAt: "2026-09-26T16:49:46Z" } },
      },
    }],
  };
  const { candidates, unknownFamilies } = candidatesFromNflBoard(board, {
    familyState: new Map([["anytime_td", "ROLE_UNCERTAIN"], ["player_rush_yds", "PUBLISHED"]]),
    settlementSupportFor: () => SS.SCHEDULED_UNPROVEN,
    probabilityBasisFor: ({ projection, probability }) => probability != null ? PB.MODEL_PUBLISHED : projection != null ? PB.MODEL_DISTRIBUTION_UNCONVERTED : PB.NONE,
  });
  assert.deepEqual(unknownFamilies, []);
  const td = candidates.find((c) => c.marketFamily === "anytime_td");
  assert.equal(td.price, -125, "the TD price must be found, or it reads as an unpriced market");
  assert.equal(td.line, null, "a binary market has no line, and null is the truth here");
  assert.equal(td.binary, true);
  const rush = candidates.find((c) => c.marketFamily === "player_rush_yds");
  assert.equal(rush.price, -110);
  assert.equal(rush.line, 69.5);
});

test("an UNDECLARED family is refused, not read as unpriced", () => {
  /* A `??` fallback chain would accept any shape; a new market must surface as a gap. */
  const board = { providerEventId: "1", generatedAt: ASOF, players: [{ playerId: "p", markets: { player_kicking_pts: { median: 7, market: { line: 7.5, overOdds: -110 } } } }] };
  const { candidates, unknownFamilies } = candidatesFromNflBoard(board, {
    familyState: new Map(), settlementSupportFor: () => SS.UNSUPPORTED, probabilityBasisFor: () => PB.NONE,
  });
  assert.deepEqual(candidates, []);
  assert.deepEqual(unknownFamilies, ["player_kicking_pts"]);
});

/* ── THE FUNNEL ─────────────────────────────────────────────────────────────────────────────── */

test("each funnel stage is a SUBSET of the one above, and the binding stage is named", () => {
  const legs = [
    evaluateLegV2(ok(), ctx),                                                    // eligible
    evaluateLegV2(ok({ participation: "AVAILABLE_ROLE_UNCERTAIN" }), ctx),        // lost at role
    evaluateLegV2(ok({ familyState: "ESTIMATE_BELOW_BAR" }), ctx),                // lost at family
    evaluateLegV2(ok({ line: null, price: null }), ctx),                          // lost at market
  ];
  const f = eligibilityFunnel(legs);
  const r = f.stages.map((s) => s.remaining);
  for (let i = 1; i < r.length; i++) assert.ok(r[i] <= r[i - 1], `stage ${i} (${r[i]}) exceeds the one above (${r[i - 1]}) — stages are not subsets`);
  assert.equal(r[0], 4);
  assert.equal(f.eligible, 1);
  assert.equal(f.verdict, "CANDIDATES_AVAILABLE");
  assert.equal(f.bindingStage, null, "nothing was lost outright, so there is no binding stage");
});

test("a BINARY leg survives the 'priced + model output' stage on a probability alone", () => {
  /*
   * ⚠ THE FIX THAT HAD NO TEST. Stage 2 originally required `modelProjection`, so all 275 anytime_td
   * rows — which carry a probability and a price but no mean/median — dropped there and the funnel
   * blamed the market stage for a loss that belongs at family state. Every other funnel test uses a
   * numeric leg, so reverting the fix changed nothing until this case existed.
   */
  const td = evaluateLegV2(ok({
    marketFamily: "anytime_td", binary: true, line: null, price: -125,
    modelProjection: null, modelProbability: 0.4465, probabilityBasis: PB.MODEL_PUBLISHED,
    familyState: "ROLE_UNCERTAIN",
  }), ctx);
  assert.equal(td.modelProjection, null);
  assert.equal(td.modelProbability, 0.4465);

  const f = eligibilityFunnel([td]);
  const byStage = Object.fromEntries(f.stages.map((s) => [s.stage, s.remaining]));
  assert.equal(byStage["priced + model output"], 1, "a binary leg with a probability and a price IS priced with a model output");
  assert.equal(byStage["PUBLISHED family"], 0, "and it is lost at family state, which is where the real block is");
  assert.equal(f.bindingStage, "PUBLISHED family");
});

test("a funnel that loses everything at one stage NAMES that stage", () => {
  /* The real Sunday shape: 340 survive availability, 0 survive role. */
  const legs = [1, 2, 3].map(() => evaluateLegV2(ok({ participation: "AVAILABLE_ROLE_UNCERTAIN" }), ctx));
  const f = eligibilityFunnel(legs);
  assert.equal(f.bindingStage, "role valid");
  assert.equal(f.verdict, "NO_QUALIFYING_PLAY");
  assert.equal(f.eligible, 0);
});

test("V1's behaviour is not altered by V2 — the committed manifest must not move", () => {
  /* V2 composes V1; it must not change what V1 decides, because V1 drives the committed artifact
     and today's public products behind a frozen baseline. */
  const src = fs.readFileSync(new URL("./v2.mjs", import.meta.url), "utf8");
  assert.match(src, /import \{ evaluateLeg, REASON, correlationKeysFor \} from "\.\/contract\.mjs"/,
    "V2 must COMPOSE V1, not reimplement its gates");
  const v1 = fs.readFileSync(new URL("./contract.mjs", import.meta.url), "utf8");
  assert.match(v1, /PRODUCT_ELIGIBLE_LEG_SCHEMA_VERSION = 1/, "V1 stays at schema 1");
});
