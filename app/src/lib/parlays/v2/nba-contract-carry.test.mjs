/**
 * The canonical NBA market record survives to the card leg: every field a product or the Smart Betslip needs is
 * COPIED from the produced leg (Object.is), never recomputed. TEST FIXTURE slate only.
 * Run: npx tsx --test src/lib/parlays/v2/nba-contract-carry.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { nbaParlayLab, legExpiresAt } from "./nba-source.mjs";
import { COVERAGE, FIXTURE_NBA_SETTLES, FIXTURE_OPERATORS, FIXTURE_SPORT_GATE, NOW, PERMISSIVE_REGISTRY, nbaSlate, nflInputs } from "./__fixtures__/nba-fixtures.mjs";
import { NBA_PROP_SETTLEMENT_VERSION } from "../../sports/nba/prop-settlement.mjs";

const OPEN = { nbaRegistry: PERMISSIVE_REGISTRY, canEnterSport: FIXTURE_SPORT_GATE, settlesNba: FIXTURE_NBA_SETTLES, isVerifiedOperator: FIXTURE_OPERATORS };

test("card legs carry the leg's forecast, availability, settlement rule, correlation keys, both prices and expiry — verbatim", () => {
  const slate = nbaSlate();
  const byKey = new Map(slate.results.filter((r) => r.ok).map((r) => [r.leg.evaluator.identityKey, r.leg]));
  const out = nbaParlayLab({ results: slate.results, snapshots: slate.snapshots, otherInputs: nflInputs(), now: NOW, coverage: COVERAGE, ...OPEN });
  const legs = out.recommendation.tiers.flatMap((t) => t.cards).flatMap((c) => c.legs).filter((l) => l.sport === "nba");
  assert.ok(legs.length > 0, "the fixture slate yields NBA card legs");
  for (const l of legs) {
    const src = byKey.get(l.evidence.evaluatorKey);
    assert.ok(src, "every card leg names the produced leg it came from");
    const e = l.evidence;
    for (const k of ["decisive", "implied", "edge", "ev", "availability", "settlement", "correlationKeys"]) assert.ok(Object.is(e[k], src[k]), `${k} is the leg's own object`);
    assert.ok(Object.is(e.forecast, src.projection), "forecast is the evaluator's projection object");
    assert.equal(e.evaluatedAt, src.evaluator.evaluatedAt);
    assert.deepEqual(e.prices, { overAmerican: src.price.overAmerican, underAmerican: src.price.underAmerican });
    assert.equal(e.eventLockAt, src.eventLockAt);
    assert.equal(e.expiresAt, legExpiresAt(src));
    assert.ok(Date.parse(e.expiresAt) <= Date.parse(src.eventLockAt), "a leg never outlives its event lock");
    assert.deepEqual(e.settlement, { grader: "nba-prop-settlement", version: NBA_PROP_SETTLEMENT_VERSION });
    assert.equal(e.availability.asOfBasis, "snapshot inputAsOf", "the availability time is labelled for what it is");
    assert.ok("participantStatus" in l);
  }
});

test("legExpiresAt: the earlier of capture + 12 h and the event lock; unknown inputs give null", () => {
  assert.equal(legExpiresAt({ capturedAt: "2026-10-21T10:00:00Z", eventLockAt: "2026-10-21T23:30:00Z" }), "2026-10-21T22:00:00.000Z");
  assert.equal(legExpiresAt({ capturedAt: "2026-10-21T20:00:00Z", eventLockAt: "2026-10-21T23:30:00Z" }), "2026-10-21T23:30:00.000Z");
  assert.equal(legExpiresAt({}), null);
});
