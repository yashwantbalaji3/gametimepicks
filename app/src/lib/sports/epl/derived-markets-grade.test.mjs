/**
 * Block A — EPL derived markets (BTTS, clean sheet, correct score). The forecast graded must be the SAME revision the
 * 1X2 owner graded, the markets must have been public then, and the outcome is read from the owner's final score.
 * Each mutation probe has a no-mutation control.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EPL_DERIVED_PUBLIC_SINCE, derivedForecast, gradeDerivedMarkets, locateForecastOfRecord } from "./derived-markets-grade.mjs";
import { eplDerivedRows } from "../../forecast-ledger/adapters/soccer.mjs";
import { validateRow } from "../../forecast-ledger/contract.mjs";

const model = (over = {}) => ({
  modelId: "m1",
  probs: { home: 0.5, draw: 0.3, away: 0.2 },
  btts: { yes: 0.55, no: 0.45 },
  cleanSheet: { home: 0.3, away: 0.2 },
  topScorelines: [{ score: "1-1", p: 0.12 }, { score: "1-0", p: 0.11 }, { score: "2-1", p: 0.09 }],
  topScorelinesMass: 0.32,
  ...over,
});
const fcRow = (over = {}) => ({ eventId: "soccer:epl:a-v-b:20260920t1400", state: "CURRENT_PRE_EVENT", homeClub: "Arsenal", awayClub: "Chelsea", kickoffUtc: "2026-09-20T14:00:00Z", model: model(), ...over });
const graded = (over = {}) => ({
  eventId: "soccer:epl:a-v-b:20260920t1400", matchup: "Arsenal v Chelsea", kickoffUtc: "2026-09-20T14:00:00Z",
  forecastGeneratedAt: "2026-09-19T22:00:00.000Z", forecastSource: "forecasts/2026-09-19.json", modelId: "m1",
  resultSource: "espn_scoreboard", status: "FULL_TIME", actual: { homeGoalsFT: 1, awayGoalsFT: 1, outcome: "D", totalGoals: 2 },
  forecast: { probs: { home: 0.5, draw: 0.3, away: 0.2 } }, gradedAt: "2026-09-20T23:00:00.000Z", ...over,
});
const art = (source, generatedAt, rows) => ({ source, generatedAt, rows });

test("locate: the exact revision (same instant, same 1X2), snapshot preferred over the overwritable dated file", () => {
  const g = graded();
  const arts = [
    art("forecasts/2026-09-19.json", "2026-09-19T22:00:00Z", [fcRow()]),
    art("forecasts/snapshot-202609192200.json", "2026-09-19T22:00:00Z", [fcRow()]),
  ];
  assert.equal(locateForecastOfRecord(g, arts).source, "forecasts/snapshot-202609192200.json");
});

test("probe: a different revision (other instant, or 1X2 off by one digit) is never the forecast of record", () => {
  const g = graded();
  assert.ok(locateForecastOfRecord(g, [art("forecasts/snapshot-202609192200.json", "2026-09-19T22:00:00Z", [fcRow()])]), "control");
  assert.equal(locateForecastOfRecord(g, [art("forecasts/snapshot-202609192300.json", "2026-09-19T23:00:00Z", [fcRow()])]), null);
  const moved = fcRow({ model: model({ probs: { home: 0.500001, draw: 0.3, away: 0.2 } }) });
  assert.equal(locateForecastOfRecord(g, [art("forecasts/snapshot-202609192200.json", "2026-09-19T22:00:00Z", [moved])]), null);
  const notPriced = fcRow({ state: "READY_EXCEPT_ODDS" });
  assert.equal(locateForecastOfRecord(g, [art("forecasts/snapshot-202609192200.json", "2026-09-19T22:00:00Z", [notPriced])]), null);
});

test("grade: outcomes come from the owner's final score; a score outside the table is OTHER", () => {
  const loc = { row: fcRow(), source: "forecasts/snapshot-202609192200.json" };
  const { row } = gradeDerivedMarkets(graded(), loc);
  assert.deepEqual(row.outcomes, { btts: true, homeCleanSheet: false, awayCleanSheet: false, scorelineClass: "1-1" });
  const { row: r2 } = gradeDerivedMarkets(graded({ actual: { homeGoalsFT: 3, awayGoalsFT: 0 } }), loc);
  assert.deepEqual(r2.outcomes, { btts: false, homeCleanSheet: true, awayCleanSheet: false, scorelineClass: "OTHER" });
  assert.equal(r2.recoveredFrom, "forecasts/snapshot-202609192200.json");
});

test("probe: refusals — not public yet, not pre-kickoff, not final, unrecovered, missing fields (control grades)", () => {
  const loc = { row: fcRow(), source: "s" };
  assert.ok(gradeDerivedMarkets(graded(), loc).row, "control");
  const before = new Date(Date.parse(EPL_DERIVED_PUBLIC_SINCE) - 60_000).toISOString();
  assert.equal(gradeDerivedMarkets(graded({ forecastGeneratedAt: before, kickoffUtc: "2026-08-21T19:00:00Z" }), loc).refused, "NOT_PUBLIC_AT_FORECAST_TIME");
  assert.equal(gradeDerivedMarkets(graded({ forecastGeneratedAt: "2026-09-20T14:00:00Z" }), loc).refused, "FORECAST_NOT_PRE_KICKOFF");
  assert.equal(gradeDerivedMarkets(graded({ status: "POSTPONED" }), loc).refused, "NOT_FULL_TIME");
  assert.equal(gradeDerivedMarkets(graded({ actual: { homeGoalsFT: null, awayGoalsFT: 1 } }), loc).refused, "NO_FINAL_SCORE");
  assert.equal(gradeDerivedMarkets(graded(), null).refused, "FORECAST_OF_RECORD_UNRECOVERED");
  assert.equal(derivedForecast(model({ btts: null })).reason, "DERIVED_FIELDS_ABSENT");
  assert.equal(derivedForecast(model({ topScorelines: [{ score: "1-1", p: 0.1 }, { score: "1-1", p: 0.1 }] })).reason, "SCORELINES_MALFORMED");
});

test("ledger rows: BTTS + one clean sheet per club (canonical team id) + scoreline table with OTHER; all valid", () => {
  const { row } = gradeDerivedMarkets(graded({ actual: { homeGoalsFT: 3, awayGoalsFT: 0 } }), { row: fcRow(), source: "s" });
  const ids = new Map([["Arsenal", "epl-team-359"], ["Chelsea", "epl-team-363"]]);
  const { rows, unresolved } = eplDerivedRows([row], ids);
  assert.equal(unresolved, 0);
  assert.deepEqual(rows.map((r) => r.family).sort(), ["epl_btts", "epl_clean_sheet", "epl_clean_sheet", "epl_scoreline"]);
  for (const r of rows) assert.deepEqual(validateRow({ ...r, provenance: { owner: "t", alsoPublishedOn: [], notes: [] } }), []);
  const cs = rows.filter((r) => r.family === "epl_clean_sheet");
  assert.deepEqual(cs.map((r) => [r.subjectId, r.measurement.observed]).sort(), [["epl-team-359", 1], ["epl-team-363", 0]]);
  const sc = rows.find((r) => r.family === "epl_scoreline");
  assert.equal(sc.settlement.finalCategory, "OTHER");
  assert.ok(Math.abs(Object.values(sc.classProbabilities).reduce((a, b) => a + b, 0) - 1) < 1e-6);
  assert.equal(sc.categoryPrediction, "1-1");
  assert.equal(sc.measurement.topClassHit, false, "OTHER outweighs every listed score but was never the published call");
});

test("probe: a club with no exact canonical team withholds its clean-sheet row (control resolves)", () => {
  const { row } = gradeDerivedMarkets(graded(), { row: fcRow(), source: "s" });
  assert.equal(eplDerivedRows([row], new Map([["Arsenal", "epl-team-359"], ["Chelsea", "epl-team-363"]])).unresolved, 0);
  const { rows, unresolved } = eplDerivedRows([row], new Map([["Arsenal", "epl-team-359"]]));
  assert.equal(unresolved, 1);
  assert.equal(rows.filter((r) => r.family === "epl_clean_sheet").length, 1);
});

test("committed owner log: every row re-opened its forecast with the 1X2 the owner graded, and is append-only shaped", () => {
  const app = process.cwd();
  const p = path.join(app, "public/data/soccer/epl/results/graded-derived-markets.jsonl");
  const g1 = path.join(app, "public/data/soccer/epl/results/graded-forecasts.jsonl");
  if (!fs.existsSync(p)) return;
  const read = (f) => fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const byEvent = new Map(read(g1).map((r) => [r.eventId, r]));
  const rows = read(p);
  assert.equal(new Set(rows.map((r) => r.eventId)).size, rows.length, "one row per match");
  for (const r of rows) {
    const g = byEvent.get(r.eventId);
    assert.ok(g, `${r.eventId} is a graded match`);
    assert.equal(r.forecastGeneratedAt, g.forecastGeneratedAt);
    assert.deepEqual([r.actual.homeGoalsFT, r.actual.awayGoalsFT], [g.actual.homeGoalsFT, g.actual.awayGoalsFT]);
    assert.ok(Date.parse(r.forecastGeneratedAt) >= Date.parse(EPL_DERIVED_PUBLIC_SINCE));
    assert.ok(Date.parse(r.forecastGeneratedAt) < Date.parse(r.kickoffUtc));
  }
});
