/**
 * Block A — MLB projected score + simulation-median total. Re-opens the SAME revision the game owner graded (same
 * generatedAt; every owner probability reproduced exactly), measures by error only. Probes carry no-mutation controls.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { gradeProjectedScore } from "./grade-projected-scores.mjs";
import { mlbProjectedRows } from "../../forecast-ledger/adapters/mlb.mjs";
import { validateRow } from "../../forecast-ledger/contract.mjs";

const pred = (over = {}) => ({
  gamePk: 777, awayTeam: "BOS", homeTeam: "NYY", decisionEngineVersion: "engine@1",
  projectedScore: { away: 4, home: 5, label: "Median simulation score" },
  moneyline: { side: "home", simulationProbability: 0.5612 },
  total: { pick: "OVER", line: 8.5, overProbability: 0.52, underProbability: 0.48, simulationMedian: 9 },
  runLine: { pickSide: "away", pickLine: 1.5, coverProbability: 0.6401 },
  ...over,
});
const owner = (market, p, over = {}) => ({
  gamePk: 777, date: "2026-09-20", matchup: "BOS @ NYY", firstPitchUtc: "2026-09-20T23:05:00Z",
  forecastGeneratedAt: "2026-09-20T16:00:00Z", forecastSource: "snapshot:2026-09-20/snapshot-202609201600.json",
  actual: { homeRuns: 3, awayRuns: 6, winner: "away" }, market, modelProbability: p, resultSource: "statsapi-linescore", gradedAt: "2026-09-21T06:00:00Z", ...over,
});
const ownerRows = (over = {}) => [owner("moneyline", 0.5612, over), owner("total", 0.52, over), owner("run_line", 0.6401, over)];
const rev = (predictions = [pred()], generatedAt = "2026-09-20T16:00:00Z") => ({ generatedAt, predictions });

test("grade: re-opens the owner's revision and records both medians beside the official final", () => {
  const { row } = gradeProjectedScore(ownerRows(), rev());
  assert.deepEqual(row.projectedScore, { away: 4, home: 5, label: "Median simulation score" });
  assert.equal(row.simulationMedianTotal, 9);
  assert.deepEqual(row.actual, { awayRuns: 6, homeRuns: 3, totalRuns: 9 });
  assert.equal(row.forecastSource, "snapshot:2026-09-20/snapshot-202609201600.json");
});

test("probe: a different revision is refused — other instant, or any owner probability not reproduced (control grades)", () => {
  assert.ok(gradeProjectedScore(ownerRows(), rev()).row, "control");
  assert.equal(gradeProjectedScore(ownerRows(), rev([pred()], "2026-09-20T17:00:00Z")).refused, "REVISION_IS_NOT_THE_FORECAST_OF_RECORD");
  assert.equal(gradeProjectedScore(ownerRows(), rev([pred({ runLine: { pickSide: "away", pickLine: 1.5, coverProbability: 0.6402 } })])).refused, "REVISION_DOES_NOT_REPRODUCE_OWNER_GRADE");
  assert.equal(gradeProjectedScore(ownerRows(), rev([pred({ gamePk: 778 })])).refused, "GAME_ABSENT_FROM_REVISION");
  assert.equal(gradeProjectedScore(ownerRows(), null).refused, "FORECAST_OF_RECORD_UNRECOVERED");
});

test("probe: no final, post-pitch forecast, split sources, nothing published — all refused, never filled", () => {
  assert.equal(gradeProjectedScore(ownerRows({ actual: { homeRuns: null, awayRuns: 2 } }), rev()).refused, "NO_FINAL_SCORE");
  assert.equal(gradeProjectedScore(ownerRows({ forecastGeneratedAt: "2026-09-20T23:05:00Z" }), rev()).refused, "FORECAST_NOT_PRE_FIRST_PITCH");
  assert.equal(gradeProjectedScore([owner("moneyline", 0.5612), owner("total", 0.52, { forecastSource: "git:abc1234" })], rev()).refused, "OWNER_ROWS_DISAGREE_ON_SOURCE");
  assert.equal(gradeProjectedScore(ownerRows(), rev([pred({ projectedScore: null, total: { pick: "OVER", overProbability: 0.52, underProbability: 0.48 } })])).refused, "NO_PUBLISHED_MEDIAN");
});

test("ledger rows: two team rows (canonical ids) + one total row, continuous error only, all valid", () => {
  const { row } = gradeProjectedScore(ownerRows(), rev());
  const { rows, unresolved } = mlbProjectedRows([row], new Map([["BOS", "mlb-team-111"], ["NYY", "mlb-team-147"]]));
  assert.equal(unresolved, 0);
  assert.deepEqual(rows.map((r) => r.family).sort(), ["mlb_projected_runs", "mlb_projected_runs", "mlb_projected_total"]);
  for (const r of rows) {
    assert.deepEqual(validateRow({ ...r, provenance: { owner: "t", alsoPublishedOn: [], notes: [] } }), []);
    assert.equal(r.measurement.directionalResult, null, "a median carries no W/L");
  }
  const bos = rows.find((r) => r.subjectId === "mlb-team-111");
  assert.equal(bos.measurement.signedError, -2);
  assert.equal(rows.find((r) => r.family === "mlb_projected_total").measurement.absoluteError, 0);
});

test("probe: an abbreviation that is not exactly one canonical team withholds that row (control resolves)", () => {
  const { row } = gradeProjectedScore(ownerRows(), rev());
  assert.equal(mlbProjectedRows([row], new Map([["BOS", "mlb-team-111"], ["NYY", "mlb-team-147"]])).unresolved, 0);
  const { rows, unresolved } = mlbProjectedRows([row], new Map([["BOS", "mlb-team-111"]]));
  assert.equal(unresolved, 1);
  assert.equal(rows.filter((r) => r.family === "mlb_projected_runs").length, 1);
});

test("committed owner log: one row per graded game, same forecast of record and final as the game owner", () => {
  const dir = path.join(process.cwd(), "public/data/mlb/results");
  const p = path.join(dir, "game-projected-scores-graded.jsonl");
  if (!fs.existsSync(p)) return;
  const read = (f) => fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  const ownerByPk = new Map(read(path.join(dir, "game-predictions-graded.jsonl")).map((r) => [r.gamePk, r]));
  const rows = read(p);
  assert.equal(new Set(rows.map((r) => r.gamePk)).size, rows.length);
  for (const r of rows) {
    const o = ownerByPk.get(r.gamePk);
    assert.ok(o, `${r.gamePk} graded by the game owner`);
    assert.equal(r.forecastSource, o.forecastSource);
    assert.equal(r.forecastGeneratedAt, o.forecastGeneratedAt);
    assert.deepEqual([r.actual.awayRuns, r.actual.homeRuns], [o.actual.awayRuns, o.actual.homeRuns]);
    assert.ok(Date.parse(r.forecastGeneratedAt) < Date.parse(r.firstPitchUtc));
  }
});

test("probe: a doubleheader — same teams, same date — joins each game by gamePk, never by teams (9/22 TB @ NYY)", () => {
  // Game 1 (823543, 17:05Z): NYY won 2-0. Game 2 (823494, 23:05Z): NYY lost 6-1. A team/date join would cross them.
  const g1 = [owner("moneyline", 0.5612, { gamePk: 823543, firstPitchUtc: "2026-09-22T17:05:00Z", forecastGeneratedAt: "2026-09-22T15:33:00Z", actual: { homeRuns: 2, awayRuns: 0 } })];
  const g2 = [owner("moneyline", 0.5612, { gamePk: 823494, firstPitchUtc: "2026-09-22T23:05:00Z", forecastGeneratedAt: "2026-09-22T15:33:00Z", actual: { homeRuns: 1, awayRuns: 6 } })];
  const both = rev([
    pred({ gamePk: 823494, awayTeam: "TB", homeTeam: "NYY", projectedScore: { away: 2, home: 2, label: "Median simulation score" } }),
    pred({ gamePk: 823543, awayTeam: "TB", homeTeam: "NYY", projectedScore: { away: 4, home: 4, label: "Median simulation score" } }),
  ], "2026-09-22T15:33:00Z");
  const a = gradeProjectedScore(g1, both).row;
  const b = gradeProjectedScore(g2, both).row;
  assert.deepEqual([a.gamePk, a.projectedScore.away, a.actual.homeRuns], [823543, 4, 2]);
  assert.deepEqual([b.gamePk, b.projectedScore.away, b.actual.awayRuns], [823494, 2, 6]);
  // Control: a revision carrying only the OTHER game of the pair is refused, not borrowed.
  assert.equal(gradeProjectedScore(g1, rev([pred({ gamePk: 823494 })], "2026-09-22T15:33:00Z")).refused, "GAME_ABSENT_FROM_REVISION");
});
