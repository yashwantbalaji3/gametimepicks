/**
 * ProductEligibleLeg v1 — mutation probes. Every rule in the contract header has a probe that
 * flips ONE thing and asserts the verdict moves. A guard that only ever sees a clean fixture cannot
 * tell "we refuse it" from "it happens not to occur".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateLeg, guardLegs, buildManifest, publicReasonFor, REASON, FORECAST_CLASS, LEG_BOUNDS, MARKET_PRICED_LEG_POLICY, PRODUCT_ELIGIBLE_LEG_SCHEMA_VERSION } from "./contract.mjs";
import { canEnterPredictionProducts } from "../../sport-capability-registry.ts";

const AS_OF = "2026-09-20T10:00:00Z";
const START = "2026-09-20T17:10:00Z";
function candidate(over = {}) {
  return {
    sport: "mlb", eventId: "823570", eventStartUtc: START, entityIds: ["mlb-team-121", "mlb-team-143"],
    marketFamily: "team_result", marketKey: "mlb_moneyline", side: "home", line: null,
    forecastOwner: "mlb/team-markets", forecastId: null, forecastClass: FORECAST_CLASS.MARKET_IMPLIED_NO_FORECAST, modelStatus: "MARKET_CONTEXT",
    probability: null, marketImpliedProbability: 0.6033,
    oddsForSide: { american: -171, bookmaker: "draftkings", capturedAt: "2026-09-20T09:57:29Z", receipt: "docs/receipts/ODDS_AUTHORIZATION_P171.md" },
    publishedAt: "2026-09-20T09:57:29Z", sourceReceiptRefs: ["mlb/team-markets/2026-09-20.json"],
    displayMatchup: "Philadelphia Phillies @ New York Mets", displaySelection: "New York Mets to win",
    ...over,
  };
}

test("a clean market-priced MLB leg is eligible, and says it is market-priced", () => {
  const leg = evaluateLeg(candidate(), { asOf: AS_OF });
  assert.equal(leg.productEligible, true);
  assert.deepEqual(leg.eligibilityReasonCodes, [REASON.MARKET_PRICED_NO_FORECAST]);
  assert.equal(leg.probability, null, "a de-vigged price is not a probability the contract will carry as one");
  assert.equal(leg.marketImpliedProbability, 0.6033);
  assert.equal(leg.legId, "mlb:823570:mlb_moneyline:home");
  assert.equal(leg.schemaVersion, PRODUCT_ELIGIBLE_LEG_SCHEMA_VERSION);
  assert.equal(MARKET_PRICED_LEG_POLICY.gate, "F1");
});

test("sport gate: a sport the registry refuses is refused even with a perfect record (the NBA lesson)", () => {
  for (const sport of ["nba", "nfl", "ufc", "epl"]) {
    assert.equal(canEnterPredictionProducts(sport), false, `${sport} must be registry-ineligible for this probe to mean anything`);
    const leg = evaluateLeg(candidate({ sport, forecastClass: FORECAST_CLASS.VALIDATED_MODEL, probability: 0.61, modelStatus: "VALIDATED" }), { asOf: AS_OF });
    assert.equal(leg.productEligible, false, sport);
    assert.ok(leg.eligibilityReasonCodes.includes(REASON.SPORT_NOT_ELIGIBLE), sport);
  }
  const unknown = evaluateLeg(candidate({ sport: "cricket" }), { asOf: AS_OF });
  assert.ok(unknown.eligibilityReasonCodes.includes(REASON.SPORT_UNKNOWN));
});

test("status guard: every never-promote status refuses", () => {
  for (const s of ["REJECTED", "STOP", "PAUSED", "HOLDING", "SHADOW", "PRIVATE", "HISTORICAL_ONLY", "unsupported"]) {
    const leg = evaluateLeg(candidate({ modelStatus: s }), { asOf: AS_OF });
    assert.equal(leg.productEligible, false, s);
    assert.ok(leg.eligibilityReasonCodes.includes(REASON.MODEL_STATUS_BLOCKED), s);
  }
});

test("private/shadow and experimental forecast classes never reach a product", () => {
  const priv = evaluateLeg(candidate({ forecastClass: FORECAST_CLASS.PRIVATE_OR_SHADOW }), { asOf: AS_OF });
  assert.ok(priv.eligibilityReasonCodes.includes(REASON.FORECAST_PRIVATE_OR_SHADOW));
  const exp = evaluateLeg(candidate({ forecastClass: FORECAST_CLASS.EXPERIMENTAL_MODEL, probability: 0.6 }), { asOf: AS_OF });
  assert.equal(exp.productEligible, false);
  assert.ok(exp.eligibilityReasonCodes.includes(REASON.FORECAST_EXPERIMENTAL));
  assert.equal(exp.probability, null, "an experimental owner's number is not carried as a probability");
});

test("a validated owner's probability is carried; an invalid one refuses", () => {
  const ok = evaluateLeg(candidate({ forecastClass: FORECAST_CLASS.VALIDATED_MODEL, probability: 0.58, modelStatus: "VALIDATED" }), { asOf: AS_OF });
  assert.equal(ok.productEligible, true); assert.equal(ok.probability, 0.58);
  assert.ok(!ok.eligibilityReasonCodes.includes(REASON.MARKET_PRICED_NO_FORECAST));
  for (const p of [0, 1, 1.2, -0.1, "0.6", null]) {
    const bad = evaluateLeg(candidate({ forecastClass: FORECAST_CLASS.VALIDATED_MODEL, probability: p, modelStatus: "VALIDATED" }), { asOf: AS_OF });
    assert.equal(bad.productEligible, false, String(p));
    assert.ok(bad.eligibilityReasonCodes.includes(REASON.PROBABILITY_INVALID), String(p));
  }
});

test("missing price is PRICE_UNAVAILABLE, never a zero", () => {
  for (const o of [null, {}, { american: -150 }, { american: -150, bookmaker: "dk" }, { american: NaN, bookmaker: "dk", capturedAt: AS_OF, receipt: "r" }]) {
    const leg = evaluateLeg(candidate({ oddsForSide: o }), { asOf: AS_OF });
    assert.equal(leg.productEligible, false);
    assert.ok(leg.eligibilityReasonCodes.includes(REASON.PRICE_UNAVAILABLE));
    assert.equal(leg.oddsForSide === null || leg.oddsForSide.american !== 0, true);
  }
});

test("price bounds, capture timing and staleness", () => {
  const base = candidate().oddsForSide;
  assert.ok(evaluateLeg(candidate({ oddsForSide: { ...base, american: LEG_BOUNDS.oddsMin - 1 } }), { asOf: AS_OF }).eligibilityReasonCodes.includes(REASON.PRICE_OUT_OF_RANGE));
  assert.ok(evaluateLeg(candidate({ oddsForSide: { ...base, american: LEG_BOUNDS.oddsMax + 1 } }), { asOf: AS_OF }).eligibilityReasonCodes.includes(REASON.PRICE_OUT_OF_RANGE));
  // captured after first pitch → a live line is not a pregame market
  assert.ok(evaluateLeg(candidate({ oddsForSide: { ...base, capturedAt: "2026-09-20T17:43:00Z" } }), { asOf: "2026-09-20T18:00:00Z" }).eligibilityReasonCodes.includes(REASON.PRICE_CAPTURED_AFTER_START));
  // captured after the as-of instant → lookahead
  assert.ok(evaluateLeg(candidate({ oddsForSide: { ...base, capturedAt: "2026-09-20T12:00:00Z" } }), { asOf: AS_OF }).eligibilityReasonCodes.includes(REASON.PRICE_CAPTURED_AFTER_AS_OF));
  // older than the freshness window → stale
  assert.ok(evaluateLeg(candidate({ oddsForSide: { ...base, capturedAt: "2026-09-19T09:00:00Z" } }), { asOf: AS_OF }).eligibilityReasonCodes.includes(REASON.STALE));
});

test("event timing: started and inside-cutoff refuse; an unparseable start refuses", () => {
  assert.ok(evaluateLeg(candidate(), { asOf: "2026-09-20T17:10:00Z" }).eligibilityReasonCodes.includes(REASON.EVENT_STARTED));
  assert.ok(evaluateLeg(candidate(), { asOf: "2026-09-20T16:50:00Z" }).eligibilityReasonCodes.includes(REASON.EVENT_INSIDE_CUTOFF));
  assert.ok(evaluateLeg(candidate({ eventStartUtc: "tonight" }), { asOf: AS_OF }).eligibilityReasonCodes.includes(REASON.MISSING_IDENTITY));
});

test("identity and owner refs are required; the side is never transformed", () => {
  for (const over of [{ eventId: null }, { marketKey: "" }, { side: null }, { sport: null }]) {
    assert.ok(evaluateLeg(candidate(over), { asOf: AS_OF }).eligibilityReasonCodes.includes(REASON.MISSING_IDENTITY), JSON.stringify(over));
  }
  for (const over of [{ forecastOwner: null }, { sourceReceiptRefs: [] }, { sourceReceiptRefs: null }]) {
    assert.ok(evaluateLeg(candidate(over), { asOf: AS_OF }).eligibilityReasonCodes.includes(REASON.MISSING_OWNER_REF), JSON.stringify(over));
  }
  const leg = evaluateLeg(candidate({ side: "Over" }), { asOf: AS_OF });
  assert.equal(leg.side, "Over");
});

test("null vs zero: a null line stays null; a zero line is a number", () => {
  assert.equal(evaluateLeg(candidate({ line: null }), { asOf: AS_OF }).line, null);
  assert.equal(evaluateLeg(candidate({ line: 0 }), { asOf: AS_OF }).line, 0);
  assert.equal(evaluateLeg(candidate({ line: "8.5" }), { asOf: AS_OF }).line, null, "a string line is not a line");
});

test("read-time guard refuses a leg the artifact calls eligible when the registry no longer agrees, and a malformed schema", () => {
  const good = evaluateLeg(candidate(), { asOf: AS_OF });
  const smuggled = { ...evaluateLeg(candidate({ sport: "nba" }), { asOf: AS_OF }), productEligible: true, eligibilityReasonCodes: [] };
  const wrongSchema = { ...good, schemaVersion: 2 };
  const { kept, refused } = guardLegs([good, smuggled, wrongSchema, null], { asOf: AS_OF });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].legId, good.legId);
  assert.equal(refused.length, 3);
  assert.ok(refused[0].reasons.includes(REASON.SPORT_NOT_ELIGIBLE));
  assert.deepEqual(refused[1].reasons, ["SCHEMA_MISMATCH"]);
});

test("read-time guard re-evaluates timing at the caller's clock: a leg eligible at 10:00 is refused once its event has started", () => {
  const good = evaluateLeg(candidate(), { asOf: AS_OF });
  const later = guardLegs([good], { asOf: "2026-09-20T18:00:00Z" });
  assert.equal(later.kept.length, 0);
  assert.ok(later.refused[0].reasons.includes(REASON.EVENT_STARTED));
});

test("correlation keys name only what the leg names", () => {
  const leg = evaluateLeg(candidate(), { asOf: AS_OF });
  assert.ok(leg.correlationKeys.includes("event:mlb:823570"));
  assert.ok(leg.correlationKeys.includes("entity:mlb:mlb-team-121"));
  assert.ok(leg.correlationKeys.includes("family:team_result"));
  assert.ok(leg.correlationKeys.includes("sport:mlb"));
  assert.ok(leg.correlationKeys.some((k) => k.startsWith("start:")));
});

test("manifest tells 'owner produced nothing' apart from 'nothing qualified', and public copy never echoes reason codes", () => {
  const eligible = evaluateLeg(candidate(), { asOf: AS_OF });
  const noPrice = evaluateLeg(candidate({ oddsForSide: null, eventId: "1" }), { asOf: AS_OF });
  const nfl = evaluateLeg(candidate({ sport: "nfl", eventId: "nfl-1", forecastClass: FORECAST_CLASS.EXPERIMENTAL_MODEL, probability: 0.6, modelStatus: "PUBLIC_EXPERIMENTAL" }), { asOf: AS_OF });
  const m = buildManifest({ date: "2026-09-20", asOf: AS_OF, sports: { mlb: { rawForecastCount: 14, publicForecastCount: 14, legs: [eligible, noPrice] }, nfl: { rawForecastCount: 16, publicForecastCount: 16, legs: [nfl] }, ufc: { rawForecastCount: 0, publicForecastCount: 0, legs: [] } } });
  assert.equal(m.sports.mlb.eligibleLegCount, 1);
  assert.equal(m.sports.mlb.rejectedByReason[REASON.PRICE_UNAVAILABLE], 1);
  assert.equal(m.sports.mlb.marketPricedNoForecastCount, 2);
  assert.equal(m.sports.nfl.eligibleLegCount, 0);
  assert.equal(m.sports.nfl.registryPermitsProductLegs, false);
  assert.equal(m.sports.ufc.eventCount, 0);
  assert.equal(publicReasonFor(m.sports.mlb), "1 eligible legs");
  assert.equal(publicReasonFor(m.sports.nfl), "not eligible for prediction products");
  assert.equal(publicReasonFor(m.sports.ufc), "not eligible for prediction products");
  assert.equal(publicReasonFor({ registryPermitsProductLegs: true, rawForecastCount: 0, eligibleLegCount: 0 }), "no events");
  assert.equal(publicReasonFor({ registryPermitsProductLegs: true, rawForecastCount: 5, eligibleLegCount: 0, noPriceCount: 3 }), "no usable prices");
  for (const s of Object.values(m.sports)) for (const code of Object.keys(REASON)) assert.ok(!publicReasonFor(s).includes(code));
});
