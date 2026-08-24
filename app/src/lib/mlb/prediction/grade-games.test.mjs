/**
 * Game-level grading guards (Program 196 · Release B1).
 *
 * The rules under test are the ones the backfill actually leaned on: the forecast of record must
 * PRE-DATE first pitch (the dated artifact is a moving pointer and its final state can postdate
 * the slate), a graded row never regrades, pushes are voids, the run-line +1.5/-1.5 arithmetic
 * (the sign convention memory says to verify, verified here), and the run-line style note that
 * keeps a base-rate hit percentage from reading as skill.
 *
 * Run: npx tsx --test src/lib/mlb/prediction/grade-games.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { selectForecastOfRecord, gradeGameFamilies, gradeDate, summariseGameLedger } from "./grade-games.mjs";

const rev = (generatedAt, rows = []) => ({ generatedAt, source: `fixture:${generatedAt}`, byGamePk: new Map(rows.map((r) => [r.gamePk, r])) });

const row = (over = {}) => ({
  gamePk: 1, slateDate: "2026-08-20", awayTeam: "TOR", homeTeam: "NYY",
  moneyline: { side: "away", team: "TOR", simulationProbability: 0.61, marketImpliedProbability: 0.52 },
  total: { pick: "OVER", line: 8.5, overProbability: 0.57, underProbability: 0.43, marketImpliedOver: 0.5 },
  runLine: { pick: "TOR +1.5", pickSide: "away", pickLine: 1.5, coverProbability: 0.66 },
  ...over,
});

const finalRow = (homeRuns, awayRuns) => ({ gamePk: 1, isFinal: true, homeRuns, awayRuns });

test("forecast of record is the newest revision that still PRE-DATES first pitch", () => {
  const revs = [rev("2026-08-20T14:00:00Z"), rev("2026-08-20T18:00:00Z"), rev("2026-08-21T02:00:00Z")];
  const chosen = selectForecastOfRecord(revs, "2026-08-20T23:00:00Z");
  assert.equal(chosen.generatedAt, "2026-08-20T18:00:00Z", "the 02:00 next-day regeneration saw the results and is ignored");
  assert.equal(selectForecastOfRecord(revs, "not-a-date"), null);
  assert.equal(selectForecastOfRecord([rev("2026-08-21T02:00:00Z")], "2026-08-20T23:00:00Z"), null, "only post-pitch revisions ⇒ no forecast of record");
});

test("moneyline and total grade from the picked side; a push is a PUSH, never a loss", () => {
  const g = (fin) => gradeGameFamilies({ row: row(), final: fin, revision: rev("2026-08-20T14:00:00Z"), firstPitchUtc: "2026-08-20T23:00:00Z" });
  const away = g(finalRow(2, 5)); // TOR (away) wins 5-2, total 7
  assert.equal(away.find((r) => r.market === "moneyline").outcome, "WIN");
  assert.equal(away.find((r) => r.market === "total").outcome, "LOSS", "7 under 8.5 against an OVER pick");
  const push = g(finalRow(4, 4.5 /* not integer */));
  assert.deepEqual(push, [], "non-integer scores never grade");
  const exact = gradeGameFamilies({ row: row({ total: { pick: "OVER", line: 7, overProbability: 0.6, underProbability: 0.4, marketImpliedOver: 0.5 } }), final: finalRow(3, 4), revision: rev("2026-08-20T14:00:00Z"), firstPitchUtc: "2026-08-20T23:00:00Z" });
  assert.equal(exact.find((r) => r.market === "total").outcome, "PUSH");
});

test("run-line arithmetic: +1.5 covers a one-run loss; -1.5 loses a one-run win", () => {
  const plus = gradeGameFamilies({ row: row(), final: finalRow(5, 4), revision: rev("2026-08-20T14:00:00Z"), firstPitchUtc: "2026-08-20T23:00:00Z" });
  assert.equal(plus.find((r) => r.market === "run_line").outcome, "WIN", "TOR +1.5 losing by exactly one covers");
  const minus = gradeGameFamilies({
    row: row({ runLine: { pick: "NYY -1.5", pickSide: "home", pickLine: -1.5, coverProbability: 0.5 } }),
    final: finalRow(5, 4), revision: rev("2026-08-20T14:00:00Z"), firstPitchUtc: "2026-08-20T23:00:00Z",
  });
  assert.equal(minus.find((r) => r.market === "run_line").outcome, "LOSS", "NYY -1.5 winning by exactly one does not cover");
});

test("a family the revision did not call is never fabricated", () => {
  const g = gradeGameFamilies({
    row: row({ total: { pick: "UNAVAILABLE" }, runLine: null }),
    final: finalRow(2, 5), revision: rev("2026-08-20T14:00:00Z"), firstPitchUtc: "2026-08-20T23:00:00Z",
  });
  assert.deepEqual(g.map((r) => r.market), ["moneyline"]);
});

test("gradeDate accounts for every final: graded, already-graded, not-final, missing pre-event", () => {
  const revisions = [rev("2026-08-20T14:00:00Z", [row()])];
  const finals = [finalRow(2, 5), { gamePk: 2, isFinal: false, homeRuns: null, awayRuns: null }, { gamePk: 3, isFinal: true, homeRuns: 1, awayRuns: 0 }];
  const firstPitch = new Map([[1, "2026-08-20T23:00:00Z"], [3, "2026-08-20T23:00:00Z"]]);
  const { graded, skipped } = gradeDate({ revisions, finals, firstPitchByGamePk: firstPitch, alreadyGraded: new Set(["1:moneyline"]) });
  assert.equal(skipped.notFinal, 1);
  /*
   * ONE revision per game, ever. A game with ANY family in the ledger skips whole — grading the
   * remaining families on a later pass would take them from whichever revision that pass could
   * see, splitting one game's record across two forecasts. And an already-graded game must never
   * be recounted as MISSING_PRE_EVENT by a pass that cannot see the original revision — that
   * double-count is exactly what the first snapshot-mode rerun over the backfill produced.
   */
  assert.equal(skipped.alreadyGraded, 1, "game 1 skips whole — a graded game never regrades or extends");
  assert.deepEqual(graded.filter((g) => g.gamePk === 1), []);
  assert.equal(skipped.missingPreEvent.length, 1, "game 3 has finals but no row in the forecast of record");
  assert.match(skipped.missingPreEvent[0].reason, /absent from the forecast-of-record/);
  const rerun = gradeDate({ revisions: [], finals: [finalRow(2, 5)], firstPitchByGamePk: firstPitch, alreadyGraded: new Set(["1:total"]) });
  assert.equal(rerun.skipped.missingPreEvent.length, 0, "a graded game with no visible revision is ALREADY_GRADED, not a gap");
  assert.equal(rerun.skipped.alreadyGraded, 1);
});

test("the summary keeps families apart, counts pushes as voids, and derives the +1.5 style note", () => {
  const rows = [
    { market: "moneyline", outcome: "WIN" }, { market: "moneyline", outcome: "LOSS" },
    { market: "total", outcome: "PUSH" },
    { market: "run_line", outcome: "WIN", line: 1.5 }, { market: "run_line", outcome: "WIN", line: 1.5 },
    { market: "run_line", outcome: "LOSS", line: 1.5 }, { market: "run_line", outcome: "WIN", line: -1.5 },
  ];
  const fam = summariseGameLedger(rows);
  assert.equal(fam.moneyline.hitRate, 0.5);
  assert.equal(fam.total.hitRate, null, "a push-only family has no decisive sample");
  assert.equal(fam.run_line.styleBreakdown.plusLines, 3);
  assert.match(fam.run_line.note, /\+1\.5 side/, "plus-heavy style must carry its base-rate note");
  const balanced = summariseGameLedger([
    { market: "run_line", outcome: "WIN", line: 1.5 }, { market: "run_line", outcome: "LOSS", line: -1.5 },
  ]);
  assert.equal(balanced.run_line.note, null, "a balanced style needs no disclaimer");
});
