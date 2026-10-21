/**
 * Parlay Lab V2 · NBA candidate source. Run (from app/): npx tsx --test src/lib/parlays/v2/nba-source.test.mjs
 *
 * Every NBA / NFL / UFC input below is a TEST FIXTURE (./__fixtures__/nba-fixtures.mjs): invented games, players,
 * distributions and prices, run through the REAL snapshot, evaluator, NBA leg adapter, candidate gates and card gates.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { LEAN } from "../../consistency/market-evaluator.mjs";
import { REAL_REGISTRY, REFUSAL } from "../../products/nba/nba-leg.mjs";
import { PUBLIC_RISK_TIERS, getRiskBucketForCombinedOdds } from "../risk-odds-bands.mjs";
import { BAND_MAX_LEGS } from "../multi-sport.mjs";
import { legGradingRoute, ROUTE_REFUSAL } from "../leg-grading-route.mjs";
import { combinedPrice } from "./pricing.mjs";
import { FIXTURE_CARD_LABEL, LEG_PROVENANCE, TIER_STATUS, legReasons, recommendCtx, recommendTiers } from "./recommend.mjs";
import { NBA_SOURCE_STATE, SAME_GAME_POLICY, composeCards, nbaCandidateInputs, nbaParlayLab, nbaSourceStatus, toNbaAwareCandidate, toV2Leg } from "./nba-source.mjs";
import {
  CAPTURED_AT, COVERAGE, FIXTURE_NBA_SETTLES, FIXTURE_OPERATORS, FIXTURE_SPORT_GATE, NBA_GAMES, NOW, PERMISSIVE_REGISTRY, TEST_FIXTURE,
  nbaSlate, nflInputs, permissive, ufcInputs, verificationFor,
} from "./__fixtures__/nba-fixtures.mjs";

const OPEN = { nbaRegistry: PERMISSIVE_REGISTRY, canEnterSport: FIXTURE_SPORT_GATE, settlesNba: FIXTURE_NBA_SETTLES, isVerifiedOperator: FIXTURE_OPERATORS };
const lab = (slate = nbaSlate(), extra = {}) => nbaParlayLab({ results: slate.results, snapshots: slate.snapshots, otherInputs: nflInputs(), now: NOW, coverage: COVERAGE, ...OPEN, ...extra });
const allCards = (rec) => rec.tiers.flatMap((t) => t.cards.map((c) => ({ ...c, tierOf: t.tier })));
const nbaLegs = (rec) => allCards(rec).flatMap((c) => c.legs.filter((l) => l.sport === "nba").map((l) => ({ ...l, tierOf: c.tierOf, cardId: c.cardId })));
const ANY_URL = /[a-z][a-z0-9+.-]*:\/\/|www\./i;

test("fixture sanity: every synthetic input is labelled TEST FIXTURE and every NBA leg is provenance TEST_FIXTURE", () => {
  assert.match(TEST_FIXTURE, /TEST FIXTURE/);
  const { results } = nbaSlate();
  assert.equal(results.length, 12);
  for (const r of results) { assert.equal(r.ok, true, JSON.stringify(r.refusal)); assert.equal(r.leg.provenance, "TEST_FIXTURE"); }
});

test("PERMISSIVE TEST registry + fixture prices: all four tiers hold an NBA-only card AND an NBA+NFL card", () => {
  const out = lab();
  const rec = out.recommendation;
  assert.equal(rec.sportGate, "INJECTED");
  assert.equal(rec.provenance, LEG_PROVENANCE.FIXTURE);
  for (const tier of PUBLIC_RISK_TIERS) {
    const t = rec.tiers.find((x) => x.tier === tier);
    assert.equal(t.status, TIER_STATUS.QUALIFIED, `${tier}: ${JSON.stringify(t.reasons)}`);
    const comps = t.cards.map((c) => c.composition.join("+"));
    assert.ok(comps.includes("nba"), `${tier} has an NBA-only card (${comps})`);
    assert.ok(comps.includes("nba+nfl"), `${tier} has an NBA+NFL card (${comps})`);
    for (const c of t.cards) {
      assert.equal(getRiskBucketForCombinedOdds(c.combinedAmerican), tier, `${c.cardId} priced inside its band`);
      assert.ok(c.legs.length >= 2 && c.legs.length <= BAND_MAX_LEGS[tier], `${c.cardId}: ${c.legs.length} legs ≤ ${BAND_MAX_LEGS[tier]}`);
      assert.equal(c.provenance, LEG_PROVENANCE.FIXTURE);
      assert.equal(c.label, FIXTURE_CARD_LABEL, "every fixture card says so");
      assert.equal(c.modelJointProbability, null, "no joint model probability is ever claimed");
      assert.ok(c.notes.includes(SAME_GAME_POLICY.note));
      // the combined price is the recorded leg prices' product, recomputed here from the card's own legs
      assert.equal(combinedPrice(c.legs).american, c.combinedAmerican);
    }
  }
  assert.equal(out.status.state, NBA_SOURCE_STATE.CANDIDATES);
});

test("REAL registry: NBA contributes zero candidates and the board says 'NBA legs need an authorized NBA price'", () => {
  const real = nbaSlate({ registry: REAL_REGISTRY });
  for (const r of real.results) { assert.equal(r.ok, false); assert.ok(r.refusal.reasons.includes(REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE)); }
  const out = nbaParlayLab({ results: real.results, snapshots: real.snapshots, otherInputs: nflInputs(), now: NOW, coverage: COVERAGE, isVerifiedOperator: FIXTURE_OPERATORS });
  assert.equal(out.pool.nbaEligible, 0);
  assert.equal(out.nbaInputs.inputs.length, 0);
  assert.equal(out.composed.cards, 0, "no NBA card is composed — and no NFL-only card is invented either");
  assert.equal(nbaLegs(out.recommendation).length, 0);
  assert.equal(out.status.state, NBA_SOURCE_STATE.PRICE_NOT_AUTHORIZED);
  assert.match(out.status.text, /^NBA legs need an authorized NBA price\./);
  assert.deepEqual(out.recommendation.sportNotes.map((n) => n.state), [NBA_SOURCE_STATE.PRICE_NOT_AUTHORIZED]);
  const s = nbaSourceStatus();
  assert.equal(s.state, NBA_SOURCE_STATE.PRICE_NOT_AUTHORIZED);
  assert.deepEqual(s.gates.map((g) => [g.gate, g.open]), [["registry", false], ["price authorization", false], ["player-prop settlement", false]]);
  assert.doesNotMatch(s.text, /\b(safe|guarantee|lock|sure)\b/i);
});

test("an injected sport gate never launders a leg: published-provenance NBA legs and an un-injected gate both refuse", () => {
  const out = lab();
  const card = out.recommendation.tiers.find((t) => t.tier === "medium").cards.find((c) => c.composition.join("+") === "nba");
  const rawCard = { cardId: "x", tier: "medium", legs: card.legs.map((l) => ({ ...l, eventLabel: l.game })) };
  const noGate = recommendTiers({ candidates: [rawCard], now: NOW, coverage: COVERAGE, isVerifiedOperator: FIXTURE_OPERATORS, settlesNba: FIXTURE_NBA_SETTLES });
  assert.deepEqual(noGate.rejected[0].reasons.includes("SPORT_NOT_ELIGIBLE"), true, "the real registry refuses NBA");
  const laundered = { ...rawCard, legs: rawCard.legs.map((l) => ({ ...l, provenance: LEG_PROVENANCE.PUBLISHED })) };
  const res = recommendTiers({ candidates: [laundered], now: NOW, coverage: COVERAGE, isVerifiedOperator: FIXTURE_OPERATORS, settlesNba: FIXTURE_NBA_SETTLES, canEnterSport: () => true });
  assert.ok(res.rejected[0].reasons.includes("SPORT_NOT_ELIGIBLE"), "a published leg under an injected gate still needs the real registry");
  // candidate gate: a FIXTURE NBA candidate enters only with the injected NBA registry object
  const inputs = nbaCandidateInputs({ results: nbaSlate().results, snapshots: nbaSlate().snapshots }).inputs;
  const c = toNbaAwareCandidate(inputs[0]);
  const pool = nbaParlayLab({ results: nbaSlate().results, snapshots: nbaSlate().snapshots, now: NOW, coverage: COVERAGE, canEnterSport: FIXTURE_SPORT_GATE, settlesNba: FIXTURE_NBA_SETTLES, isVerifiedOperator: FIXTURE_OPERATORS });
  assert.equal(pool.pool.nbaEligible, 0, "no nbaRegistry ⇒ evaluateCandidate keeps NBA on the real registry");
  assert.equal(c.provenance, "FIXTURE");
});

test("settlement: under the REAL NBA settlement contract (team markets only) every NBA player-prop card is refused", () => {
  const out = lab(nbaSlate(), { settlesNba: null });
  assert.equal(out.composed.cards, 0);
  assert.ok(out.composed.refusals.CARD_GATES > 0);
  const leg = toV2Leg(toNbaAwareCandidate(nbaCandidateInputs({ results: nbaSlate().results }).inputs[0]));
  const r = legReasons(leg, recommendCtx({ nowMs: Date.parse(NOW), coverage: COVERAGE, isVerifiedOperator: FIXTURE_OPERATORS, canEnterSport: FIXTURE_SPORT_GATE }));
  assert.deepEqual(r, ["NO_SETTLEMENT_PATH"]);
});

test("negative: an injured / unavailable player is refused — at the evaluator (snapshot status) and at the candidate gate (newer status)", () => {
  const out = nbaSlate({ opts: { participation: { 101: "out" } } });
  const r101 = out.results[0];
  assert.equal(r101.ok, false);
  assert.ok(r101.refusal.reasons.includes(REFUSAL.EVALUATION_NOT_QUALIFIED));
  assert.ok(r101.refusal.evaluatorReasons.includes("PARTICIPATION_NOT_CLEARED"));
  const fresh = nbaSlate();
  const res = lab(fresh, { statusFeed: { 102: "Out" } });
  const rej = res.pool.rejected.find((x) => x.league === "nba");
  assert.ok(rej && rej.reasons.includes("PARTICIPANT_UNAVAILABLE"), JSON.stringify(res.pool.rejected));
  assert.ok(!nbaLegs(res.recommendation).some((l) => l.participant === "102"), "player 102 is on no card");
});

test("negative: missing forecast, unsupported market, stale odds and a one-sided price each refuse the leg", () => {
  const g = NBA_GAMES[0];
  const missing = nbaSlate({ games: [{ ...g, players: [{ ...g.players[0], family: "ast" }] }], snapshotFor: (gg, o) => permissive({ ...gg, players: [{ ...g.players[0] }] }, o) });
  assert.equal(missing.results[0].ok, false);
  assert.ok(missing.evaluations[0].withheldReasons.includes("FAMILY_NOT_IN_SNAPSHOT"));
  const minutes = nbaSlate({ games: [{ ...g, players: [{ ...g.players[0], family: "minutes", line: 30.5 }] }], snapshotFor: (gg, o) => permissive(g, o) });
  assert.ok(minutes.results[0].ok === false && minutes.results[0].refusal.reasons.includes(REFUSAL.FAMILY_NOT_PRODUCT_MARKET));
  const stale = nbaSlate({ games: [g], capturedAt: "2026-11-01T00:30:00.000Z" });
  assert.ok(stale.results.every((r) => !r.ok && r.refusal.evaluatorReasons.includes("PRICE_STALE")));
  const oneSided = nbaSlate({ games: [g], verify: (e, p) => verificationFor(e, p, { underAmerican: null }) });
  assert.ok(oneSided.results.every((r) => !r.ok && r.refusal.reasons.includes(REFUSAL.VERIFICATION_PRICE_MISMATCH)));
  // and a card leg that lost its two-way quote is refused by the card gate
  const leg = toV2Leg(toNbaAwareCandidate(nbaCandidateInputs({ results: nbaSlate().results }).inputs[0]));
  const r = legReasons({ ...leg, twoWay: null }, recommendCtx({ nowMs: Date.parse(NOW), coverage: COVERAGE, isVerifiedOperator: FIXTURE_OPERATORS, canEnterSport: FIXTURE_SPORT_GATE, settlesNba: FIXTURE_NBA_SETTLES }));
  assert.ok(r.includes("PRICE_NOT_TWO_WAY"));
});

test("negative: stale at card time — a card is never composed once a leg's price is past 12 h or its game is inside the cutoff", () => {
  const late = lab(nbaSlate(), { now: "2026-11-02T00:45:00.000Z" });
  for (const l of nbaLegs(late.recommendation)) assert.ok(Date.parse(l.startUtc) - Date.parse("2026-11-02T00:45:00.000Z") >= 30 * 60_000);
  const reasons = late.pool.rejected.flatMap((x) => x.reasons);
  assert.ok(reasons.includes("PRICE_STALE") && reasons.includes("LOCKED"), JSON.stringify(reasons));
});

test("negative: duplicate markets collapse to one, and no card ever repeats a player (one exposure per player per card)", () => {
  const s = nbaSlate();
  const dupe = { ...s.results[0], leg: { ...s.results[0].leg, book: "fanduel", capturedAt: "2026-11-01T12:20:00.000Z" } };
  const conflict = { ok: true, leg: { ...s.results[1].leg, book: "fanduel", side: "UNDER" } };
  const inp = nbaCandidateInputs({ results: [...s.results, dupe, conflict], snapshots: s.snapshots });
  assert.equal(inp.inputs.filter((x) => x.participant === "101").length, 1, "the same market from two books is one market");
  assert.deepEqual(inp.duplicateMarkets.refused.map((x) => x.reason), ["DUPLICATE_MARKET_LEAN_CONFLICT"], "books disagreeing on the lean refuse the market");
  const out = lab();
  for (const c of allCards(out.recommendation)) {
    const players = c.legs.filter((l) => l.participant).map((l) => `${l.sport}:${l.participant}`);
    assert.equal(new Set(players).size, players.length, c.cardId);
  }
});

test("correlation: same-game NBA legs are REFUSED (no independence assumption, no correlated price)", () => {
  assert.equal(SAME_GAME_POLICY.mode, "REFUSE");
  assert.equal(SAME_GAME_POLICY.correlatedMethod, null);
  const out = lab();
  assert.ok(out.composed.refusals.SAME_GAME > 0, "same-game sets were offered to the composer and refused");
  for (const c of allCards(out.recommendation)) assert.equal(new Set(c.legs.map((l) => `${l.sport}:${l.eventId}`)).size, c.legs.length, c.cardId);
  // a hand-built same-game card (players 101 + 102, one game) is withheld and gets no combined price
  const s = nbaSlate();
  const legs = nbaCandidateInputs({ results: s.results.slice(0, 2), snapshots: s.snapshots }).inputs.map((i) => toV2Leg(toNbaAwareCandidate(i)));
  assert.equal(legs[0].eventId, legs[1].eventId);
  assert.equal(combinedPrice(legs).available, false);
  const res = recommendTiers({ candidates: [{ cardId: "sg", tier: "medium", legs }], now: NOW, coverage: COVERAGE, ...OPEN });
  assert.ok(res.rejected[0].reasons.includes("SAME_EVENT"));
  const direct = composeCards({ candidates: [], now: NOW, ctx: recommendCtx({ nowMs: Date.parse(NOW), coverage: COVERAGE }) });
  assert.equal(direct.cards.length, 0);
});

test("provenance: every NBA leg on every card names its snapshot id, model version, odds time and authorization", () => {
  const s = nbaSlate();
  const out = lab(s);
  const bySnap = new Map(s.snapshots.map((x) => [x.eventId, x]));
  const legs = nbaLegs(out.recommendation);
  assert.ok(legs.length > 0);
  for (const l of legs) {
    const snap = bySnap.get(l.eventId);
    assert.equal(l.evidence.snapshotId, snap.snapshotId);
    assert.equal(l.evidence.modelVersion, snap.modelVersions.players[l.market === "player_points" ? "pts" : l.market === "player_rebounds" ? "reb" : l.market === "player_assists" ? "ast" : "threePm"]);
    assert.equal(l.capturedAt, CAPTURED_AT);
    assert.equal(l.evidence.capturedAt, l.capturedAt);
    assert.match(l.evidence.authorizationReceiptRef, /TEST-FIXTURE/);
    assert.equal(l.twoWay.verified, true);
    assert.equal(l.provenance, LEG_PROVENANCE.FIXTURE);
  }
  for (const c of allCards(out.recommendation)) for (const l of c.legs) assert.ok(l.evidence?.snapshotId && l.evidence?.modelVersion && l.capturedAt, `${c.cardId}: ${l.sport} leg carries provenance`);
});

test("consistency: one player-market-snapshot shows the SAME lean and the evaluator's number verbatim on every tier and card", () => {
  const s = nbaSlate();
  const out = lab(s, { perGroup: 3 });
  const evalByKey = new Map(s.evaluations.map((e) => [`${e.identity.eventId}|${e.identity.subjectId}`, e]));
  const seen = new Map();
  const legs = nbaLegs(out.recommendation);
  assert.ok(new Set(legs.map((l) => l.tierOf)).size === 4, "NBA legs appear in all four tiers");
  for (const l of legs) {
    const e = evalByKey.get(`${l.eventId}|${l.participant}`);
    assert.equal(l.side, e.lean === LEAN.OVER ? "over" : "under", "the side is the evaluator's lean");
    assert.ok(Object.is(l.modelProbability, e.lean === LEAN.OVER ? e.pOver : e.pUnder), "probability copied verbatim (Object.is)");
    assert.ok(Object.is(l.evidence.projection.pOver, e.pOver) && Object.is(l.evidence.projection.pUnder, e.pUnder) && Object.is(l.evidence.projection.pPush, e.pPush));
    assert.equal(l.evidence.evaluatorKey, e.identity.key);
    const k = `${l.evidence.snapshotId}|${l.participant}|${l.market}|${l.line}`;
    const prev = seen.get(k);
    if (prev) { assert.equal(prev.side, l.side); assert.ok(Object.is(prev.p, l.modelProbability)); assert.equal(prev.price, l.price); }
    else seen.set(k, { side: l.side, p: l.modelProbability, price: l.price });
  }
  assert.ok([...seen.keys()].length < legs.length, "at least one market appears on more than one card");
});

test("Smart Betslip comparison identity (Lane E, PR 1165): every NBA card leg keeps sport, eventId, playerId, family + market, side, line", () => {
  const s = nbaSlate();
  const out = lab(s);
  const legs = nbaLegs(out.recommendation);
  assert.ok(legs.length > 0);
  const ids = new Set(NBA_GAMES.flatMap((g) => g.players.map((p) => p.id)));
  for (const l of legs) {
    assert.equal(l.sport, "nba");
    assert.match(l.eventId, /^\d+$/);
    assert.ok(ids.has(l.playerId), `playerId is the providerAthleteId (${l.playerId})`);
    assert.equal(l.playerId, l.participant);
    assert.ok(["pts", "reb", "ast", "threePm"].includes(l.family), l.family);
    assert.match(l.market, /^player_/);
    assert.ok(l.side === "over" || l.side === "under");
    assert.ok(Number.isFinite(l.line));
  }
  // a non-NBA leg without a player id says null — never a name in the id slot
  for (const c of allCards(out.recommendation)) for (const l of c.legs.filter((x) => x.sport !== "nba")) assert.equal(l.playerId, null);
});

test("determinism and no links: the same inputs give the same board, and nothing carries a URL", () => {
  const a = lab(); const b = lab();
  assert.deepEqual(a.recommendation, b.recommendation);
  assert.doesNotMatch(JSON.stringify(a.recommendation), ANY_URL);
});

test("cross-sport NBA+UFC fixture cards, and settlement routing never grades an NBA leg with another sport's rules", () => {
  const s = nbaSlate();
  const gate = (x) => ["nba", "ufc"].includes(String(x).toLowerCase());
  const out = nbaParlayLab({ results: s.results, snapshots: s.snapshots, otherInputs: ufcInputs(), now: NOW, coverage: COVERAGE, ...OPEN, canEnterSport: gate });
  const ufcCards = allCards(out.recommendation).filter((c) => c.composition.join("+") === "nba+ufc");
  assert.ok(ufcCards.length > 0, "an NBA+UFC fixture card qualifies");
  const all = [...allCards(out.recommendation), ...allCards(lab().recommendation)];
  for (const c of all) for (const l of c.legs) {
    assert.ok(l.sport, "every leg names its sport — none can fall to the legacy MLB default");
    const r = legGradingRoute(l);
    if (l.sport === "nba") assert.deepEqual(r, { route: null, refusal: { code: ROUTE_REFUSAL.UNSUPPORTED_SPORT, sport: "nba" } });
    else assert.equal(r.route, l.sport);
  }
  assert.equal(legGradingRoute({ sport: "NBA" }).route, null, "case does not matter");
});
