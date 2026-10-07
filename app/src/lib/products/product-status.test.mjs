/**
 * Stage 4 contract tests (schema 1). They pin the invariants already in force (fail closed, no market price as a GTP
 * number, no inferred identity, pregame freezing, all reasons reported) and the founder decisions of 2026-10-07
 * 03:21Z (Q1–Q9): central freshness table, MODEL-ONLY live record, Top Boards are displays.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveProductStatus, deriveMaturity, assertFrozenPregame, participationOf, PARTICIPATION, MATURITY, PRODUCT, REASON, REASON_TEXT, LIVE_RECORD_SCOPE, FRESHNESS } from "./product-status.mjs";

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

test("Q3 CLOSED: an unreadable coverage document refuses every promoted product (today six readers fail open)", () => {
  for (const product of [PRODUCT.BANK_BUILDER, PRODUCT.SUGGESTED_PARLAY, PRODUCT.MOONSHOT, PRODUCT.BUILD_YOUR_OWN]) {
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

test("Q5 PER-PRODUCT: price age comes from the one central table; promoted 12 h, lab cards 3 days, no live odds", () => {
  for (const p of [PRODUCT.SUGGESTED_PARLAY, PRODUCT.BANK_BUILDER, PRODUCT.MOONSHOT, PRODUCT.BUILD_YOUR_OWN]) assert.equal(FRESHNESS.priceMaxAgeMs[p], 12 * H, p);
  assert.equal(FRESHNESS.priceMaxAgeMs[PRODUCT.LAB_CARD], 72 * H);
  assert.equal(FRESHNESS.scorecardMaxAgeMs, 72 * H);
  assert.equal(FRESHNESS.priceMaxAgeMs[PRODUCT.TOP_BOARD], undefined, "a Top Board ranks forecasts and uses no price");
  assert.ok(!Object.keys(FRESHNESS.priceMaxAgeMs).some((k) => /live/i.test(k)), "live odds never inherit a pregame number");
  const cap = (hoursBeforeAsOf) => ({ market: { price: -120, capturedAt: new Date(Date.parse(ASOF) - hoursBeforeAsOf * H).toISOString() }, maxPriceAgeMs: undefined, maxHealthAgeMs: undefined });
  assert.equal(resolveProductStatus(base(cap(11))).eligible, true, "11 h old: fresh for a promoted product");
  assert.ok(resolveProductStatus(base(cap(13))).reasonCodes.includes(REASON.ODDS_STALE), "13 h old: stale for a promoted product");
  const lab = (h) => resolveProductStatus(base({ ...cap(h), product: PRODUCT.LAB_CARD }));
  assert.equal(lab(13).eligible, true, "13 h old: fine on a paper lab card");
  assert.equal(lab(71).eligible, true);
  assert.ok(lab(73).reasonCodes.includes(REASON.ODDS_STALE), "over 3 days: stale even on a lab card");
});

test("Q9 DISPLAY: a Top Board is a display; its verdict never grants product eligibility, and a ruled-out player is not ranked", () => {
  // An experimental, ungranted NFL family: a board may rank it, a promoted product may not use it.
  const nfl = { sport: "nfl", family: "nfl_player_rec_yds", eventId: "401772", registryState: "EXPERIMENTAL_PUBLIC", coverage: { status: "experimental", demoted: false }, health: health("HOLDING"), probabilityKind: "MODEL", gtpProbability: 0.58, isPlayer: true, availabilityState: "ACTIVE_EXPECTED", roleState: "EXPECTED_STARTER" };
  const board = resolveProductStatus(base({ ...nfl, product: PRODUCT.TOP_BOARD }));
  assert.equal(board.eligible, true, "ranked on the board");
  const sp = resolveProductStatus(base({ ...nfl, product: PRODUCT.SUGGESTED_PARLAY }));
  assert.equal(sp.eligible, false, "the board verdict does not carry over to a product");
  // A board needs no coverage document, scorecard or price, but never ranks a ruled-out player or a started game.
  assert.equal(resolveProductStatus(base({ ...nfl, product: PRODUCT.TOP_BOARD, coverage: null, health: null, market: null })).eligible, true);
  const out = resolveProductStatus(base({ ...nfl, product: PRODUCT.TOP_BOARD, availabilityState: "Injured Reserve" }));
  assert.equal(out.eligible, false);
  assert.equal(out.reasonCode, REASON.AVAILABILITY_BLOCKED);
  assert.equal(resolveProductStatus(base({ ...nfl, product: PRODUCT.TOP_BOARD, asOf: START })).eligible, false, "membership is frozen pregame");
  assert.equal(resolveProductStatus(base({ ...nfl, product: PRODUCT.TOP_BOARD, eventStartUtc: null })).eligible, false);
  // a paused family's call is withdrawn from the board too (Q7)
  assert.equal(resolveProductStatus(base({ ...nfl, product: PRODUCT.TOP_BOARD, health: health("BREACHED") })).eligible, false);
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

test("Q6 EXPERIMENTAL: UFC on today's stale row would be hidden; on the corrected row it displays but is never promoted", () => {
  // sport-capability-registry.ts still holds UFC at SCAFFOLD_ONLY (2026-07-23), while market-coverage.ts and /ufc
  // publish a fitted model since 2026-08-22. Slice 4D (with the UFC department) moves the row to EXPERIMENTAL_PUBLIC.
  const ufc = { sport: "ufc", family: "ufc_winner", coverage: { status: "experimental", demoted: false }, publicState: "VALIDATED", probabilityKind: "MODEL", gtpProbability: 0.6 };
  const stale = resolveProductStatus(base({ ...ufc, product: PRODUCT.FORECAST, registryState: "SCAFFOLD_ONLY" }));
  assert.equal(stale.maturity, MATURITY.RESEARCH);
  assert.equal(stale.displayable, false);
  const fixed = resolveProductStatus(base({ ...ufc, product: PRODUCT.FORECAST, registryState: "EXPERIMENTAL_PUBLIC" }));
  assert.equal(fixed.maturity, MATURITY.EXPERIMENTAL);
  assert.equal(fixed.displayable, true);
  for (const product of [PRODUCT.SUGGESTED_PARLAY, PRODUCT.BANK_BUILDER, PRODUCT.MOONSHOT, PRODUCT.BUILD_YOUR_OWN]) {
    const s = resolveProductStatus(base({ ...ufc, product, registryState: "EXPERIMENTAL_PUBLIC" }));
    assert.equal(s.eligible, false, `Q6 does not make UFC eligible for ${product}`);
    assert.ok(s.reasonCodes.includes(REASON.SPORT_GATED));
  }
});

test("Q8 MODEL-ONLY: the scorecard speaks for GTP calls; a price-only leg of a paused market is not removed by it", () => {
  assert.equal(LIVE_RECORD_SCOPE, "MODEL_ONLY");
  const priceOnlyTotal = { family: "mlb_total", health: health("BREACHED") }; // base() is MARKET_IMPLIED (F1 shape)
  const leg = resolveProductStatus(base(priceOnlyTotal));
  assert.equal(leg.eligible, true, "today's leg floor admits the market-priced total leg");
  assert.equal(leg.freshness.health, "NOT_APPLICABLE");
  assert.equal(resolveProductStatus(base({ health: null })).eligible, true, "no HEALTH_UNKNOWN for a price-only leg");
  const call = resolveProductStatus(base({ ...priceOnlyTotal, probabilityKind: "MODEL", gtpProbability: 0.54 }));
  assert.equal(call.reasonCode, REASON.MODEL_PAUSED, "the GTP call on the same market is paused");
});

test("Q7 ALL: a fresh BREACHED verdict maps to Paused on every sport", () => {
  for (const [sport, registryState] of [["mlb", "FULL_MODEL"], ["nfl", "EXPERIMENTAL_PUBLIC"], ["soccer", "EXPERIMENTAL_PUBLIC"], ["ufc", "EXPERIMENTAL_PUBLIC"], ["nba", "EXPERIMENTAL_PUBLIC"]]) {
    const s = resolveProductStatus(base({ product: PRODUCT.FORECAST, sport, family: `${sport}_x`, registryState, coverage: { status: "experimental", demoted: false }, health: health("BREACHED"), probabilityKind: "MODEL", gtpProbability: 0.5 }));
    assert.equal(s.maturity, MATURITY.PAUSED, sport);
    assert.equal(s.displayable, true, `${sport}: evidence stays shown`);
    assert.equal(s.eligible, false, `${sport}: the call is withdrawn`);
  }
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

test("4A ships unwired: only its own test and the replay import the contract (4B–4D add readers one slice at a time)", async () => {
  const { execFileSync } = await import("node:child_process");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const out = execFileSync("git", ["-C", app, "grep", "-l", "-E", "from ['\"][^'\"]*products/product-status(\\.mjs)?['\"]|from ['\"]\\./product-status(\\.mjs)?['\"]", "--", "."], { encoding: "utf8" });
  const importers = out.split("\n").filter(Boolean).sort();
  assert.deepEqual(importers, ["scripts/products/replay-product-status.mjs", "src/lib/products/product-status.test.mjs"]);
});
