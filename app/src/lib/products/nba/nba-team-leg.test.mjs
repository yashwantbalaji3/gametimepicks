/**
 * NBA team-market leg + Bank Builder / Moonshot admission. Run (from app/): npx tsx --test src/lib/products/nba/nba-team-leg.test.mjs
 *
 * Synthetic inputs are TEST FIXTURES (./__fixtures__/permissive.mjs): no NBA price is authorized today, so every price
 * and verification object below is invented and labelled.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { SPORT_LEG_RULES, legSportEligibility } from "../../daily-portfolio/sport-eligibility.ts";
import { bbEligibility } from "../../daily-portfolio/accounting.ts";
import { CHALLENGER_POLICY, CURRENT_POLICY, SELECTION_POLICIES } from "../selection-policy.mjs";
import { LEG_BOUNDS } from "../eligible-leg/contract.mjs";
import { PROVENANCE, nbaLegFromEvaluation } from "./nba-leg.mjs";
import { TIER_REASON, tierView } from "./product-tiers.mjs";
import { TEAM_REFUSAL, nbaProductAdmission, nbaTeamLeg, toEligibleLegCandidate } from "./nba-team-leg.mjs";
import { PROPOSED_NBA_POLICIES } from "./proposed-policies.mjs";
import { NOW, NBA_ID, PERMISSIVE_REGISTRY, TEST_FIXTURE, evaluate, permissiveSnapshot, realShapeSnapshot, verificationFor } from "./__fixtures__/permissive.mjs";

const priceFor = (over = {}) => ({
  label: TEST_FIXTURE, sport: "nba", eventId: NBA_ID, market: "moneyline", book: "draftkings", operatorName: "DraftKings",
  capturedAt: "2026-11-01T12:30:00Z", homeAmerican: -150, awayAmerican: 130, operatorVerified: true,
  verifier: "eligible-operators@1 (TEST FIXTURE)", authorizationReceiptRef: "TEST-FIXTURE-nba-odds-authorization", priceReceiptRef: "TEST-FIXTURE-nba-ml-price",
  ...over,
});
const openLeg = (over = {}) => nbaTeamLeg({ snapshot: permissiveSnapshot(), verification: priceFor(), now: NOW, registry: PERMISSIVE_REGISTRY, ...over });
const ALL_OPEN_RULE = () => ({ eligible: true, reason: "TEST FIXTURE sport rule", code: "TEST_FIXTURE_OPEN" });

test("today: the hand-set sport rule returns a TYPED NBA reason and stays closed", () => {
  const v = legSportEligibility({ sport: "nba" });
  assert.equal(v.eligible, false);
  assert.equal(v.code, "NBA_GATED");
  assert.equal(SPORT_LEG_RULES.NBA.eligible, false);
  assert.deepEqual([...SPORT_LEG_RULES.NBA.gates].map((g) => g.split(":")[0]), ["registry", "price", "settlement"]);
  assert.equal(legSportEligibility({ sport: "MLB" }).code, "ELIGIBLE");
  assert.equal(legSportEligibility({ sport: "NFL" }).code, "NOT_ELIGIBLE");
  assert.equal(legSportEligibility({ sport: "CRICKET" }).code, "UNREGISTERED");
});

test("today: under the REAL registry no NBA team leg is produced and neither product admits one", () => {
  const r = nbaTeamLeg({ snapshot: permissiveSnapshot(), verification: priceFor(), now: NOW });
  assert.equal(r.ok, false);
  assert.deepEqual(r.refusal.reasons, [TEAM_REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE], "a fully permissive snapshot + price still refuses on the registry alone");
  const real = nbaTeamLeg({ snapshot: realShapeSnapshot(), verification: null, now: NOW });
  for (const code of [TEAM_REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE, TEAM_REFUSAL.SNAPSHOT_NOT_PUBLIC, TEAM_REFUSAL.SNAPSHOT_CAPABILITY_CLOSED, TEAM_REFUSAL.NO_VERIFICATION]) assert.ok(real.refusal.reasons.includes(code), code);
  for (const product of ["bank-builder", "moonshot"]) {
    const a = nbaProductAdmission({ leg: null, product, now: NOW });
    assert.equal(a.admitted, false); assert.equal(a.qualifies, false);
    assert.equal(a.layers.sportRule.code, "NBA_GATED");
  }
  // Bank Builder / Moonshot activation (accounting.ts) still refuses an NBA card (TEST FIXTURE legs)
  const fx = (sport, gameId) => ({ sport, gameId, matchup: `${gameId} TEST FIXTURE`, kickoffUtc: new Date(Date.now() + 6 * 3600_000).toISOString() });
  assert.equal(bbEligibility({ legs: [fx("NBA", "n1"), fx("MLB", "m1")], fitsTarget: true, step: 1 }, Date.now()).eligible, false);
});

test("TEST FIXTURE world: registry + authorization + settlement all open ⇒ the team leg QUALIFIES for Bank Builder and Moonshot", () => {
  const r = openLeg();
  assert.equal(r.ok, true, JSON.stringify(r.refusal));
  const s = permissiveSnapshot();
  const leg = r.leg;
  assert.equal(leg.provenance, PROVENANCE.TEST_FIXTURE, "an injected registry can never yield an OFFICIAL leg");
  assert.equal(leg.side, "home", "the snapshot's published winner side, copied");
  assert.ok(Object.is(leg.probability, s.game.pHome), "the snapshot's number, verbatim");
  assert.equal(leg.snapshotId, s.snapshotId);
  assert.equal(leg.modelVersion, s.modelVersions.game);
  assert.equal(leg.capturedAt, "2026-11-01T12:30:00Z");
  assert.equal(leg.price.sideAmerican, -150);
  assert.equal(leg.handoff.link, null);
  for (const product of ["bank-builder", "moonshot"]) {
    const a = nbaProductAdmission({ leg, product, now: NOW, registry: PERMISSIVE_REGISTRY });
    assert.equal(a.qualifies, true, `${product}: ${JSON.stringify(a.layers)}`);
    assert.equal(a.admitted, false, `${product}: the hand-set sport rule (activation's last switch) still holds it`);
    const opened = nbaProductAdmission({ leg, product, now: NOW, registry: PERMISSIVE_REGISTRY, sportRule: ALL_OPEN_RULE });
    assert.equal(opened.admitted, true, `${product}: admitted only when every layer opens`);
    assert.equal(opened.provenance, PROVENANCE.TEST_FIXTURE);
  }
});

test("each gate closes it on its own: registry, authorization, two-way price, settlement, staleness, lock, link", () => {
  const cases = [
    ["real registry", { registry: undefined }, TEAM_REFUSAL.REGISTRY_NOT_PRODUCT_ELIGIBLE],
    ["no authorization receipt", { verification: priceFor({ authorizationReceiptRef: null }) }, TEAM_REFUSAL.NO_AUTHORIZATION_RECEIPT],
    ["operator not verified", { verification: priceFor({ operatorVerified: false }) }, TEAM_REFUSAL.OPERATOR_NOT_VERIFIED],
    ["one-sided price", { verification: priceFor({ awayAmerican: null }) }, TEAM_REFUSAL.NO_TWO_WAY_PRICE],
    ["wrong market", { verification: priceFor({ market: "player_points" }) }, TEAM_REFUSAL.VERIFICATION_MARKET_MISMATCH],
    ["other event", { verification: priceFor({ eventId: "1" }) }, TEAM_REFUSAL.VERIFICATION_EVENT_MISMATCH],
    ["no settlement path", { settles: () => false }, TEAM_REFUSAL.NO_SETTLEMENT_PATH],
    ["stale odds", { verification: priceFor({ capturedAt: "2026-11-01T00:30:00Z" }) }, TEAM_REFUSAL.PRICE_STALE],
    ["future odds", { verification: priceFor({ capturedAt: "2026-11-01T14:00:00Z" }) }, TEAM_REFUSAL.PRICE_FROM_FUTURE],
    ["inside the cutoff", { now: "2026-11-01T23:45:00Z", verification: priceFor({ capturedAt: "2026-11-01T23:40:00Z" }) }, TEAM_REFUSAL.LOCKED],
    ["price out of range", { verification: priceFor({ homeAmerican: -800, awayAmerican: 550 }) }, TEAM_REFUSAL.PRICE_OUT_OF_RANGE],
    ["a link field", { verification: priceFor({ deepLink: "dksb://sb/addbet/1" }) }, TEAM_REFUSAL.LINK_PRESENT],
    ["no snapshot", { snapshot: null }, TEAM_REFUSAL.NO_SNAPSHOT],
    ["edited snapshot", { snapshot: { ...permissiveSnapshot(), lockAt: "2026-11-03T00:00:00Z" } }, TEAM_REFUSAL.SNAPSHOT_SEAL_BROKEN],
  ];
  for (const [name, over, code] of cases) {
    const input = { snapshot: permissiveSnapshot(), verification: priceFor(), now: NOW, registry: PERMISSIVE_REGISTRY, ...over };
    if ("registry" in over && over.registry === undefined) delete input.registry;
    const r = nbaTeamLeg(input);
    assert.equal(r.ok, false, name);
    assert.ok(r.refusal.reasons.includes(code), `${name}: ${r.refusal.reasons}`);
  }
});

test("the contract layer uses the REAL registry: a TEST FIXTURE leg judged without the injected registry is refused", () => {
  const { leg } = openLeg();
  const a = nbaProductAdmission({ leg, product: "moonshot", now: NOW });
  assert.equal(a.qualifies, false);
  assert.ok(a.layers.contract.reasons.includes("SPORT_NOT_ELIGIBLE"));
  // and an experimental registry state maps to an EXPERIMENTAL forecast class (refused by the contract)
  assert.equal(toEligibleLegCandidate(leg, { registryState: "HISTORICAL_ONLY" }).forecastClass, "EXPERIMENTAL_MODEL");
});

test("Moonshot (moonshot@2, team-markets-only): the team leg passes, the NBA PLAYER leg is still refused TEAM_MARKETS_ONLY", () => {
  const { leg: team } = openLeg();
  assert.equal(tierView(team, "moonshot", { now: NOW }).qualification.qualified, true);
  const s = permissiveSnapshot(); const e = evaluate(s);
  const { leg: player } = nbaLegFromEvaluation({ evaluation: e, snapshot: s, verification: verificationFor(e), registry: PERMISSIVE_REGISTRY });
  const v = tierView(player, "moonshot", { now: NOW });
  assert.ok(v.qualification.reasons.includes(TIER_REASON.TEAM_MARKETS_ONLY));
  assert.ok(v.qualification.reasons.includes(TIER_REASON.NO_SETTLEMENT_PATH), "no NBA player-prop grader exists");
  // one leg object, same side, every product
  const views = ["bank-builder", "moonshot"].map((t) => tierView(team, t, { now: NOW }));
  assert.ok(views.every((x) => x.leg === team));
});

test("frozen policies untouched; the NBA player-leg policy exists only as a PROPOSED, inactive version", () => {
  assert.deepEqual(CURRENT_POLICY, { "bank-builder": "bank-builder@1", moonshot: "moonshot@2" });
  assert.equal(SELECTION_POLICIES["moonshot@2"].bars.teamMarketsOnly, true);
  assert.equal(CHALLENGER_POLICY["bank-builder"], null);
  for (const [id, p] of Object.entries(PROPOSED_NBA_POLICIES)) {
    assert.equal(p.status, "PROPOSED"); assert.equal(p.active, false);
    assert.ok(!(id in SELECTION_POLICIES), `${id} is not in the frozen registry`);
    assert.ok(!Object.values(CURRENT_POLICY).includes(id) && !Object.values(CHALLENGER_POLICY).includes(id));
    assert.ok(Object.isFrozen(p) && Object.isFrozen(p.bars));
    const bb1 = SELECTION_POLICIES[p.basedOn].bars;
    for (const k of ["lanes", "legsPerLane", "maxLegOdds", "maxLegsPerGame", "seedStake", "activationCutoffMinutes"]) assert.equal(p.bars[k], bb1[k], `${k} read from ${p.basedOn}`);
    assert.equal(p.bars.legOddsMin, LEG_BOUNDS.oddsMin);
    assert.equal(p.bars.sameGame, "REFUSE");
    assert.ok(p.requires.some((x) => /settlement/.test(x)) && p.requires.some((x) => /authorization/.test(x)));
  }
});
