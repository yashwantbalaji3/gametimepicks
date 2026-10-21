/**
 * Parlay Lab V2 · the four-tier adapter. Run: npx tsx --test src/lib/parlays/v2/recommend.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { recommendTiers, evaluateCard, compareCards, REASONS, TIER_STATUS } from "./recommend.mjs";
import { buildParlayLabV2Model } from "./board-model.mjs";
import { candidatesFromMlbLadder, candidatesFromSportLadder } from "./candidates.mjs";
import { isVerifiedOperator, makeOperatorPredicate, OPERATOR_SEAM, operatorToken } from "./operators.mjs";
import { PUBLIC_RISK_TIERS } from "../risk-odds-bands.mjs";
import {
  injectedEligible, NOW, iso, MIN, HOUR, COVERAGE, leg, card,
  PR1130_ELIGIBLE_OPERATOR_KEYS, PR1130_KNOWN_OFFSHORE_KEYS, OFFSHORE_TITLES,
} from "./__fixtures__/v2-fixtures.mjs";

const run = (candidates, extra = {}) => recommendTiers({ candidates, now: NOW, coverage: COVERAGE, isVerifiedOperator: injectedEligible, ...extra });
const tierOf = (res, t) => res.tiers.find((x) => x.tier === t);
const codes = (t) => t.reasons.map((r) => r.code);

/* ── the seam ────────────────────────────────────────────────────────────────────────────────────────────── */

test("operator seam fails CLOSED while PR #1130 is not merged — every label, eligible or not, is unverified", () => {
  assert.equal(OPERATOR_SEAM.state, "AWAITING_PR_1130");
  for (const l of ["DraftKings", "draftkings", "FanDuel", "BetOnline.ag", "bovada", "", null, undefined, 7]) assert.equal(isVerifiedOperator(l), false, String(l));
});

test("an injected allowlist accepts keys and titles, rejects offshore and unknown books", () => {
  for (const k of PR1130_ELIGIBLE_OPERATOR_KEYS) assert.equal(injectedEligible(k), true, k);
  for (const t of ["DraftKings", "ESPN BET", "BetMGM", "Caesars"]) assert.equal(injectedEligible(t), true, t);
  for (const k of [...PR1130_KNOWN_OFFSHORE_KEYS, ...OFFSHORE_TITLES, "SomeNewBook", "", null]) assert.equal(injectedEligible(k), false, String(k));
  assert.equal(operatorToken("BetOnline.ag"), "betonlineag");
  assert.equal(makeOperatorPredicate([])("draftkings"), false);
});

/* ── four tiers, always ──────────────────────────────────────────────────────────────────────────────────── */

test("exactly the four canonical tiers, in order, whatever the input", () => {
  for (const cands of [[], [card()], [card({ tier: "low" }, [leg({ price: -300 }), leg({ market: "h2h", line: null, price: -250 })])]]) {
    const res = run(cands);
    assert.deepEqual(res.tiers.map((t) => t.tier), [...PUBLIC_RISK_TIERS]);
    assert.deepEqual(res.tiers.map((t) => t.tier), ["low", "medium", "high", "longshot"]);
    for (const t of res.tiers) assert.ok([TIER_STATUS.QUALIFIED, TIER_STATUS.NO_QUALIFYING_PARLAY].includes(t.status));
  }
});

test("an empty day is NO_QUALIFYING_PARLAY in every tier, with a stated reason — never a silent gap", () => {
  const res = run([]);
  for (const t of res.tiers) {
    assert.equal(t.status, TIER_STATUS.NO_QUALIFYING_PARLAY);
    assert.ok(t.reasons.length >= 1);
    for (const r of t.reasons) assert.equal(r.text, REASONS[r.code]);
  }
});

test("a card that passes every gate qualifies in the tier its recorded price falls in, with honest probability fields", () => {
  const res = run([card({ cardId: "ok-high" })]);
  const high = tierOf(res, "high");
  assert.equal(high.status, TIER_STATUS.QUALIFIED);
  const c = high.cards[0];
  assert.equal(c.cardId, "ok-high");
  assert.equal(c.combinedAmerican, 320);
  assert.equal(c.combinedPriceText, "+320");
  assert.ok(Math.abs(c.marketImpliedProbability - 1 / c.combinedDecimal) < 1e-6);
  assert.match(c.marketImpliedLabel, /Market-implied/);
  assert.equal(c.modelJointProbability, null);
  assert.equal(c.modelJointProbabilityReason, "No validated correlation model");
  assert.match(c.dependenceNote, /independent/);
  for (const l of c.legs) for (const k of ["sport", "game", "selection", "line", "book", "price", "capturedAt"]) assert.ok(k in l, k);
  assert.deepEqual(c.source.receipts, ["fixture.json"]);
  for (const t of ["low", "medium", "longshot"]) assert.equal(tierOf(res, t).status, TIER_STATUS.NO_QUALIFYING_PARLAY);
});

test("with the production seam (no injection) the same valid card is refused: price not verified", () => {
  const res = recommendTiers({ candidates: [card()], now: NOW, coverage: COVERAGE });
  const high = tierOf(res, "high");
  assert.equal(high.status, TIER_STATUS.NO_QUALIFYING_PARLAY);
  assert.ok(codes(high).includes("OPERATOR_NOT_VERIFIED"));
  assert.ok(codes(high).includes("OPERATOR_SEAM_CLOSED"));
  assert.equal(res.operatorSeam.state, "AWAITING_PR_1130");
});

/* ── every NO_QUALIFYING reason ──────────────────────────────────────────────────────────────────────────── */

const refusedFor = (legOverride, code, cardOverride = {}) => {
  const res = run([card(cardOverride, [leg(legOverride), leg({ market: "h2h", line: null, side: "home", price: 120, book: "FanDuel" })])]);
  const t = tierOf(res, cardOverride.tier ?? "high");
  assert.equal(t.status, TIER_STATUS.NO_QUALIFYING_PARLAY, code);
  assert.ok(codes(t).includes(code), `${code} not in ${codes(t)}`);
  assert.equal(t.reasons.find((r) => r.code === code).text, REASONS[code]);
  assert.equal(t.cards.length, 0);
  return t;
};

test("stale price (> 12 h) → PRICE_STALE", () => refusedFor({ capturedAt: iso(-13 * HOUR) }, "PRICE_STALE"));
test("undated price → PRICE_TIME_UNKNOWN", () => refusedFor({ capturedAt: null }, "PRICE_TIME_UNKNOWN"));
test("started game → EVENT_STARTED", () => refusedFor({ startUtc: iso(-10 * MIN) }, "EVENT_STARTED"));
test("inside the 30-minute cutoff → INSIDE_CUTOFF", () => refusedFor({ startUtc: iso(20 * MIN) }, "INSIDE_CUTOFF"));
test("unknown start → START_UNKNOWN", () => refusedFor({ startUtc: null }, "START_UNKNOWN"));
test("injury / DNP / inactive status → PARTICIPANT_STATUS", () => {
  for (const s of ["Out", "Injured", "DNP", "inactive", "Questionable", "scratched"]) refusedFor({ participantStatus: s }, "PARTICIPANT_STATUS");
  const res = run([card({}, [leg({ participantStatus: "Active" }), leg({ market: "h2h", line: null, price: 120 })])]);
  assert.equal(tierOf(res, "high").status, TIER_STATUS.QUALIFIED, "an active status is not a flag");
});
test("NBA leg (private research) → SPORT_NOT_ELIGIBLE", () => refusedFor({ sport: "nba" }, "SPORT_NOT_ELIGIBLE"));
test("non-FULL_MODEL sports (EPL, UFC, NFL) → SPORT_NOT_ELIGIBLE", () => {
  for (const sport of ["epl", "ufc", "nfl"]) refusedFor({ sport }, "SPORT_NOT_ELIGIBLE");
});
test("offshore or unlisted book → OPERATOR_NOT_VERIFIED", () => {
  for (const book of [...OFFSHORE_TITLES, ...PR1130_KNOWN_OFFSHORE_KEYS, "SomeNewBook", null]) refusedFor({ book }, "OPERATOR_NOT_VERIFIED");
});
test("invalid mapping (no event, no market, no selection, or a missing line on a lined market) → INVALID_MAPPING", () => {
  refusedFor({ eventId: null }, "INVALID_MAPPING");
  refusedFor({ market: null }, "INVALID_MAPPING");
  refusedFor({ selection: null }, "INVALID_MAPPING");
  refusedFor({ line: null }, "INVALID_MAPPING");
});
test("demoted market family → MARKET_CONTEXT_FAMILY; no coverage document → COVERAGE_UNAVAILABLE (fail closed)", () => {
  refusedFor({ market: "batter_hits", line: 0.5 }, "MARKET_CONTEXT_FAMILY");
  const res = recommendTiers({ candidates: [card()], now: NOW, coverage: null, isVerifiedOperator: injectedEligible });
  assert.ok(codes(tierOf(res, "high")).includes("COVERAGE_UNAVAILABLE"));
});
test("price outside −650…+400 → PRICE_OUT_OF_RANGE; missing price → PRICE_MISSING", () => {
  refusedFor({ price: 450 }, "PRICE_OUT_OF_RANGE", { tier: "longshot" });
  refusedFor({ price: null }, "PRICE_MISSING");
});
test("card price differs from the recorded board → PRICE_MISMATCH", () => refusedFor({ priceMismatch: true }, "PRICE_MISMATCH"));
test("same-game legs → SAME_EVENT (D5), and no combined price is claimed", () => {
  const res = run([card({}, [leg({ eventId: "g1" }), leg({ eventId: "g1", market: "h2h", line: null, price: 120 })])]);
  const high = tierOf(res, "high");
  assert.ok(codes(high).includes("SAME_EVENT"));
  assert.ok(codes(high).includes("OUT_OF_BAND"), "a same-game set has no combined price to band");
});
test("single-leg card → TOO_FEW_LEGS", () => {
  const res = run([card({ tier: "low" }, [leg()])]);
  assert.ok(codes(tierOf(res, "low")).includes("TOO_FEW_LEGS"));
});
test("combined price outside the claimed tier's band → OUT_OF_BAND (the card is not relabelled)", () => {
  const res = run([card({ tier: "low" })]); // +320 claimed as Low
  assert.ok(codes(tierOf(res, "low")).includes("OUT_OF_BAND"));
  assert.equal(tierOf(res, "high").status, TIER_STATUS.NO_QUALIFYING_PARLAY, "a mislabelled card does not leak into another tier");
});
test("stacked same-market legs → DECORRELATION_FAIL at Low (cap 1)", () => {
  const res = run([card({ tier: "low" }, [leg({ price: -300 }), leg({ price: -250 })])]); // both pitcher_outs
  assert.ok(codes(tierOf(res, "low")).includes("DECORRELATION_FAIL"));
});
test("refused cards are reported by id and code only — no legs, books or prices", () => {
  const res = run([card({ cardId: "bad" }, [leg({ book: "BetOnline.ag" }), leg({ market: "h2h", line: null, price: 120 })])]);
  assert.deepEqual(Object.keys(res.rejected[0]).sort(), ["cardId", "reasons", "tier"]);
});

/* ── ranking ─────────────────────────────────────────────────────────────────────────────────────────────── */

test("ranking: model coverage, then freshness, then decorrelation margin, then id — never payout or leg count", () => {
  const h2h = (o = {}) => leg({ market: "h2h", line: null, side: "home", price: 120, ...o });
  const validated = card({ cardId: "z-validated" }, [leg({ forecastClass: "VALIDATED_MODEL" }), h2h()]);
  const fresher = card({ cardId: "y-fresh" }, [leg({ capturedAt: iso(-1 * MIN) }), h2h({ capturedAt: iso(-1 * MIN) })]);
  const older = card({ cardId: "x-older" }, [leg({ capturedAt: iso(-90 * MIN) }), h2h({ capturedAt: iso(-90 * MIN), price: 125 })]); // pays MORE
  const tieA = card({ cardId: "b-tie" }, [leg({ capturedAt: iso(-30 * MIN) }), h2h({ capturedAt: iso(-30 * MIN) })]);
  const tieB = card({ cardId: "a-tie" }, [leg({ capturedAt: iso(-30 * MIN) }), h2h({ capturedAt: iso(-30 * MIN) })]);
  const all = [older, tieA, validated, tieB, fresher];
  const expected = ["z-validated", "y-fresh", "a-tie", "b-tie", "x-older"];
  for (const order of [all, [...all].reverse(), [all[2], all[0], all[4], all[1], all[3]]]) {
    const res = recommendTiers({ candidates: order, now: NOW, coverage: COVERAGE, isVerifiedOperator: injectedEligible, maxCardsPerTier: 10 });
    assert.deepEqual(tierOf(res, "high").cards.map((c) => c.cardId), expected);
  }
  assert.equal(compareCards({ cardId: "a", ranking: { modelQualityCoverage: 0, oldestPriceAgeMinutes: 5, decorrelationMargin: 0 } },
    { cardId: "b", ranking: { modelQualityCoverage: 0, oldestPriceAgeMinutes: 5, decorrelationMargin: 1 } }) > 0, true, "more margin ranks first");
});

test("evaluateCard is deterministic for the same input and clock", () => {
  const c = card();
  const ctx = { nowMs: Date.parse(NOW), families: new Set(), isVerifiedOperator: injectedEligible };
  assert.deepEqual(evaluateCard(c, ctx), evaluateCard(c, ctx));
});

/* ── normalisers ─────────────────────────────────────────────────────────────────────────────────────────── */

test("MLB ladder legs recover book + capture time from the same day's board; no match ⇒ null; price mismatch flagged", () => {
  const ladder = { date: "2026-10-19", generatedAt: iso(-20 * MIN), cards: [{ slipId: "s1", tier: "high", legs: [
    { gameId: "g1", gamePk: 1, player: "A", market: "pitcher_outs", marketLabel: "Outs recorded", side: "Over", line: 15.5, odds: -110 },
    { gameId: "g2", gamePk: 2, player: "B", market: "pitcher_outs", marketLabel: "Outs recorded", side: "Over", line: 14.5, odds: -120 },
    { gameId: "g3", gamePk: 3, player: "C", market: "pitcher_outs", marketLabel: "Outs recorded", side: "Over", line: 13.5, odds: -130 },
  ] }] };
  const board = { date: "2026-10-19", generatedAt: iso(-30 * MIN), props: [
    { gameId: "g1", player: "A", market: "pitcher_outs", point: 15.5, selection: "Over 15.5", americanOdds: -110, provider: "BetMGM", matchup: "X @ Y", startTimeUtc: iso(2 * HOUR) },
    { gameId: "g2", player: "B", market: "pitcher_outs", point: 14.5, selection: "Over 14.5", americanOdds: -125, provider: "FanDuel", matchup: "P @ Q", startTimeUtc: iso(2 * HOUR) },
  ] };
  const [c] = candidatesFromMlbLadder(ladder, board);
  assert.equal(c.legs[0].book, "BetMGM");
  assert.equal(c.legs[0].capturedAt, board.generatedAt);
  assert.equal(c.legs[0].priceMismatch, false);
  assert.equal(c.legs[1].priceMismatch, true);
  assert.equal(c.legs[2].book, null);
  assert.equal(c.legs[2].capturedAt, null);
  assert.equal(candidatesFromMlbLadder(ladder, { ...board, date: "2026-10-18" })[0].legs[0].book, null, "another day's board is never joined");
});

test("sport ladders carry no book name, so their cards are refused as unverified", () => {
  const doc = { state: "PUBLISHED", date: "2026-10-24", cards: [{ slipId: "e1", tier: "medium", legs: [
    { sport: "epl", eventId: "e:a", matchup: "A v B", kickoffUtc: iso(100 * HOUR), market: "match_result", side: "home", line: null, odds: -247, books: 10 },
    { sport: "epl", eventId: "e:c", matchup: "C v D", kickoffUtc: iso(102 * HOUR), market: "total_goals", side: "over", line: 2.5, odds: -187, books: 1 },
  ] }] };
  const cands = candidatesFromSportLadder(doc, "epl");
  assert.equal(cands[0].legs[0].book, null);
  const res = run(cands);
  const med = tierOf(res, "medium");
  assert.ok(codes(med).includes("OPERATOR_NOT_VERIFIED"));
  assert.ok(codes(med).includes("SPORT_NOT_ELIGIBLE"));
  assert.deepEqual(candidatesFromSportLadder({ ...doc, state: "BLOCKED" }, "epl"), []);
});

/* ── serialization scan ──────────────────────────────────────────────────────────────────────────────────── */

const OFFSHORE_NEEDLES = [...PR1130_KNOWN_OFFSHORE_KEYS, ...OFFSHORE_TITLES.map((t) => t.toLowerCase()), "betonline", "mybookie"];
const scan = (json) => OFFSHORE_NEEDLES.filter((n) => json.toLowerCase().includes(n));

test("the /build V2 render model built from today's committed data names no offshore sportsbook", () => {
  const app = process.cwd();
  const model = buildParlayLabV2Model({ dataRoot: path.join(app, "public", "data"), repoRoot: path.resolve(app, ".."), date: "2026-10-19", now: NOW });
  assert.deepEqual(model.tiers.map((t) => t.tier), ["low", "medium", "high", "longshot"]);
  assert.deepEqual(scan(JSON.stringify(model)), []);
});

test("a render model whose candidates carry offshore books still names none of them (refused, and refusals carry no legs)", () => {
  const cands = OFFSHORE_TITLES.map((b, i) => card({ cardId: `off-${i}` }, [leg({ book: b }), leg({ market: "h2h", line: null, price: 120, book: PR1130_KNOWN_OFFSHORE_KEYS[i] })]));
  const res = run([...cands, card({ cardId: "clean" })]);
  assert.equal(tierOf(res, "high").cards.map((c) => c.cardId).join(), "clean");
  assert.deepEqual(scan(JSON.stringify(res)), []);
});
