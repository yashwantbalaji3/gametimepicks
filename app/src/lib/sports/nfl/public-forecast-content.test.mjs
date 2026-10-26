/**
 * NFL public forecast files: only a run's own clocks are ignored when deciding whether to rewrite (cost, 2026-10-26).
 *
 * Run: npx tsx --test src/lib/sports/nfl/public-forecast-content.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { canonical, publicForecastContent, samePublicForecastContent } from "./public-forecast-content.mjs";

const doc = (o = {}, f = {}) => ({
  generatedAt: "2026-10-25T16:40:00Z", date: "2026-10-25", model: { id: "m" },
  forecasts: [{ providerEventId: "1", generatedAt: "2026-10-25T16:40:00Z", forecastSummary: { winProbability: { home: 0.6 } }, marketComparison: { state: "NO_MARKET" }, model: { inputHash: "h" }, sideDecision: { frozenAt: "2026-10-25T12:00:00Z", side: "HOME" }, evidence: { schedule: "s1", strengthCutoff: "2026-10-25T16:40:00Z", strengthGamesFolded: 9 }, teamInputs: { participationAsOf: "p1", state: "NO_STARTING_QB_ABSENCE", absences: [] }, ...f }],
  refused: [], ...o,
});

test("a run's clocks are not content: generatedAt, strength cutoff, schedule stamp, participation stamp", () => {
  assert.ok(samePublicForecastContent(doc(), doc({ generatedAt: "2026-10-25T17:10:00Z" }, { generatedAt: "2026-10-25T17:10:00Z", evidence: { schedule: "s2", strengthCutoff: "2026-10-25T17:10:00Z", strengthGamesFolded: 9 }, teamInputs: { participationAsOf: "p2", state: "NO_STARTING_QB_ABSENCE", absences: [] } })));
  assert.equal(canonical({ b: 1, a: [2, { d: 3, c: 4 }] }), canonical({ a: [2, { c: 4, d: 3 }], b: 1 }), "key order never matters");
  assert.equal(publicForecastContent(doc()).generatedAt, undefined);
});

test("everything else is content: values, inputs, side, hash, date, the set of games, refusals", () => {
  const changed = [
    doc({}, { forecastSummary: { winProbability: { home: 0.61 } } }),
    doc({}, { marketComparison: { state: "MARKET_VIEW", capturedAt: "x" } }),
    doc({}, { teamInputs: { participationAsOf: "p1", state: "QB_ABSENT", absences: [{ playerId: "nfl-athlete-1" }] } }),
    doc({}, { sideDecision: { frozenAt: "2026-10-25T12:00:00Z", side: "AWAY" } }),
    doc({}, { model: { inputHash: "h2" } }),
    doc({}, { evidence: { schedule: "s1", strengthCutoff: "2026-10-25T16:40:00Z", strengthGamesFolded: 10 } }),
    doc({ date: "2026-10-26" }),
    doc({ forecasts: [] }),
    doc({ refused: [{ providerEventId: "2" }] }),
  ];
  for (const [i, d] of changed.entries()) assert.equal(samePublicForecastContent(doc(), d), false, `change ${i} is content`);
  assert.equal(samePublicForecastContent(null, doc()), false, "a missing file is always written");
});
