/**
 * Selector probes (charter §27.3): deterministic, no hidden network, no random tie-break, no
 * ineligible leg selected, no duplicate event, concentration bounds, leg-count limits, no-play states.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { selectLane, selectProduct, rungFor, relationships, NO_PLAY } from "./select.mjs";
import { POLICIES, LADDERS, policyId, policyHash } from "./policies.mjs";
import { evaluateLeg } from "../eligible-leg/contract.mjs";

const AS_OF = "2026-09-20T10:00:00Z";
let n = 0;
function leg(over = {}) {
  n++;
  const c = { sport: "mlb", eventId: String(over.eventId ?? 1000 + n), eventStartUtc: "2026-09-20T17:10:00Z", entityIds: over.entityIds ?? [`t${n}a`, `t${n}b`], marketFamily: "team_result", marketKey: "mlb_moneyline", side: "home", line: null, forecastOwner: "mlb/team-markets", forecastClass: "MARKET_IMPLIED_NO_FORECAST", modelStatus: "MARKET_CONTEXT", probability: null, marketImpliedProbability: over.p ?? 0.6, oddsForSide: { american: over.american ?? -150, bookmaker: "dk", capturedAt: "2026-09-20T09:00:00Z", receipt: "r" }, publishedAt: "2026-09-20T09:00:00Z", sourceReceiptRefs: ["x"], ...over };
  delete c.p;
  return evaluateLeg(c, { asOf: AS_OF });
}

test("policy ids are content hashes and every preregistered policy exists", () => {
  for (const name of ["BB-LEGACY", "BB-C1", "BB-C2", "BB-C3", "BB-C4", "BB-C5", "MS-LEGACY", "MS-C1", "MS-C2", "MS-C3", "MS-C4"]) {
    assert.ok(POLICIES[name], name); assert.match(policyId(name), /^[A-Z0-9-]+@[0-9a-f]{12}$/);
  }
  assert.notEqual(policyHash("BB-C1"), policyHash("BB-C2"));
});

test("rung arithmetic: the required price is goal / carried stake, not the nominal", () => {
  const r1 = rungFor(POLICIES["BB-C1"], { step: 1, stake: 100 }); assert.equal(r1.requiredAmerican, 100);
  const r2 = rungFor(POLICIES["BB-C1"], { step: 2, stake: 300.48 }); assert.equal(r2.goal, 700); assert.equal(r2.requiredAmerican, toA(700 / 300.48));
  const ms = rungFor(POLICIES["MS-C1"], { step: 3, stake: 400 }); assert.equal(ms.isFinal, true); assert.equal(ms.requiredAmerican, 150);
  assert.equal(LADDERS["bb-3"].length, 3); assert.equal(rungFor(POLICIES["BB-C4"], { step: 1 }).steps, 3);
});
const toA = (d) => (d >= 2 ? Math.round((d - 1) * 100) : Math.round(-100 / (d - 1)));

test("deterministic: same inputs → same card, regardless of input order; no randomness", () => {
  const legs = [leg({ p: 0.66, american: -190 }), leg({ p: 0.62, american: -160 }), leg({ p: 0.58, american: -140 }), leg({ p: 0.55, american: -120 }), leg({ p: 0.7, american: -230 })];
  const a = selectLane({ policyName: "BB-C1", legs, position: { step: 1, stake: 100 }, asOf: AS_OF });
  const b = selectLane({ policyName: "BB-C1", legs: legs.slice().reverse(), position: { step: 1, stake: 100 }, asOf: AS_OF });
  assert.equal(a.status, "CARD"); assert.deepEqual(a.card.legs.map((l) => l.legId), b.card.legs.map((l) => l.legId));
  assert.equal(a.card.probabilityBasis, "market-implied");
  assert.ok(a.card.decimal >= a.rung.requiredDecimal);
});

test("an ineligible leg is never selected even when it is the best-priced one", () => {
  const bad = { ...leg({ p: 0.9, american: -110 }), productEligible: false };
  const legs = [bad, leg({ p: 0.6, american: -140 }), leg({ p: 0.6, american: -140 }), leg({ p: 0.55, american: -120 })];
  const r = selectLane({ policyName: "BB-C1", legs, position: { step: 1, stake: 100 }, asOf: AS_OF });
  assert.equal(r.status, "CARD"); assert.ok(!r.card.legs.some((l) => l.legId === bad.legId));
});

test("no duplicate event; opponent and same-entity forbidden under the candidate policies, recorded under legacy", () => {
  // two legs on the same event (home ML + total over) and an opponent pair
  const same1 = leg({ eventId: "77", entityIds: ["A", "B"], p: 0.62, american: -160 });
  const same2 = leg({ eventId: "77", entityIds: ["A", "B"], marketKey: "mlb_total_runs", marketFamily: "team_total", side: "over", line: 8, p: 0.6, american: -150 });
  const oppA = leg({ eventId: "88", entityIds: ["C", "D"], p: 0.61, american: -150 });
  const oppB = leg({ eventId: "99", entityIds: ["D", "E"], p: 0.61, american: -150 }); // D again, as the own team
  const third = leg({ eventId: "55", entityIds: ["F", "G"], p: 0.5, american: -100 });
  assert.deepEqual(relationships(same1, same2).includes("sameEvent"), true);
  assert.ok(relationships(oppA, oppB).includes("sameEntity"));
  const r = selectLane({ policyName: "BB-C1", legs: [same1, same2, oppA, oppB, third], position: { step: 1, stake: 100 }, asOf: AS_OF });
  assert.equal(r.status, "CARD");
  const ev = r.card.legs.map((l) => l.eventId); assert.equal(new Set(ev).size, ev.length);
  const ents = r.card.legs.flatMap((l) => l.entityIds ?? []);
  assert.ok(!(r.card.legs.some((l) => l.eventId === "88") && r.card.legs.some((l) => l.eventId === "99")), "an entity may not appear twice");
  // legacy records rather than forbids the entity overlap, but never allows a same-event pair
  const L = selectLane({ policyName: "BB-LEGACY", legs: [same1, same2, third], position: { step: 1, stake: 100, lane: "A" }, asOf: AS_OF });
  if (L.status === "CARD") { const e = L.card.legs.map((l) => l.eventId); assert.equal(new Set(e).size, e.length); }
});

test("leg-count limits: Moonshot MS-C1 is exactly two legs; MS-C2 may use three; Bank Builder never exceeds four", () => {
  const legs = Array.from({ length: 8 }, (_, i) => leg({ p: 0.5 + i * 0.02, american: 100 - i * 8 }));
  const ms = selectLane({ policyName: "MS-C1", legs, position: { step: 1, stake: 25 }, asOf: AS_OF });
  if (ms.status === "CARD") assert.equal(ms.card.legs.length, 2);
  const ms2 = selectLane({ policyName: "MS-C2", legs, position: { step: 1, stake: 25 }, asOf: AS_OF });
  if (ms2.status === "CARD") assert.ok([2, 3].includes(ms2.card.legs.length));
  const bb = selectLane({ policyName: "BB-C1", legs, position: { step: 4, stake: 1400 }, asOf: AS_OF });
  if (bb.status === "CARD") assert.ok(bb.card.legs.length <= 4);
});

test("no-play states are first-class and carry a reason code", () => {
  const one = selectLane({ policyName: "BB-C1", legs: [leg({})], position: { step: 1, stake: 100 }, asOf: AS_OF });
  assert.equal(one.status, "NO_QUALIFYING_PLAY"); assert.equal(one.reason, NO_PLAY.INSUFFICIENT_CANDIDATES);
  const shortPriced = [leg({ p: 0.8, american: -400 }), leg({ p: 0.8, american: -400 }), leg({ p: 0.8, american: -400 })];
  const px = selectLane({ policyName: "BB-C1", legs: shortPriced, position: { step: 2, stake: 200 }, asOf: AS_OF });
  assert.equal(px.reason, NO_PLAY.PRICE_UNAVAILABLE);
  const thin = [leg({ p: 0.5, american: 100 }), leg({ p: 0.5, american: 100 }), leg({ p: 0.5, american: 100 })];
  const floor = selectLane({ policyName: "BB-C2", legs: thin, position: { step: 1, stake: 100 }, asOf: AS_OF });
  assert.equal(floor.reason, NO_PLAY.SLATE_QUALITY_BELOW_THRESHOLD, "joint 0.25 < 0.42 floor");
  assert.equal(selectLane({ policyName: "BB-C1", legs: thin, position: { step: 1, stake: 100 }, asOf: AS_OF }).status, "CARD", "the same slate is a CARD without the floor — the floor is the only difference");
  const held = selectLane({ policyName: "BB-C1", legs: thin, position: { step: 2, stake: 200, state: "held" }, asOf: AS_OF });
  assert.equal(held.reason, NO_PLAY.LANE_HELD);
  const cad = selectLane({ policyName: "MS-C4", legs: thin, position: { step: 1, stake: 25 }, asOf: AS_OF, cadence: { lastPlacedDate: "2026-09-19", date: "2026-09-20" } });
  assert.equal(cad.reason, NO_PLAY.CADENCE_WINDOW);
  const ineligible = selectLane({ policyName: "BB-C1", legs: thin.map((l) => ({ ...l, productEligible: false })), position: { step: 1, stake: 100 }, asOf: AS_OF });
  assert.equal(ineligible.reason, NO_PLAY.MODEL_STATUS_INELIGIBLE);
});

test("Lane B never shares an event with Lane A; both receipts name the policy id", () => {
  const legs = Array.from({ length: 6 }, (_, i) => leg({ p: 0.55 + i * 0.03, american: -120 - i * 15 }));
  const r = selectProduct({ policyName: "BB-C1", legs, positions: { A: { step: 1, stake: 100 }, B: { step: 1, stake: 100 } }, asOf: AS_OF });
  assert.equal(r.A.status, "CARD"); assert.equal(r.B.status, "CARD");
  const ea = new Set(r.A.card.legs.map((l) => l.eventId));
  assert.ok(!r.B.card.legs.some((l) => ea.has(l.eventId)));
  assert.equal(r.A.receipt.policyId, policyId("BB-C1")); assert.equal(r.B.receipt.policyId, policyId("BB-C1"));
});

test("cross-sport policy records crossSport and never treats it as independence (joint p is still the product)", () => {
  const m = leg({ p: 0.6, american: -150 });
  const nfl = { ...leg({ sport: "nfl", eventId: "nfl-1", p: 0.6, american: -150 }), productEligible: true, eligibilityReasonCodes: [] }; // pretend the registry admitted it
  const r = selectLane({ policyName: "MS-C3", legs: [m, nfl, leg({ p: 0.45, american: 120 })], position: { step: 1, stake: 25 }, asOf: AS_OF });
  if (r.status === "CARD" && r.card.sports.length > 1) { assert.ok(r.card.relationshipsRecorded.includes("crossSport")); assert.ok(Math.abs(r.card.jointP - r.card.legs.reduce((a, l) => a * l.marketImpliedProbability, 1)) < 1e-6); }
});

test("no hidden network or fs: the selector module imports nothing from node:fs, node:http or fetch", () => {
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "select.mjs"), "utf8");
  assert.ok(!/from "node:fs"|from "node:http|fetch\(|Math\.random/.test(src));
});
