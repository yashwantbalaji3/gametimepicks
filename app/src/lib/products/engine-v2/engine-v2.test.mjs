/**
 * Product Engine V2 — RecommendationReceiptV2 + the one leg floor. Every firewall rule from the Session 7
 * charter (§5, §6, §16, §17, §65) is a test here, built on a fully-eligible leg with ONE thing changed, so
 * each assertion proves that exact gate and nothing else.
 *
 * Run: npx tsx --test src/lib/products/engine-v2/engine-v2.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeReceiptV2, PROBABILITY_KIND, PROBABILITY_DETAIL, LEG_CLASS, receiptIdFor } from "./receipt.mjs";
import { evaluateReceiptV2, EXCLUSION, LEG_FLOOR_V2, coverageTable } from "./eligibility.mjs";
import { receiptFromV1Candidate, receiptFromNflBoardCandidate, receiptFromMlbOptimizerLeg } from "./sources.mjs";

const AS_OF = "2026-10-03T14:00:00Z";
const team = (over = {}) => ({
  legClass: LEG_CLASS.TEAM, sport: "mlb", eventId: "776001", eventStartUtc: "2026-10-03T20:00:00Z",
  teamId: "mlb-team-119", opponentId: "mlb-team-144", family: "team_result", marketKey: "mlb_moneyline", side: "home",
  sportsbook: "draftkings", price: -150, marketCapturedAt: "2026-10-03T13:00:00Z", marketReceiptId: "docs/MLB_DAILY_PIPELINE.md",
  marketImpliedProbability: 0.58, probabilityDetail: PROBABILITY_DETAIL.MARKET_IMPLIED, settlementSupport: "PROVEN", ...over,
});
const player = (over = {}) => ({
  legClass: LEG_CLASS.PLAYER, sport: "mlb", eventId: "776001", eventStartUtc: "2026-10-03T20:00:00Z",
  participantId: "mlb-player-1", teamId: "mlb-team-119", family: "anytime_hr", marketKey: "anytime_hr", side: "yes", binary: true,
  sportsbook: "draftkings", price: 300, marketCapturedAt: "2026-10-03T13:00:00Z", marketReceiptId: "r",
  probabilityDetail: PROBABILITY_DETAIL.MODEL_PUBLISHED, modelProbability: 0.31, publicationStatus: "PUBLISHED",
  availabilityState: "AVAILABLE_ROLE_CONFIRMED", roleState: "AVAILABLE_ROLE_CONFIRMED", settlementSupport: "PROVEN", ...over,
});
const ev = (input, asOf = AS_OF) => evaluateReceiptV2(makeReceiptV2(input), { asOf });
const only = (input, code) => {
  const e = ev(input);
  assert.deepEqual(e.exclusionCodes, [code], `expected exactly ${code}, got ${e.exclusionCodes.join(",")}`);
  assert.equal(e.eligible, false);
};

test("baselines: a market-priced MLB team leg and a cleared model-backed player leg are ELIGIBLE", () => {
  assert.deepEqual(ev(team()).exclusionCodes, []);
  assert.deepEqual(ev(player()).exclusionCodes, []);
});

test("probabilityKind is explicit, and a market number can never sit in `probability`", () => {
  const m = makeReceiptV2(team({ modelProbability: 0.58 }));
  assert.equal(m.forecast.probabilityKind, PROBABILITY_KIND.MARKET_IMPLIED);
  assert.equal(m.forecast.probability, null, "market-implied must never be carried as the model's probability");
  assert.equal(m.market.marketImpliedProbability, 0.58);
  const p = makeReceiptV2(player());
  assert.equal(p.forecast.probabilityKind, PROBABILITY_KIND.MODEL);
  assert.equal(p.forecast.probability, 0.31);
});

test("a demoted or experimental model number is kept, labelled, and NOT readable as `probability`", () => {
  for (const d of [PROBABILITY_DETAIL.MODEL_DEMOTED, PROBABILITY_DETAIL.MODEL_EXPERIMENTAL]) {
    const r = makeReceiptV2(player({ probabilityDetail: d }));
    assert.equal(r.forecast.probability, null);
    assert.equal(r.forecast.unusableModelProbability, 0.31);
  }
});

test("missing probability is null, never 0%; an unread price is null, never -110", () => {
  const r = makeReceiptV2(player({ modelProbability: undefined, price: undefined }));
  assert.equal(r.forecast.probability, null);
  assert.equal(r.market.price, null);
  const z = makeReceiptV2(player({ modelProbability: 0 }));
  assert.equal(z.forecast.probability, null, "0 is not a probability a model publishes for a priced leg");
  assert.ok(ev(player({ price: undefined })).exclusionCodes.includes(EXCLUSION.MARKET_MISSING));
});

/* ── §65 firewall probes: one change from an eligible leg, exactly one code ───────────────────── */
test("PAUSED / REJECTED / HOLD / ESTIMATE_BELOW_BAR / ROLE_UNCERTAIN / SCAFFOLD_ONLY families never pass", () => {
  for (const s of ["PAUSED", "REJECTED", "HOLD", "HOLDING", "STOP", "UNEVALUATED", "ESTIMATE_BELOW_BAR", "ROLE_UNCERTAIN", "SCAFFOLD_ONLY", "MARKET_CONTEXT_ONLY", "DEMOTE_TO_MARKET_CONTEXT", null]) {
    only(player({ publicationStatus: s }), EXCLUSION.FAMILY_NOT_CLEARED);
  }
});
test("a demoted model's side (F-1) is refused", () => only(player({ probabilityDetail: PROBABILITY_DETAIL.MODEL_DEMOTED }), EXCLUSION.MODEL_DEMOTED));
test("UFC (SCAFFOLD_ONLY) and NBA (HISTORICAL_ONLY) never enter, whatever the leg says", () => {
  only(team({ sport: "ufc", family: "fight_result" }), EXCLUSION.SPORT_GATED);
  only(team({ sport: "nba" }), EXCLUSION.SPORT_GATED);
  only(team({ sport: "nfl" }), EXCLUSION.SPORT_GATED);
  only(team({ sport: "epl" }), EXCLUSION.SPORT_GATED);
});
test("a started event, an event inside the cutoff and an unknown start are refused", () => {
  only(team({ eventStartUtc: "2026-10-03T13:59:00Z", marketCapturedAt: "2026-10-03T12:00:00Z" }), EXCLUSION.EVENT_STARTED);
  only(team({ eventStartUtc: "2026-10-03T14:10:00Z" }), EXCLUSION.EVENT_INSIDE_CUTOFF);
  only(team({ eventStartUtc: null }), EXCLUSION.EVENT_START_UNKNOWN);
});
test("a stale price, a price captured after the as-of instant, and an out-of-range price are refused", () => {
  only(team({ marketCapturedAt: "2026-10-02T01:00:00Z" }), EXCLUSION.ODDS_STALE);
  only(team({ marketCapturedAt: "2026-10-03T14:05:00Z" }), EXCLUSION.ODDS_CAPTURED_AFTER_AS_OF);
  only(team({ price: -900 }), EXCLUSION.ODDS_OUT_OF_RANGE);
});
test("a missing market receipt (book / price / capture time / line) is MARKET_MISSING", () => {
  only(team({ sportsbook: null }), EXCLUSION.MARKET_MISSING);
  only(team({ marketCapturedAt: null }), EXCLUSION.MARKET_MISSING);
  only(team({ family: "team_total", line: null }), EXCLUSION.MARKET_MISSING);
});
test("OUT / QUESTIONABLE / INACTIVE players are refused; AVAILABLE_ROLE_UNCERTAIN is ROLE_UNCERTAIN", () => {
  for (const s of ["OUT", "QUESTIONABLE", "INACTIVE", "DOUBTFUL", "UNKNOWN"]) only(player({ availabilityState: s, roleState: s }), EXCLUSION.AVAILABILITY_BLOCKED);
  only(player({ availabilityState: "AVAILABLE_ROLE_UNCERTAIN", roleState: "AVAILABLE_ROLE_UNCERTAIN" }), EXCLUSION.ROLE_UNCERTAIN);
});
test("an unproven settlement path is refused", () => only(player({ settlementSupport: "SCHEDULED_UNPROVEN" }), EXCLUSION.SETTLEMENT_UNSUPPORTED));
test("an over-allocated rushing pool row is refused even if it reaches the universe", () => only(player({ withheldReason: "WITHHELD_POOL_OVER_ALLOCATED" }), EXCLUSION.RUSH_POOL_WITHHELD));
test("a distribution with no probability mapping has NO_PROBABILITY", () => only(player({ probabilityDetail: PROBABILITY_DETAIL.MODEL_DISTRIBUTION_UNCONVERTED, modelProbability: null }), EXCLUSION.NO_PROBABILITY));
test("market-implied admission is F1's and only for TEAM markets", () => {
  assert.equal(LEG_FLOOR_V2.admitsMarketImplied, true, "F1 = A admits market constructions transitionally (MARKET_PRICED_LEG_POLICY)");
  only(player({ probabilityDetail: PROBABILITY_DETAIL.MARKET_IMPLIED, modelProbability: null, marketImpliedProbability: 0.25 }), EXCLUSION.MARKET_IMPLIED_NOT_ADMITTED);
  const closed = { ...LEG_FLOOR_V2, admitsMarketImplied: false };
  assert.deepEqual(evaluateReceiptV2(makeReceiptV2(team()), { asOf: AS_OF, floor: closed }).exclusionCodes, [EXCLUSION.MARKET_IMPLIED_NOT_ADMITTED]);
});
test("asOf is required — a wall clock never enters the floor", () => {
  assert.throws(() => evaluateReceiptV2(makeReceiptV2(team()), {}));
});

/* ── adapters ─────────────────────────────────────────────────────────────────────────────────── */
test("v1 MLB team candidate → MARKET_IMPLIED team receipt with its book, capture and receipt carried", () => {
  const r = receiptFromV1Candidate({ sport: "mlb", eventId: "1", eventStartUtc: "2026-10-03T20:00:00Z", entityIds: ["a", "b"], marketFamily: "team_result", marketKey: "mlb_moneyline", side: "home", line: null, forecastOwner: "mlb/team-markets", forecastClass: "MARKET_IMPLIED_NO_FORECAST", modelStatus: "MARKET_CONTEXT", probability: null, marketImpliedProbability: 0.6, oddsForSide: { american: -160, bookmaker: "draftkings", capturedAt: "2026-10-03T13:00:00Z", receipt: "R" }, sourceReceiptRefs: ["x"] });
  assert.equal(r.forecast.probabilityKind, "MARKET_IMPLIED");
  assert.equal(r.forecast.probability, null);
  assert.equal(r.market.price, -160);
  assert.equal(r.market.marketReceiptId, "R");
  assert.equal(r.context.settlementSupport, "PROVEN");
});
test("an experimental model's probability (NFL / EPL) is MODEL_EXPERIMENTAL, never usable", () => {
  const r = receiptFromV1Candidate({ sport: "epl", eventId: "e", eventStartUtc: "2026-10-10T14:00:00Z", entityIds: ["h", "a"], marketFamily: "team_result", marketKey: "epl_match_result", side: "home", forecastClass: "EXPERIMENTAL_MODEL", probability: 0.52, marketImpliedProbability: 0.5, oddsForSide: null });
  assert.equal(r.forecast.probabilityDetail, "MODEL_EXPERIMENTAL");
  assert.equal(r.forecast.probability, null);
  assert.equal(r.forecast.unusableModelProbability, 0.52);
});
test("an NFL board TD row keeps the model's published probability; a yardage row is an unconverted distribution", () => {
  const td = receiptFromNflBoardCandidate({ eventId: "nfl-1", eventStartUtc: "2026-10-04T17:00:00Z", participantId: "p", marketFamily: "anytime_td", binary: true, price: 150, sportsbook: "draftkings", marketCapturedAt: "2026-10-04T12:00:00Z", modelProjection: null, modelProbability: 0.4, probabilityBasis: "MODEL_PUBLISHED", familyState: "PUBLISHED", participation: "AVAILABLE_ROLE_UNCERTAIN", settlementSupport: "SCHEDULED_UNPROVEN" });
  assert.equal(td.forecast.probability, 0.4);
  assert.equal(td.market.side, "yes");
  const yd = receiptFromNflBoardCandidate({ eventId: "nfl-1", participantId: "p", marketFamily: "player_rush_yds", binary: false, line: 54.5, modelProjection: 60, modelProbability: null, probabilityBasis: "MODEL_DISTRIBUTION_UNCONVERTED", familyState: "PUBLISHED" });
  assert.equal(yd.forecast.probabilityKind, "NONE");
  assert.equal(yd.forecast.probabilityDetail, "MODEL_DISTRIBUTION_UNCONVERTED");
});
test("an MLB optimizer leg on a demoted family is MODEL_DEMOTED and borrows no capture time", () => {
  const r = receiptFromMlbOptimizerLeg({ gameId: "g", playerId: 1, market: "batter_hits", side: "Over", line: 0.5, oddsForSide: -200, bookmaker: "draftkings", commenceTime: "2026-10-03T20:00:00Z" }, { demotedFamilies: new Set(["MLB:batter_hits"]), generatedAt: "2026-10-03T12:00:00Z" });
  assert.equal(r.forecast.probabilityDetail, "MODEL_DEMOTED");
  assert.equal(r.market.marketCapturedAt, null, "the file's generatedAt is not a capture time");
  assert.ok(evaluateReceiptV2(r, { asOf: AS_OF }).exclusionCodes.includes(EXCLUSION.MODEL_DEMOTED));
});

test("receipt ids are stable and coverage counts GTP vs market-only vs none separately", () => {
  const a = makeReceiptV2(team()), b = makeReceiptV2(team());
  assert.equal(a.receiptId, b.receiptId);
  assert.equal(receiptIdFor(a), "mlb:776001:mlb_moneyline:-:home:");
  const rows = [team(), player(), player({ probabilityDetail: "MODEL_DISTRIBUTION_UNCONVERTED", modelProbability: null })].map((x) => { const r = makeReceiptV2(x); return { receipt: r, evaluation: evaluateReceiptV2(r, { asOf: AS_OF }) }; });
  const t = coverageTable(rows);
  const fam = Object.fromEntries(t.map((x) => [x.family, x]));
  assert.equal(fam.team_result.marketOnly, 1);
  assert.equal(fam.anytime_hr.gtpProbabilityUsable, 1);
  assert.equal(fam.anytime_hr.noProbability, 1);
});
