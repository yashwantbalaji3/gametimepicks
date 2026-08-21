/**
 * EPL player-projection grading guards.
 *
 * The rule these exist to protect is the one that separates honest grading from flattering grading:
 * a CONDITIONAL prediction cannot be scored when its condition did not hold. Before lineups are out
 * every row says "if he starts", and grading a bench appearance against that would punish the model
 * for a participation call it deliberately refuses to make — while also, over time, quietly
 * destroying the calibration it was validated on.
 *
 * Run: npx tsx --test src/lib/sports/epl/grade-player-projections.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  indexProjections, gradePlayerProjections, classifyEmptyRun,
  summarisePlayerGrades, actualState,
} from "./grade-player-projections.mjs";

const SLUG = "arsenal-v-chelsea-2026-08-21";
const KICKOFF = "2026-08-21T19:00:00Z";

const proj = (players, lineupState = "AWAITING_LINEUP") => ({
  slug: SLUG, matchup: "Arsenal v Chelsea", kickoffUtc: KICKOFF, lineupState, players,
});
const row = (playerId, { state = "START", conditional = true, probability = 0.3, name = `P${playerId}` } = {}) =>
  ({ playerId, name, teamName: "Arsenal", state, conditional, probability, appearances: 50 });
const snapshot = (file, generatedAt, fixtures) => ({ file, generatedAt, fixtures });
const actual = (players, status = "FULL_TIME") => new Map([[SLUG, { status, players }]]);
const act = (playerId, { started = false, subbedIn = false, goals = 0, ...rest } = {}) =>
  ({ playerId, started, subbedIn, goals, ...rest });   // ...rest so a second market's field reaches the grader

const index = (snaps) => indexProjections(snaps).byFixture;

test("a projection generated at or after kickoff is REFUSED, never graded", () => {
  const { byFixture, refused } = indexProjections([
    snapshot("snapshot-202608211900.json", KICKOFF, [proj([row("1")])]),
    snapshot("snapshot-202608212100.json", "2026-08-21T21:00:00Z", [proj([row("1")])]),
  ]);
  assert.equal(byFixture.size, 0);
  assert.equal(refused.length, 2);
  assert.ok(refused.every((r) => /at\/after kickoff/.test(r.reason)));
});

test("the projection of record is the LATEST pre-kickoff snapshot — the lineup-resolved one", () => {
  const p = index([
    snapshot("morning.json", "2026-08-21T09:00:00Z", [proj([row("1", { probability: 0.30 })])]),
    snapshot("prekick.json", "2026-08-21T18:00:00Z", [proj([row("1", { probability: 0.42, conditional: false })], "PUBLISHED")]),
  ]);
  const rec = p.get(SLUG);
  assert.equal(rec.sourceFile, "prekick.json");
  assert.equal(rec.fixture.players[0].probability, 0.42, "the later, better-informed projection wins");
});

test("A CONDITIONAL PREDICTION IS VOIDED WHEN ITS CONDITION FAILS — never scored as a miss", () => {
  /*
   * The defect this prevents: "if he starts" graded against a player who came off the bench. He is
   * not a miss; the model said nothing about that situation. Scoring it would punish the model for
   * refusing to guess the lineup, which is precisely the refusal that keeps it honest.
   */
  const p = index([snapshot("s.json", "2026-08-21T09:00:00Z", [proj([row("sub-guy", { state: "START" })])])]);
  const out = gradePlayerProjections({ projections: p, actuals: actual([act("sub-guy", { subbedIn: true, goals: 1 })]) });
  assert.equal(out.graded.length, 0, "not graded");
  assert.equal(out.voided.length, 1);
  assert.match(out.voided[0].reason, /did not occur/);
  assert.match(out.voided[0].reason, /projected START, actual SUB/);
  assert.equal(out.voided[0].outcome, "VOID");
});

test("even a player who SCORED off the bench is void against a start-conditional row", () => {
  /* The tempting error: count the hit because it flatters. The condition still did not hold. */
  const p = index([snapshot("s.json", "2026-08-21T09:00:00Z", [proj([row("scorer", { state: "START" })])])]);
  const out = gradePlayerProjections({ projections: p, actuals: actual([act("scorer", { subbedIn: true, goals: 2 })]) });
  assert.equal(out.graded.length, 0, "a hit that arrives under the wrong condition is still not a result");
});

test("a met condition grades, and hits and misses are scored properly", () => {
  const p = index([snapshot("s.json", "2026-08-21T09:00:00Z", [proj([
    row("hit", { probability: 0.4 }), row("miss", { probability: 0.4 }),
  ])])]);
  const out = gradePlayerProjections({
    projections: p,
    actuals: actual([act("hit", { started: true, goals: 1 }), act("miss", { started: true, goals: 0 })]),
  });
  assert.equal(out.graded.length, 2);
  const hit = out.graded.find((g) => g.playerId === "hit");
  const miss = out.graded.find((g) => g.playerId === "miss");
  assert.equal(hit.outcome, "HIT");
  assert.equal(miss.outcome, "MISS");
  assert.ok(Math.abs(hit.scores.logLoss - -Math.log(0.4)) < 1e-6);
  assert.ok(Math.abs(miss.scores.logLoss - -Math.log(0.6)) < 1e-6);
  /*
   * COUNTERINTUITIVE AND CORRECT, so it is pinned rather than left to be "fixed" later. At p=0.4 the
   * model leaned AGAINST him scoring, so the HIT is the surprising outcome and costs more: 0.916
   * against 0.511. Anytime-goalscorer probabilities sit well below 0.5 almost always, which means
   * misses are cheap and hits are expensive — and a reader looking at a low average log loss should
   * understand it is mostly the model correctly expecting nothing to happen.
   */
  assert.ok(hit.scores.logLoss > miss.scores.logLoss, "below p=0.5 the HIT is the surprising outcome");
  assert.ok(Math.abs(hit.scores.brier - 0.36) < 1e-6);
});

test("a SUB-state projection grades against an actual substitute appearance", () => {
  const p = index([snapshot("s.json", "2026-08-21T18:00:00Z", [proj([row("b", { state: "SUB", conditional: false, probability: 0.08 })], "PUBLISHED")])]);
  const out = gradePlayerProjections({ projections: p, actuals: actual([act("b", { subbedIn: true, goals: 0 })]) });
  assert.equal(out.graded.length, 1);
  assert.equal(out.graded[0].actualState, "SUB");
});

test("a player who never appeared, or was not in the squad, is voided with the right reason", () => {
  const p = index([snapshot("s.json", "2026-08-21T09:00:00Z", [proj([row("benched"), row("absent")])])]);
  const out = gradePlayerProjections({
    projections: p,
    actuals: actual([act("benched", { started: false, subbedIn: false })]),   // named but unused
  });
  assert.equal(out.graded.length, 0);
  assert.equal(out.voided.length, 2);
  assert.match(out.voided.find((v) => v.playerId === "benched").reason, /did not appear/);
  assert.match(out.voided.find((v) => v.playerId === "absent").reason, /not in the matchday squad/);
});

test("nothing grades until the match is officially FULL_TIME", () => {
  const p = index([snapshot("s.json", "2026-08-21T09:00:00Z", [proj([row("1")])])]);
  for (const status of ["IN_PLAY", "POSTPONED", "ABANDONED", "NOT_STARTED"]) {
    const out = gradePlayerProjections({ projections: p, actuals: actual([act("1", { started: true, goals: 1 })], status) });
    assert.equal(out.graded.length, 0, `${status} must not grade`);
  }
});

test("an already-graded row is skipped — the ledger is append-only", () => {
  const p = index([snapshot("s.json", "2026-08-21T09:00:00Z", [proj([row("1")])])]);
  const out = gradePlayerProjections({
    projections: p,
    actuals: actual([act("1", { started: true, goals: 1 })]),
    alreadyGraded: new Set([`${SLUG}:1:anytime_goalscorer`]),
  });
  assert.equal(out.graded.length, 0);
  assert.equal(out.skipped.alreadyGraded, 1);
});

test("THE LEDGER KEY CARRIES THE MARKET — or a second market silently never grades", () => {
  /*
   * When shots on goal was added, a key of slug:playerId would have collided with the goal row
   * already in the ledger. Every SOG row would have been skipped as "already graded" from the day it
   * shipped, and the record would have looked healthy while covering one market of two. The market is
   * therefore part of the key, and the two markets grade independently.
   */
  const withSog = { ...row("1", { probability: 0.3 }), shotsOnGoalOver05: 0.6 };
  const p = index([snapshot("s.json", "2026-08-21T09:00:00Z", [proj([withSog])])]);
  const out = gradePlayerProjections({
    projections: p,
    actuals: actual([act("1", { started: true, goals: 0, shotsOnGoal: 2 })]),
  });
  assert.equal(out.graded.length, 2, "both markets grade from one player row");
  const byMarket = Object.fromEntries(out.graded.map((g) => [g.market, g]));
  assert.equal(byMarket.anytime_goalscorer.outcome, "MISS", "he did not score");
  assert.equal(byMarket.shots_on_goal_over_0_5.outcome, "HIT", "he had two shots on goal");
  assert.notEqual(byMarket.anytime_goalscorer.key, byMarket.shots_on_goal_over_0_5.key);

  /* And grading one must never suppress the other. */
  const second = gradePlayerProjections({
    projections: p,
    actuals: actual([act("1", { started: true, goals: 0, shotsOnGoal: 2 })]),
    alreadyGraded: new Set([byMarket.anytime_goalscorer.key]),
  });
  assert.equal(second.graded.length, 1);
  assert.equal(second.graded[0].market, "shots_on_goal_over_0_5");
});

test("a market absent from a row is not graded — a rejected market has nothing to score", () => {
  /* Plain shots was REJECTED on calibration and never reaches the artifact. Nothing must grade it. */
  const p = index([snapshot("s.json", "2026-08-21T09:00:00Z", [proj([row("1")])])]);
  const out = gradePlayerProjections({ projections: p, actuals: actual([act("1", { started: true, goals: 1, shotsOnGoal: 3 })]) });
  assert.equal(out.graded.length, 1, "only the market the row actually carries");
  assert.equal(out.graded[0].market, "anytime_goalscorer");
});

test("ALL_VOID is a real state and must not read as a broken join", () => {
  /*
   * Before lineups, a whole squad is projected conditionally and only the eleven who start can be
   * graded. A matchday where nothing met its condition is unusual but legitimate; nothing joining at
   * all is a defect. They must never print the same sentence.
   */
  assert.equal(classifyEmptyRun({ finishedFixtures: 1, gradedCount: 0, voidedCount: 40 }), "ALL_VOID");
  assert.equal(classifyEmptyRun({ finishedFixtures: 1, gradedCount: 0, voidedCount: 0 }), "BROKEN_JOIN");
  assert.equal(classifyEmptyRun({ finishedFixtures: 0, gradedCount: 0, voidedCount: 0 }), "NO_FINISHED_FIXTURES");
  assert.equal(classifyEmptyRun({ finishedFixtures: 1, gradedCount: 0, voidedCount: 0, alreadyGradedCount: 11 }), "NOTHING_NEW");
});

test("actualState reads participation, not intent", () => {
  assert.equal(actualState({ started: true }), "START");
  assert.equal(actualState({ subbedIn: true }), "SUB");
  assert.equal(actualState({ started: false, subbedIn: false }), null);
  assert.equal(actualState(null), null);
});

test("the summary carries n and the calibration question a reader actually asks", () => {
  assert.equal(summarisePlayerGrades([]).n, 0);
  assert.equal(summarisePlayerGrades([]).logLoss, null, "no rows means no figure, not a zero");
  const p = index([snapshot("s.json", "2026-08-21T09:00:00Z", [proj([
    row("a", { probability: 0.5 }), row("b", { probability: 0.5 }),
  ])])]);
  const { graded } = gradePlayerProjections({
    projections: p,
    actuals: actual([act("a", { started: true, goals: 1 }), act("b", { started: true, goals: 0 })]),
  });
  const s = summarisePlayerGrades(graded);
  assert.equal(s.n, 2);
  assert.equal(s.observedScorers, 1);
  assert.equal(s.predictedScorers, 1);
  assert.equal(s.countError, 0, "predicted one scorer, one scored");
});
