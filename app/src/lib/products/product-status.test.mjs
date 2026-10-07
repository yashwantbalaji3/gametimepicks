/**
 * PROTOTYPE tests · Stage 4 prep (Lane C). They pin INVARIANTS already in force (fail closed, no market price
 * as a GTP number, no inferred identity, pregame freezing, all reasons reported) and document the conflicts
 * the founder is asked about. They do not pin any open mapping choice beyond "unknown fails closed".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProductStatus, deriveMaturity, assertFrozenPregame, participationOf, PARTICIPATION, MATURITY, PRODUCT, REASON, REASON_TEXT, LIVE_RECORD_SCOPE } from "./product-status.mjs";

const ASOF = "2026-10-06T16:00:00Z";
const START = "2026-10-06T23:05:00Z";
const H = 3600e3;
const health = (state, generatedAt = "2026-10-06T12:00:00Z") => ({ state, generatedAt });

/** A clean, fully-evidenced MLB team leg priced by the market (F1 shape). */
const base = (over = {}) => ({
  product: PRODUCT.BANK_BUILDER, asOf: ASOF,
  sport: "mlb", family: "mlb_moneyline", eventId: "824785", eventStartUtc: START,
  registryState: "FULL_MODEL", coverage: { status: "supported", demoted: false },
  health: health("WATCH"), maxHealthAgeMs: 72 * H,
  probabilityKind: "MARKET_IMPLIED", marketImpliedProbability: 0.55, marketImpliedAdmitted: true,
  market: { price: -120, capturedAt: "2026-10-06T15:00:00Z" }, maxPriceAgeMs: 12 * H,
  settlementProven: true,
  ...over,
});

test("a fully evidenced market-priced team leg is eligible, and its price is never reported as a GTP probability", () => {
  const s = resolveProductStatus(base({ gtpProbability: 0.61 }));
  assert.equal(s.eligible, true);
  assert.equal(s.reasonCode, null);
  assert.equal(s.probability.gtp, null, "a market-implied leg carries no GameTimePicks number even if one is passed");
  assert.equal(s.probability.marketImplied, 0.55);
  assert.equal(s.frozenPregame, true);
});

test("F1 is product policy passed in, not assumed: without admission a price-only leg is refused", () => {
  const s = resolveProductStatus(base({ marketImpliedAdmitted: false }));
  assert.equal(s.eligible, false);
  assert.ok(s.reasonCodes.includes(REASON.MARKET_IMPLIED_NOT_ADMITTED));
});

test("#998 class: a demoted MLB prop family never enters a promoted product, but still displays as market context", () => {
  const prop = { family: "batter_hits", coverage: { status: "experimental", demoted: true }, probabilityKind: "MODEL", gtpProbability: 0.7, isPlayer: true, availabilityState: "ACTIVE_EXPECTED", roleState: "STARTER" };
  const bb = resolveProductStatus(base(prop));
  assert.equal(bb.eligible, false);
  assert.ok(bb.reasonCodes.includes(REASON.MODEL_DEMOTED));
  assert.notEqual(bb.maturity, MATURITY.ESTABLISHED, "a FULL_MODEL sport cannot lift a demoted family");
  const fc = resolveProductStatus(base({ ...prop, product: PRODUCT.FORECAST }));
  assert.equal(fc.displayable, true);
  assert.equal(fc.familyState, "DEMOTED_TO_MARKET_CONTEXT");
});

test("FAIL CLOSED: an unreadable coverage document refuses every promoted product (today six readers fail open)", () => {
  for (const product of [PRODUCT.BANK_BUILDER, PRODUCT.SUGGESTED_PARLAY, PRODUCT.MOONSHOT, PRODUCT.BUILD_YOUR_OWN, PRODUCT.TOP_BOARD]) {
    const s = resolveProductStatus(base({ product, coverage: null }));
    assert.equal(s.eligible, false, product);
    assert.ok(s.reasonCodes.includes(REASON.COVERAGE_UNKNOWN), product);
  }
});

test("live-record pause: a fresh BREACHED verdict withdraws the call and refuses promotion; the evidence stays displayable", () => {
  const paused = { family: "mlb_total", health: health("BREACHED"), probabilityKind: "MODEL", gtpProbability: 0.54 };
  const fc = resolveProductStatus(base({ ...paused, product: PRODUCT.FORECAST }));
  assert.equal(fc.maturity, MATURITY.PAUSED);
  assert.equal(fc.displayable, true);
  assert.equal(fc.eligible, false, "the paused CALL is withdrawn");
  const bb = resolveProductStatus(base(paused));
  assert.equal(bb.eligible, false);
  assert.equal(bb.reasonCode, REASON.MODEL_PAUSED);
});

test("stale scorecard: display keeps today's founder-approved rule (no verdict, no pause); promotion fails closed", () => {
  const stale = { family: "mlb_total", health: health("BREACHED", "2026-09-30T00:00:00Z"), probabilityKind: "MODEL", gtpProbability: 0.54 };
  const fc = resolveProductStatus(base({ ...stale, product: PRODUCT.FORECAST }));
  assert.notEqual(fc.maturity, MATURITY.PAUSED);
  assert.equal(fc.freshness.health, "STALE");
  const bb = resolveProductStatus(base(stale));
  assert.equal(bb.eligible, false);
  assert.ok(bb.reasonCodes.includes(REASON.HEALTH_UNKNOWN));
  const none = resolveProductStatus(base({ ...stale, health: null }));
  assert.ok(none.reasonCodes.includes(REASON.HEALTH_UNKNOWN));
});

test("experimental NFL family: forecast continues; promotion refused unless a founder family grant exists", () => {
  const nfl = { sport: "nfl", family: "nfl_anytime_td", eventId: "401772", registryState: "EXPERIMENTAL_PUBLIC", coverage: { status: "experimental", demoted: false }, health: health("HOLDING"), probabilityKind: "MODEL", gtpProbability: 0.41, isPlayer: true, availabilityState: "ACTIVE_EXPECTED", roleState: "STARTER" };
  const fc = resolveProductStatus(base({ ...nfl, product: PRODUCT.FORECAST }));
  assert.equal(fc.maturity, MATURITY.EXPERIMENTAL);
  assert.equal(fc.eligible, true, "forecast broadly");
  const sp = resolveProductStatus(base({ ...nfl, product: PRODUCT.SUGGESTED_PARLAY }));
  assert.equal(sp.eligible, false, "promote cautiously");
  assert.ok(sp.reasonCodes.includes(REASON.MODEL_EXPERIMENTAL));
  assert.ok(sp.reasonCodes.includes(REASON.SPORT_GATED));
  const granted = resolveProductStatus(base({ ...nfl, product: PRODUCT.SUGGESTED_PARLAY, familyGranted: true }));
  assert.ok(!granted.reasonCodes.includes(REASON.MODEL_EXPERIMENTAL) && !granted.reasonCodes.includes(REASON.SPORT_GATED));
});

test("every failing gate is reported, not the first; the primary code follows precedence and has public text", () => {
  const s = resolveProductStatus(base({
    sport: "nfl", family: "nfl_player_rush_yds", registryState: "EXPERIMENTAL_PUBLIC", coverage: { status: "experimental", demoted: false },
    probabilityKind: "MODEL", gtpProbability: 0.52, isPlayer: true, availabilityState: "AVAILABLE_ROLE_UNCERTAIN",
    market: { price: -110, capturedAt: "2026-10-04T00:00:00Z" },
  }));
  for (const c of [REASON.MODEL_EXPERIMENTAL, REASON.SPORT_GATED, REASON.ROLE_UNCERTAIN, REASON.ODDS_STALE]) assert.ok(s.reasonCodes.includes(c), c);
  assert.equal(s.reasonCode, REASON.MODEL_EXPERIMENTAL);
  assert.equal(typeof s.reasonText, "string");
  for (const code of Object.values(REASON)) assert.ok(REASON_TEXT[code], `public text for ${code}`);
});

test("price freshness has no default: a promoted priced product without maxPriceAgeMs is refused as stale", () => {
  const s = resolveProductStatus(base({ maxPriceAgeMs: undefined }));
  assert.ok(s.reasonCodes.includes(REASON.ODDS_STALE));
});

test("Stage 3 Q5 alignment: missing identity is refused everywhere and never inferred", () => {
  const s = resolveProductStatus(base({ product: PRODUCT.FORECAST, eventId: null }));
  assert.equal(s.displayable, false);
  assert.equal(s.reasonCode, REASON.IDENTITY_MISSING);
  assert.equal(s.eventId, null, "no identity is filled in");
});

test("unknown sport fails closed", () => {
  const s = resolveProductStatus(base({ product: PRODUCT.FORECAST, sport: "cricket", registryState: null }));
  assert.equal(s.eligible, false);
  assert.equal(s.reasonCode, REASON.SPORT_UNKNOWN);
});

test("Stage 3 Q1/Q3 alignment: a decision at or after the start is not a decision; stored ones must be pregame", () => {
  const late = resolveProductStatus(base({ asOf: START }));
  assert.equal(late.eligible, false);
  assert.equal(late.frozenPregame, false);
  assert.ok(late.reasonCodes.includes(REASON.EVENT_STARTED));
  assert.throws(() => assertFrozenPregame(late, START));
  assert.equal(assertFrozenPregame(resolveProductStatus(base()), START), true);
  const noStart = resolveProductStatus(base({ eventStartUtc: null }));
  assert.ok(noStart.reasonCodes.includes(REASON.EVENT_START_UNKNOWN), "unknown start is not 'not started'");
});

test("maturity is the least mature layer, and an unlisted source word is UNKNOWN (never ESTABLISHED)", () => {
  assert.equal(deriveMaturity(["registry:FULL_MODEL", "coverage:demoted"]), MATURITY.RESEARCH);
  assert.equal(deriveMaturity(["registry:FULL_MODEL", "coverage:supported"]), MATURITY.ESTABLISHED);
  assert.equal(deriveMaturity(["registry:FULL_MODEL", "health:BREACHED"]), MATURITY.PAUSED);
  assert.equal(deriveMaturity(["registry:FULL_MODEL", "coverage:some_new_word"]), MATURITY.UNKNOWN);
  assert.equal(deriveMaturity([]), MATURITY.UNKNOWN);
});

test("DOCUMENTED CONFLICT (founder Q6): with today's registry row, the contract would hide UFC forecasts that /ufc publishes", () => {
  // sport-capability-registry.ts still holds UFC at SCAFFOLD_ONLY (2026-07-23, "de-vigged price with a capped
  // nudge"), while market-coverage.ts (P246) and /ufc publish a fitted model since 2026-08-22. Least-mature
  // composition makes the stale row win. This test records the conflict; it does not choose the fix.
  const ufc = resolveProductStatus(base({ product: PRODUCT.FORECAST, sport: "ufc", family: "ufc_winner", registryState: "SCAFFOLD_ONLY", coverage: { status: "experimental", demoted: false }, publicState: "VALIDATED", probabilityKind: "MODEL", gtpProbability: 0.6 }));
  assert.equal(ufc.maturity, MATURITY.RESEARCH);
  assert.equal(ufc.displayable, false);
});

test("Q8 open: the scorecard grades GTP calls; whether it also removes a price-only leg of the same market is passed in", () => {
  const priceOnlyTotal = { family: "mlb_total", health: health("BREACHED") }; // base() is MARKET_IMPLIED (F1 shape)
  const modelOnly = resolveProductStatus(base({ ...priceOnlyTotal, liveRecordScope: LIVE_RECORD_SCOPE.MODEL_ONLY }));
  assert.equal(modelOnly.eligible, true, "MODEL_ONLY: today's leg floor admits the market-priced total leg");
  assert.equal(modelOnly.freshness.health, "NOT_APPLICABLE");
  const allLegs = resolveProductStatus(base({ ...priceOnlyTotal, liveRecordScope: LIVE_RECORD_SCOPE.ALL_LEGS }));
  assert.equal(allLegs.eligible, false);
  assert.equal(allLegs.reasonCode, REASON.MODEL_PAUSED);
  // a price-only leg with no scorecard at all is not refused for HEALTH_UNKNOWN under MODEL_ONLY
  assert.equal(resolveProductStatus(base({ health: null, liveRecordScope: LIVE_RECORD_SCOPE.MODEL_ONLY })).eligible, true);
  assert.throws(() => resolveProductStatus(base({ liveRecordScope: "SOMETIMES" })));
});

test("participation crosswalk: real words from the repo's vocabularies land on the right reason, case-insensitively", () => {
  for (const w of ["CONFIRMED_OUT", "Out", "Injured Reserve", "Suspension", "Day-To-Day", "INJURED", "NOT_ON_ROSTER", "QUESTIONABLE"]) assert.equal(participationOf(w), PARTICIPATION.BLOCKED, w);
  for (const w of ["OFFICIAL_LINEUP", "confirmed", "posted", "ROLE_CONFIRMED", "ACTIVE_CONFIRMED"]) assert.equal(participationOf(w), PARTICIPATION.CONFIRMED, w);
  for (const w of [null, "", "UNKNOWN", "SOURCE_STALE", "EXPECTED_STARTER", "PROJECTED_DEPTH_STARTER", "AVAILABLE_ROLE_UNCERTAIN", "Active", "PROJECTED_LINEUP", "LIMITED", "WHATEVER"]) assert.equal(participationOf(w), PARTICIPATION.UNCERTAIN, String(w));
  const leg = (a, r) => resolveProductStatus(base({ isPlayer: true, availabilityState: a, roleState: r }));
  assert.equal(leg("CONFIRMED_OUT", "CONFIRMED_OUT").reasonCodes.includes(REASON.AVAILABILITY_BLOCKED), true);
  assert.equal(leg("ACTIVE_EXPECTED", "OFFICIAL_LINEUP").reasonCodes.some((c) => c === REASON.ROLE_UNCERTAIN || c === REASON.AVAILABILITY_BLOCKED), false);
  assert.ok(leg("CONFIRMED", null).reasonCodes.includes(REASON.ROLE_UNCERTAIN), "an availability word never stands in for a role");
  assert.ok(leg("Out", "OFFICIAL_LINEUP").reasonCodes.includes(REASON.AVAILABILITY_BLOCKED), "either word blocking blocks");
});
