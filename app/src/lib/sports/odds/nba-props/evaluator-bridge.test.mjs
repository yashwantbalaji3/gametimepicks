/**
 * Price record → shared evaluator bridge. Run from app/: npx tsx --test src/lib/sports/odds/nba-props/evaluator-bridge.test.mjs
 *
 * The real-evaluator test runs wherever lib/consistency/market-evaluator.mjs exists (main and PR 1149's branch); on a
 * branch without it, that one test is SKIPPED with the reason printed — the verbatim-copy contract is still pinned by
 * the spy tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluatePriceRecord, evaluatorInput, BRIDGE_REFUSAL } from "./evaluator-bridge.mjs";
import { parseNbaPropResponses } from "./parse.mjs";
import { SCHEDULE, rosterFor, EVENT_1, ok } from "./__fixtures__/event-odds.fixture.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EVALUATOR_PATH = path.join(HERE, "../../../consistency/market-evaluator.mjs");
const NOW = "2026-10-22T22:05:00.000Z";

const records = parseNbaPropResponses([ok(EVENT_1)], { schedule: SCHEDULE, rosterFor }).records;
const rec = records.find((r) => r.providerAthleteId === "9100001" && r.book === "draftkings");

/** TEST FIXTURE in the nbaOfficialSnapshot shape (PR 1149): PRIVATE publication, PRIVATE_SHADOW families. */
const snapshotFixture = (o = {}) => ({
  schema: "gtp.contract.official-forecast-snapshot@1",
  snapshotId: "snap-fixture-1",
  sport: "NBA",
  eventId: "900000001",
  generatedAt: "2026-10-22T18:00:00.000Z",
  lockAt: "2026-10-22T23:30:00.000Z",
  publication: "PRIVATE",
  capability: { state: "HISTORICAL_ONLY", canShowLiveProjections: false, canEnterPredictionProducts: false },
  modelVersions: { players: { pts: "fixture@1" } },
  players: [{
    playerId: "9100001", team: "NYK", side: "home", displayName: "Fixture Guard One", participation: "active",
    families: { pts: {
      state: "PRIVATE_SHADOW",
      distribution: { kind: "quantiles", points: [{ q: 0.1, v: 17 }, { q: 0.25, v: 21 }, { q: 0.5, v: 25 }, { q: 0.75, v: 29 }, { q: 0.9, v: 33 }], mean: 25, lowerBound: 0 },
      expected: 25, median: 25, support: "integer", modelVersion: "fixture@1",
    } },
  }],
  ...o,
});

test("numbers are copied verbatim into the evaluator and its result is returned untouched", () => {
  const seen = [];
  const sentinel = Object.freeze({ lean: "NONE", pOver: 0.123456789, eligibility: Object.freeze({ qualified: false, blocking: [], qualification: ["FAMILY_NOT_PUBLISHED"] }) });
  const out = evaluatePriceRecord(rec, snapshotFixture(), { evaluateMarket: (i) => (seen.push(i), sentinel), now: NOW });
  assert.equal(seen.length, 1);
  const i = seen[0];
  assert.deepEqual(
    { playerId: i.playerId, family: i.family, line: i.line, book: i.book, over: i.overAmerican, under: i.underAmerican, capturedAt: i.capturedAt, now: i.now },
    { playerId: rec.providerAthleteId, family: rec.family, line: rec.line, book: rec.book, over: rec.overAmerican, under: rec.underAmerican, capturedAt: rec.capturedAt, now: NOW },
  );
  assert.equal(out.evaluation, sentinel, "the same object, not a copy or a re-derivation");
  assert.equal(out.qualified, false);
  assert.deepEqual(evaluatorInput(rec, snapshotFixture(), NOW), { ...i });
});

test("the bridge holds no probability / EV arithmetic of its own", () => {
  const src = fs.readFileSync(path.join(HERE, "evaluator-bridge.mjs"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(src, /Math\.|americanTo|noVig|toFixed|\/ ?100\b/);
});

test("refusals happen before the evaluator is called: no evaluator, wrong event, wrong sport, not a record", () => {
  let calls = 0;
  const ev = () => { calls += 1; return {}; };
  assert.equal(evaluatePriceRecord(rec, snapshotFixture(), { now: NOW }).reason, BRIDGE_REFUSAL.NO_EVALUATOR);
  assert.equal(evaluatePriceRecord(rec, snapshotFixture({ eventId: "900000002" }), { evaluateMarket: ev, now: NOW }).reason, BRIDGE_REFUSAL.EVENT_MISMATCH);
  assert.equal(evaluatePriceRecord(rec, snapshotFixture({ sport: "NFL" }), { evaluateMarket: ev, now: NOW }).reason, BRIDGE_REFUSAL.SPORT_MISMATCH);
  assert.equal(evaluatePriceRecord({ ...rec, schema: "x" }, snapshotFixture(), { evaluateMarket: ev, now: NOW }).reason, BRIDGE_REFUSAL.NOT_A_PRICE_RECORD);
  assert.equal(evaluatePriceRecord(rec, null, { evaluateMarket: ev, now: NOW }).reason, BRIDGE_REFUSAL.NO_SNAPSHOT);
  assert.equal(calls, 0);
});

test("REAL shared evaluator: today every NBA price is UNQUALIFIED (family not published, private snapshot)", { skip: fs.existsSync(EVALUATOR_PATH) ? false : "lib/consistency/market-evaluator.mjs is not on this branch (stacked on PR 1141); runs on main / PR 1149" }, async () => {
  const { evaluateMarket } = await import(EVALUATOR_PATH);
  for (const r of records.filter((x) => x.providerAthleteId === "9100001")) {
    const out = evaluatePriceRecord(r, snapshotFixture(), { evaluateMarket, now: NOW });
    assert.equal(out.state, "EVALUATED");
    assert.equal(out.qualified, false, r.book);
    assert.equal(out.evaluation.eligibility.qualified, false);
    assert.ok(out.evaluation.withheldReasons.includes("FAMILY_NOT_PUBLISHED"));
    assert.ok(out.evaluation.withheldReasons.includes("PUBLICATION_PRIVATE"));
    assert.equal(out.evaluation.identity.book, r.book);
    assert.equal(out.evaluation.identity.line, r.line);
    // copied, not recomputed: the evaluator's own result for the same inputs is byte-identical
    assert.equal(JSON.stringify(out.evaluation), JSON.stringify(evaluateMarket(evaluatorInput(r, snapshotFixture(), NOW))));
  }
  // Even a snapshot claiming PUBLISHED stays unqualified while the registry keeps NBA out of products.
  const pub = snapshotFixture({ publication: "PUBLIC" });
  pub.players[0].families.pts.state = "PUBLISHED";
  assert.equal(evaluatePriceRecord(rec, pub, { evaluateMarket, now: NOW }).qualified, false);
});
