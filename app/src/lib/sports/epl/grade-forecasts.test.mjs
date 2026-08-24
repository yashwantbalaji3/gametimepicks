/**
 * EPL forecast-grading guards.
 *
 * This code's first REAL run happens on a matchday, against results that only exist once. Anything
 * it gets wrong then is either a silently wrong record or a day of results that cannot be re-graded,
 * because a graded row is immutable by design. So the rules are exercised against fixtures here.
 *
 * Run: npx tsx --test src/lib/sports/epl/grade-forecasts.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { indexForecasts, buildGradedRows, classifyEmptyRun, summariseGraded } from "./grade-forecasts.mjs";

const EV = "soccer:epl:arsenal-v-chelsea:20260821t1900";
const KICKOFF = "2026-08-21T19:00:00Z";

const fcRow = (over = { over25: 0.6, expected: 3.1 }, probs = { home: 0.6, draw: 0.25, away: 0.15 }) => ({
  eventId: EV, matchup: "Arsenal v Chelsea", kickoffUtc: KICKOFF, state: "CURRENT_PRE_EVENT",
  model: { probs, totals: over, modelId: "epl-model-v1-split-poisson" },
});
const artifact = (file, generatedAt, rows) => ({ file, generatedAt, rows });
const results = (rows, extra = {}) => ({
  rows, source: { id: "espn_scoreboard" }, sourceAsOf: "2026-08-21T22:00:00Z",
  seasonStart: "2026-08-21", completedCount: rows.filter((r) => r.status === "FT").length, ...extra,
});

test("a forecast generated AT OR AFTER kickoff is refused, never graded", () => {
  const { byEvent, refused } = indexForecasts([
    artifact("forecasts/2026-08-21.json", "2026-08-21T19:00:00Z", [fcRow()]),   // exactly at kickoff
    artifact("forecasts/2026-08-22.json", "2026-08-22T09:00:00Z", [fcRow()]),   // after full time
  ]);
  assert.equal(byEvent.size, 0, "neither artifact may become a forecast of record");
  assert.equal(refused.length, 2);
  assert.ok(refused.every((r) => /at\/after kickoff/.test(r.reason)));
});

test("the forecast of record is the LATEST that still pre-dates kickoff", () => {
  const { byEvent } = indexForecasts([
    artifact("forecasts/2026-08-19.json", "2026-08-19T09:00:00Z", [fcRow(undefined, { home: 0.5, draw: 0.3, away: 0.2 })]),
    artifact("forecasts/2026-08-21.json", "2026-08-21T09:00:00Z", [fcRow(undefined, { home: 0.7, draw: 0.2, away: 0.1 })]),
    artifact("forecasts/2026-08-22.json", "2026-08-22T09:00:00Z", [fcRow(undefined, { home: 0.9, draw: 0.05, away: 0.05 })]), // post-kickoff, ignored
  ]);
  const rec = byEvent.get(EV);
  assert.equal(rec.sourceFile, "forecasts/2026-08-21.json");
  assert.equal(rec.row.model.probs.home, 0.7, "the newest PRE-kickoff forecast wins, not the newest overall");
});

test("a hit and a miss are scored, with the probability of what actually happened", () => {
  const { byEvent } = indexForecasts([artifact("f.json", "2026-08-21T09:00:00Z", [fcRow()])]);

  const hit = buildGradedRows({ forecasts: byEvent, results: results([{ eventId: EV, status: "FT", homeGoalsFT: 2, awayGoalsFT: 0 }]) });
  assert.equal(hit.graded.length, 1);
  assert.equal(hit.graded[0].scores.hit, true, "home favoured, home won");
  assert.equal(hit.graded[0].actual.outcome, "H");
  assert.equal(hit.graded[0].scores.probabilityOfActual, 0.6);
  assert.ok(Math.abs(hit.graded[0].scores.logLoss - -Math.log(0.6)) < 1e-6);

  const miss = buildGradedRows({ forecasts: byEvent, results: results([{ eventId: EV, status: "FT", homeGoalsFT: 0, awayGoalsFT: 2 }]) });
  assert.equal(miss.graded[0].scores.hit, false, "home favoured, away won");
  assert.equal(miss.graded[0].scores.probabilityOfActual, 0.15);
  assert.ok(miss.graded[0].scores.logLoss > hit.graded[0].scores.logLoss, "a miss must cost more than a hit");
});

test("multiclass Brier is computed over all three outcomes, not just the one that happened", () => {
  const { byEvent } = indexForecasts([artifact("f.json", "2026-08-21T09:00:00Z", [fcRow()])]);
  const g = buildGradedRows({ forecasts: byEvent, results: results([{ eventId: EV, status: "FT", homeGoalsFT: 1, awayGoalsFT: 1 }]) }).graded[0];
  // draw happened: (0.6-0)^2 + (0.25-1)^2 + (0.15-0)^2
  assert.ok(Math.abs(g.scores.brier - (0.36 + 0.5625 + 0.0225)) < 1e-6);
});

test("over/under 2.5 grades off the FULL-TIME total, three goals being over", () => {
  const { byEvent } = indexForecasts([artifact("f.json", "2026-08-21T09:00:00Z", [fcRow()])]);
  const under = buildGradedRows({ forecasts: byEvent, results: results([{ eventId: EV, status: "FT", homeGoalsFT: 1, awayGoalsFT: 1 }]) }).graded[0];
  assert.equal(under.scores.over25.observedOver, false, "2 goals is under 2.5");
  const over = buildGradedRows({ forecasts: byEvent, results: results([{ eventId: EV, status: "FT", homeGoalsFT: 2, awayGoalsFT: 1 }]) }).graded[0];
  assert.equal(over.scores.over25.observedOver, true, "3 goals is over 2.5");
});

test("a fixture that is not officially FINAL is never graded", () => {
  const { byEvent } = indexForecasts([artifact("f.json", "2026-08-21T09:00:00Z", [fcRow()])]);
  for (const status of ["POSTPONED", "ABANDONED", "SUSPENDED", "IN_PLAY", "NOT_STARTED"]) {
    const out = buildGradedRows({ forecasts: byEvent, results: results([{ eventId: EV, status, homeGoalsFT: 1, awayGoalsFT: 0 }]) });
    assert.equal(out.graded.length, 0, `${status} must quarantine, not grade`);
  }
});

test('a provider reporting "FT" with no scores grades NOTHING — the lesson that Final strings lie', () => {
  const { byEvent } = indexForecasts([artifact("f.json", "2026-08-21T09:00:00Z", [fcRow()])]);
  const out = buildGradedRows({ forecasts: byEvent, results: results([{ eventId: EV, status: "FT", homeGoalsFT: null, awayGoalsFT: null }]) });
  assert.equal(out.graded.length, 0, "a final without scores is not a result");
});

test("an already-graded fixture is skipped, never recomputed — the ledger is append-only", () => {
  const { byEvent } = indexForecasts([artifact("f.json", "2026-08-21T09:00:00Z", [fcRow()])]);
  const out = buildGradedRows({
    forecasts: byEvent,
    results: results([{ eventId: EV, status: "FT", homeGoalsFT: 2, awayGoalsFT: 0 }]),
    alreadyGraded: new Set([EV]),
  });
  assert.equal(out.graded.length, 0);
  assert.equal(out.skipped.alreadyGraded, 1);
});

test("an empty run states WHICH kind of empty — a broken join never reads as a quiet slate", () => {
  // Preseason: the honest zero.
  assert.equal(classifyEmptyRun({ results: { seasonStart: "2026-08-21", sourceAsOf: "2026-08-20T22:00:00Z", completedCount: 0 }, gradedCount: 0 }), "PRESEASON");
  // In season, nothing final yet: also honest.
  assert.equal(classifyEmptyRun({ results: { seasonStart: "2026-08-21", sourceAsOf: "2026-08-21T12:00:00Z", completedCount: 0 }, gradedCount: 0 }), "NO_COMPLETED_FIXTURES");
  // Everything complete is already in the ledger: honest.
  assert.equal(classifyEmptyRun({ results: { seasonStart: "2026-08-21", sourceAsOf: "2026-08-22T12:00:00Z", completedCount: 5 }, gradedCount: 0, alreadyGradedCount: 5 }), "NOTHING_NEW");
  // Completed fixtures, none graded, none previously recorded: THE DEFECT.
  assert.equal(classifyEmptyRun({ results: { seasonStart: "2026-08-21", sourceAsOf: "2026-08-22T12:00:00Z", completedCount: 5 }, gradedCount: 0, alreadyGradedCount: 0 }), "BROKEN_JOIN");
});

test("the running summary reports n beside every figure", () => {
  const { byEvent } = indexForecasts([artifact("f.json", "2026-08-21T09:00:00Z", [fcRow()])]);
  const a = buildGradedRows({ forecasts: byEvent, results: results([{ eventId: EV, status: "FT", homeGoalsFT: 2, awayGoalsFT: 0 }]) }).graded;
  assert.deepEqual(summariseGraded([]).n, 0);
  assert.equal(summariseGraded([]).logLoss, null, "no matches means no figure, not a zero");
  const s = summariseGraded(a);
  assert.equal(s.n, 1);
  assert.equal(s.hitRate, 1);
  assert.ok(s.logLoss > 0);
});

test("the gradeability probe uses a VALID side — an invalid one silently grades nothing", async () => {
  /*
   * This file's first run graded zero matches from a perfectly good FULL_TIME result, because the
   * probe passed side "HOME" and the contract's vocabulary is lowercase. The contract returns
   * VOID_PENDING_REVIEW for an unrecognised side AND for an un-gradeable result, so the typo was
   * indistinguishable from "this match cannot be graded yet" — a silent, total loss of grading that
   * would have looked like a quiet matchday.
   */
  const { gradeEplLeg } = await import("./settlement-contract.mjs");
  const final = { fixtureId: EV, status: "FULL_TIME", homeGoalsFT: 2, awayGoalsFT: 0 };
  assert.notEqual(gradeEplLeg({ market: "match_result", side: "home" }, final).outcome, "VOID_PENDING_REVIEW",
    "a valid side against a final result must grade");
  assert.equal(gradeEplLeg({ market: "match_result", side: "HOME" }, final).outcome, "VOID_PENDING_REVIEW",
    "an invalid side voids — which is why the probe must never use one");
});

/*
 * ── A FIXTURE WE NEVER FORECAST IS ACCOUNTED FOR, NOT A BROKEN JOIN ────────────────────────────
 *
 * The only way out of BROKEN_JOIN was `alreadyGraded >= completed`, so a single fixture that can
 * NEVER be graded pinned the classifier there permanently. On 2026-08-23 that is what happened:
 * nine complete, eight in the ledger, and one the forecast artifact had openly declined because no
 * three-way price was ever captured for it. epl-settle had been green the night before and would
 * have failed every night from then on, on a settlement path, for a slate where nothing was wrong.
 */
test("a completed fixture the model DECLINED does not pin the run at BROKEN_JOIN", () => {
  const results = { completedCount: 9, rowCount: 9, sourceAsOf: "2026-08-23T23:00:00Z", seasonStart: "2026-08-14" };
  assert.equal(classifyEmptyRun({ results, gradedCount: 0, alreadyGradedCount: 8, unexplainedCount: 0 }), "NOTHING_NEW");
});

test("an UNEXPLAINED unmatched fixture is still a BROKEN_JOIN — the guard keeps its teeth", () => {
  /*
   * The discriminator cannot be "we have no forecast for it", because that is also what a broken
   * join looks like from inside the grader. It is whether the fixture appears in the forecast
   * artifact at all: present and unpriced is a stated refusal, absent entirely is a join failure.
   */
  const results = { completedCount: 9, rowCount: 9, sourceAsOf: "2026-08-23T23:00:00Z", seasonStart: "2026-08-14" };
  assert.equal(classifyEmptyRun({ results, gradedCount: 0, alreadyGradedCount: 8, unexplainedCount: 1 }), "BROKEN_JOIN");
  // The total-failure case — nothing matched at all — must refuse with or without the strict count.
  assert.equal(classifyEmptyRun({ results, gradedCount: 0, alreadyGradedCount: 0, unexplainedCount: 9 }), "BROKEN_JOIN");
  assert.equal(classifyEmptyRun({ results, gradedCount: 0, alreadyGradedCount: 0 }), "BROKEN_JOIN");
});

test("the grader supplies the strict count, so the classifier is never left guessing", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "scripts/epl/grade-epl-forecasts.mjs"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.match(code, /unexplainedCount:/, "the grader must compute which unmatched fixtures are unexplained");
  assert.match(code, /seenInArtifacts/, "and must decide that against the forecast artifact's own rows");
});
