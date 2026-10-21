/**
 * Parlay Lab V2 · the unified cross-sport candidate. Run from app/: npx tsx --test src/lib/parlays/v2/candidate.test.mjs
 * Every candidate below is a FIXTURE (lib/parlays/v2/__fixtures__/cross-sport-fixtures.mjs) — not real picks or prices.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  toCandidate, evaluateCandidate, evaluatePool, checkCombination, candidatesFromPublished, candidateKey, marketFamily,
  CANDIDATE_SCHEMA, ELIGIBILITY, PROVENANCE, POOL_STATE, FIXTURE_LABEL, CANDIDATE_REASONS, COMBINATION_REASONS,
  CROSS_SPORT_CORRELATION_CAPS_ENABLED, PROPOSED_CROSS_SPORT_CORRELATION_CAPS,
} from "./candidate.mjs";
import { canEnterPredictionProducts } from "../../sport-capability-registry.ts";
import { injectedEligible } from "./__fixtures__/v2-fixtures.mjs";
import { NOW, COVERAGE, FIXTURE_LEAGUE_GATE, QUALIFIED_POOL, ZERO_POOL, REJECTIONS, combinations, fx } from "./__fixtures__/cross-sport-fixtures.mjs";

const ctx = (extra = {}) => ({ now: NOW, coverage: COVERAGE, isVerifiedOperator: injectedEligible, canEnterLeague: FIXTURE_LEAGUE_GATE, ...extra });
const codesOf = (c) => c.eligibility.reasons.map((r) => r.code);
const evalAll = (legs, extra) => legs.map((l) => evaluateCandidate(l, ctx(extra)));

/* ── the schema ──────────────────────────────────────────────────────────────────────────────────────────────── */

test("the unified shape carries every field, for every league", () => {
  const FIELDS = ["schema", "league", "eventId", "gameStart", "player", "market", "side", "line", "book", "americanOdds", "capturedAt",
    "model", "modelVersion", "probability", "uncertainty", "eligibility", "eventLockAt"];
  for (const c of QUALIFIED_POOL) {
    for (const k of FIELDS) assert.ok(k in c, `${c.league}: ${k}`);
    assert.equal(c.schema, CANDIDATE_SCHEMA);
    assert.equal(Date.parse(c.gameStart) - Date.parse(c.eventLockAt), 30 * 60 * 1000, "locks 30 minutes before start");
    assert.equal(c.provenance, PROVENANCE.FIXTURE);
  }
});

test("model stamp: parsed from the leg's modelId; a market-priced leg has no model and no probability", () => {
  const ufc = toCandidate({ sport: "ufc", eventId: "1", market: "fight_winner", selection: "A — win", side: "win", modelId: "ufc-fight-model@e657fc40b64d", modelProbability: 0.61, startUtc: NOW });
  assert.equal(ufc.model, "ufc-fight-model");
  assert.equal(ufc.modelVersion, "e657fc40b64d");
  assert.equal(ufc.probability, 0.61);
  assert.equal(ufc.uncertainty, null, "no published leg carries an interval");
  const priced = toCandidate({ sport: "mlb", eventId: "1", market: "pitcher_outs", modelProbability: 0.7 });
  assert.equal(priced.model, null);
  assert.equal(priced.probability, null, "a probability without a model stamp is never shown as a model output");
});

test("adapter: published ladders → unified candidates via the existing normalisers, de-duplicated, never FIXTURE", () => {
  const mlbLadder = { date: "2026-10-19", generatedAt: NOW, cards: [
    { slipId: "a", tier: "high", legs: [{ gamePk: 1, gameId: "g1", market: "pitcher_outs", player: "P One", side: "Over", line: 15.5, odds: -110 }] },
    { slipId: "b", tier: "medium", legs: [{ gamePk: 1, gameId: "g1", market: "pitcher_outs", player: "P One", side: "Over", line: 15.5, odds: -110 }] },
  ] };
  const ufc = { date: "2026-10-24", state: "PUBLISHED", cards: [{ slipId: "u", tier: "high", legs: [
    { sport: "ufc", eventId: "401", player: "F One", market: "fight_winner", side: "win", odds: -170, modelProbability: 0.9, modelId: "ufc-fight-model@abc" },
  ] }] };
  const nfl = { date: "2026-10-19", state: "PUBLISHED", cards: [{ slipId: "n", tier: "low", legs: [{ eventId: "nfl-1", market: "moneyline", side: "home", team: "Home", odds: -150 }] }] };
  const epl = { date: "2026-10-24", state: "PUBLISHED", cards: [{ slipId: "e", tier: "low", legs: [{ sport: "epl", eventId: "soccer:epl:a-v-b", market: "match_result", side: "home", team: "A", odds: -247 }] }] };
  const out = candidatesFromPublished({ mlb: { ladder: mlbLadder, board: null }, ladders: { ufc, nfl, epl } });
  assert.deepEqual(out.map((c) => c.league).sort(), ["epl", "mlb", "nfl", "ufc"], "the MLB leg reused across two tiers is one candidate");
  for (const c of out) assert.equal(c.provenance, PROVENANCE.PUBLISHED);
  assert.equal(out.find((c) => c.league === "ufc").model, "ufc-fight-model");
  assert.equal(new Set(out.map(candidateKey)).size, out.length);
});

/* ── (a) cross-sport qualification when qualified candidates exist ──────────────────────────────────────────── */

test("(a) FIXTURE · MLB + NFL + EPL candidates qualify and combine cross-sport — labelled FIXTURE, never real picks", () => {
  const pool = evaluatePool(QUALIFIED_POOL, ctx());
  assert.equal(pool.state, POOL_STATE.QUALIFIED);
  assert.deepEqual(pool.leagues, ["epl", "mlb", "nfl"]);
  assert.equal(pool.rejected.length, 0);
  assert.equal(pool.label, FIXTURE_LABEL);
  const combo = checkCombination(pool.eligible);
  assert.equal(combo.ok, true, JSON.stringify(combo.reasons));
  assert.equal(combo.crossSport, true);
  assert.equal(combo.provenance, PROVENANCE.FIXTURE);
  assert.equal(combo.label, "FIXTURE — not real picks, not real prices");
});

test("(a) under the REAL registry today only MLB may enter: the same NFL and EPL candidates are refused", () => {
  assert.equal(canEnterPredictionProducts("mlb"), true);
  for (const l of ["nfl", "epl", "ufc", "nba"]) assert.equal(canEnterPredictionProducts(l), false, l);
  const pool = evaluatePool(QUALIFIED_POOL, ctx({ canEnterLeague: undefined }));
  assert.deepEqual(pool.leagues, ["mlb"]);
  assert.deepEqual(pool.rejected.map((r) => [r.league, r.reasons]).sort(), [["epl", ["LEAGUE_NOT_ELIGIBLE"]], ["nfl", ["LEAGUE_NOT_ELIGIBLE"]]]);
});

/* ── (b) zero qualified ──────────────────────────────────────────────────────────────────────────────────────── */

test("(b) FIXTURE · a pool where nothing qualifies says so, with every rejection's reasons", () => {
  const pool = evaluatePool(ZERO_POOL, ctx());
  assert.equal(pool.state, POOL_STATE.NONE);
  assert.equal(pool.eligible.length, 0);
  assert.equal(pool.rejected.length, ZERO_POOL.length);
  for (const r of pool.rejected) assert.ok(r.reasons.length >= 1);
  assert.equal(evaluatePool([], ctx()).state, POOL_STATE.NONE, "an empty pool is NO_QUALIFIED_CANDIDATES, never a silent gap");
  assert.equal(checkCombination([]).ok, false);
});

/* ── (c) ineligible or correlated candidates are rejected ───────────────────────────────────────────────────── */

test("(c) each candidate gate refuses with its own code", () => {
  const expect = {
    stale: "PRICE_STALE", suspended: "MARKET_SUSPENDED", questionable: "PARTICIPANT_UNAVAILABLE", out: "PARTICIPANT_UNAVAILABLE",
    locked: "LOCKED", started: "LOCKED", offshoreBook: "BOOK_INELIGIBLE", noBook: "BOOK_INELIGIBLE", nba: "LEAGUE_NOT_ELIGIBLE",
  };
  for (const [name, code] of Object.entries(expect)) {
    const c = evaluateCandidate(REJECTIONS[name], ctx());
    assert.equal(c.eligibility.state, ELIGIBILITY.INELIGIBLE, name);
    assert.ok(codesOf(c).includes(code), `${name}: ${codesOf(c)}`);
    for (const r of c.eligibility.reasons) assert.equal(r.text, CANDIDATE_REASONS[r.code]);
  }
});

test("(c) NBA enters only when the REAL registry says canEnterPredictionProducts('nba') — injection cannot open it", () => {
  assert.equal(canEnterPredictionProducts("nba"), false, "NBA is HISTORICAL_ONLY today");
  const allLeagues = () => true;
  const c = evaluateCandidate(REJECTIONS.nba, ctx({ canEnterLeague: allLeagues }));
  assert.deepEqual(codesOf(c), ["LEAGUE_NOT_ELIGIBLE"]);
});

test("(c) the production seams fail closed: no injected allowlist ⇒ every book refused; no coverage ⇒ refused", () => {
  const c = evaluateCandidate(QUALIFIED_POOL[0], { now: NOW, coverage: COVERAGE });
  assert.ok(codesOf(c).includes("BOOK_INELIGIBLE"));
  assert.ok(codesOf(evaluateCandidate(QUALIFIED_POOL[0], ctx({ coverage: null }))).includes("COVERAGE_UNAVAILABLE"));
  assert.ok(codesOf(evaluateCandidate(fx({ market: "batter_hits", line: 0.5 }), ctx())).includes("MARKET_CONTEXT_FAMILY"));
  assert.throws(() => evaluateCandidate(QUALIFIED_POOL[0], ctx({ now: "not a date" })), TypeError);
});

test("(c) combinations: contradictory sides, two winners, duplicate player + market, same-event pairs (D5)", () => {
  const k = combinations();
  const codes = (legs) => checkCombination(evalAll(legs)).reasons.map((r) => r.code);
  for (const legs of Object.values(k)) for (const l of evalAll(legs)) assert.equal(l.eligibility.state, ELIGIBILITY.ELIGIBLE, "each leg alone is fine");
  assert.ok(codes(k.contradictory).includes("CONTRADICTORY_SIDES"));
  assert.ok(codes(k.contradictory).includes("SAME_EVENT"));
  assert.ok(codes(k.twoWinners).includes("CONTRADICTORY_SIDES"));
  assert.ok(codes(k.duplicate).includes("DUPLICATE_PLAYER_MARKET"));
  assert.deepEqual(codes(k.sameGame), ["SAME_EVENT"]);
  const r = checkCombination(evalAll(k.sameGame)).reasons[0];
  assert.deepEqual(r.legs, [0, 1]);
  assert.equal(r.text, COMBINATION_REASONS.SAME_EVENT);
});

test("(c) an ineligible leg sinks the combination", () => {
  const legs = evalAll([QUALIFIED_POOL[0], REJECTIONS.offshoreBook]);
  const combo = checkCombination(legs);
  assert.equal(combo.ok, false);
  assert.deepEqual(combo.reasons.map((x) => [x.code, x.legs]), [["INELIGIBLE_LEG", [1]]]);
});

/* ── correlation caps: PROPOSED and OFF ──────────────────────────────────────────────────────────────────────── */

test("correlation caps are PROPOSED and disabled by default; they bite only when explicitly applied", () => {
  assert.equal(CROSS_SPORT_CORRELATION_CAPS_ENABLED, false);
  assert.equal(PROPOSED_CROSS_SPORT_CORRELATION_CAPS.status, "PROPOSED");
  const four = evalAll(combinations().fourMlb);
  const off = checkCombination(four);
  assert.equal(off.ok, true, "default: no cap applied");
  assert.equal(off.capsApplied, false);
  const on = checkCombination(four, { applyProposedCaps: true });
  assert.equal(on.ok, false);
  assert.ok(on.reasons.some((x) => x.code === "CORRELATION_CAP" && /league mlb: 4 > 3/.test(x.detail)));
  assert.ok(on.reasons.some((x) => x.code === "CORRELATION_CAP" && /market family pitcher_outs/.test(x.detail)));
  assert.equal(marketFamily("h2h"), "winner");
  assert.equal(marketFamily("match_result"), "winner");
  assert.equal(marketFamily("moneyline"), "winner");
});
