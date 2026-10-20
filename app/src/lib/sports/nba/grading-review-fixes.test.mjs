/**
 * Regression tests for the coordinator's review of #1154 (head 47bb50c6d2). Each test failed on that head.
 * SYNTHETIC fixtures (clearly marked) unless a test says COMMITTED.
 *
 * Run (from app/): npx tsx --test src/lib/sports/nba/grading-review-fixes.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  finalLookup, finalTeamsMatch, underReviewIds, overtimeFromBoxscore, appendGameResults, emptyExperimentalLedger, currentGrades,
  latestCorrectionAcross, lastCheckAtAcross, appendBoxscoreCheck, experimentalLedgerAppendOnlyViolations, LINEAGE,
} from "./experimental-grading-ledger.mjs";
import { validationFromGrades } from "./grader-metrics.mjs";
import { pairGames, pairedMetrics, winnerHeadComparison } from "./champion-challenger.mjs";
import { FAMILIES } from "./experimental-forecast.mjs";
import { FIXTURE_NOTE, finalsRecord, boxDoc, graded, HOME, AWAY, REG } from "./__fixtures__/nba-grading-fixtures.mjs";

const spec = FAMILIES["v0.1"];
const item = (id, grade, { date = "2030-01-10", hash = null } = {}) => ({ providerEventId: id, date, status: "GRADED", grade, inputs: { finalSource: "fixture", boxscoreHash: hash } });
/** A graded forward game as the v2 script leaves it: receipt verified, box-score hash in context. */
const fwd = (id, { hash = "h", receipt = "OK", context = {}, ...over } = {}) => {
  const g = graded(id, { inputAsOf: "2029-12-31T00:00:00Z", ...over });
  return { ...g, timing: { ...g.timing, receipt }, context: { boxscoreHash: hash, ...context } };
};

test("fixtures are labelled synthetic", () => assert.match(FIXTURE_NOTE, /SYNTHETIC/));

/* 1 — a final the record REFUSED stays ungraded with its reason; it never falls through to the rolling window. */
test("#1 refused final: REFUSED with the record's reason, even when the rolling window shows a final", () => {
  const rec = { ...finalsRecord("2029-30", []), refused: [{ providerEventId: "r1", reason: "team id 1 is X but the row says Y — identity disagrees, not recorded", observedAt: "t" }] };
  const f = finalLookup({ finalsRecords: { "2029-30": rec }, resultsRows: [{ providerEventId: "r1", statusRaw: "STATUS_FINAL", ftHome: 100, ftAway: 90 }] })("r1");
  assert.equal(f.state, "REFUSED");
  assert.match(f.reason, /identity disagrees/);
});

test("#1b record team ids must match the forecast's sides (plausible item)", () => {
  const rec = finalsRecord("2029-30", [["t1", 100, 90]]);
  const f = finalLookup({ finalsRecords: { "2029-30": rec } })("t1");
  assert.equal(finalTeamsMatch(f, { home: { providerTeamId: HOME }, away: { providerTeamId: AWAY } }), true);
  assert.equal(finalTeamsMatch(f, { home: { providerTeamId: AWAY }, away: { providerTeamId: HOME } }), false, "swapped sides are refused");
});

/* 2 — one canonical corrected box score across families; pairing requires equal box-score hashes. */
test("#2 corrections are read across every family's ledger (newest wins) and so is the last check", () => {
  let a = emptyExperimentalLedger(FAMILIES.v0), b = emptyExperimentalLedger(spec);
  a = appendBoxscoreCheck(a, { providerEventId: "c1", checkedAt: "2030-01-11T10:00:00Z", outcome: "CORRECTION", hash: "B", old: { hash: "A" }, new: { hash: "B", file: "experimental/boxscores/corrections/c1.B.json" } });
  b = appendBoxscoreCheck(b, { providerEventId: "c1", checkedAt: "2030-01-11T17:00:00Z", outcome: "UNCHANGED", hash: "B" });
  assert.equal(latestCorrectionAcross([b, a], "c1").new.hash, "B", "v0.1 grades on v0's correction");
  assert.equal(lastCheckAtAcross([a, b], "c1"), "2030-01-11T17:00:00Z");
});

test("#2 pairGames excludes a game the two families graded on different box scores, with a count", () => {
  const { pairs, excluded } = pairGames([fwd("1", { hash: "A" }), fwd("2", { hash: "A" })], [fwd("1", { hash: "A" }), fwd("2", { hash: "B" })]);
  assert.deepEqual(pairs.map((p) => p.id), ["1"]);
  assert.equal(excluded.boxscoreMismatch, 1);
});

/* 3 — lineage is keyed by (forecast date, event id); re-runs are idempotent. */
test("#3 one event id on two forecast dates: two INITIAL entries, and a re-run appends nothing", () => {
  const g1 = graded("x1", { pHome: 0.6 }), g2 = graded("x1", { pHome: 0.7 });
  const items = [item("x1", g1, { date: "2030-01-09" }), item("x1", g2, { date: "2030-01-10" })];
  const r1 = appendGameResults(emptyExperimentalLedger(spec), items, { gradedAt: "t1" });
  assert.deepEqual(r1.appended.map((e) => e.lineageReason), [LINEAGE.INITIAL, LINEAGE.INITIAL]);
  const r2 = appendGameResults(r1.ledger, items, { gradedAt: "t2" });
  assert.equal(r2.appended.length, 0, "idempotent");
  assert.deepEqual(experimentalLedgerAppendOnlyViolations({ before: null, after: r2.ledger }), []);
  assert.equal(currentGrades(r2.ledger).length, 1, "metrics still count one graded row per event (the latest forecast date)");
  assert.equal(currentGrades(r2.ledger)[0].winner.sim.p, 0.7);
});

/* 5 — disputed finals are excluded from metrics and pairing, with counts. */
test("#5 FINAL_UNDER_REVIEW / conflict-listed / box-points-disagree finals are excluded from the validation block (counted)", () => {
  const rec = finalsRecord("2029-30", [["u1", 117, 98]], [{ providerEventId: "u1", recorded: { ftHome: 117, ftAway: 98 }, observed: { ftHome: 116, ftAway: 98 } }]);
  const ids = underReviewIds({ "2029-30": rec });
  assert.deepEqual([...ids], ["u1"]);
  const grades = [fwd("u1"), fwd("u2", { context: { finalState: "FINAL_UNDER_REVIEW" } }), fwd("u3", { context: { boxscorePoints: { agrees: false } } }), fwd("ok")];
  const v = validationFromGrades(grades, { computedAt: "t", underReview: ids });
  assert.equal(v.byLabel[REG].games, 1);
  assert.equal(v.excluded.disputedFinal, 3);
});

test("#5 pairGames excludes disputed finals with excluded.disputedFinal", () => {
  const champ = [fwd("1"), fwd("2", { context: { finalState: "FINAL_UNDER_REVIEW" } }), fwd("3")];
  const chall = [fwd("1"), fwd("2"), fwd("3")];
  const { pairs, excluded } = pairGames(champ, chall, { underReview: new Set(["3"]) });
  assert.deepEqual(pairs.map((p) => p.id), ["1"]);
  assert.equal(excluded.disputedFinal, 2);
  assert.equal(winnerHeadComparison({ v01: champ, v1: chall }, { B: 100, underReview: new Set(["3"]) }).n, 1);
});

/* plausible — pre-tip must be a verified receipt, not only forecast.inputAsOf. */
test("receipt: a pair is formed only when both games' receipts verify (receiptIntegrity OK)", () => {
  const { pairs, excluded } = pairGames([fwd("1"), fwd("2", { receipt: "BROKEN" }), fwd("3", { receipt: "LEGACY_NO_RECEIPT" })], [fwd("1"), fwd("2"), fwd("3")]);
  assert.deepEqual(pairs.map((p) => p.id), ["1"]);
  assert.equal(excluded.receiptNotVerified, 2);
});

/* plausible — paired means and difference on the same rows, one n. */
test("pairedMarket: champion mean, challenger mean and difference use the same paired rows", () => {
  const a = [fwd("1", { pHome: 0.6 }), fwd("2", { pHome: 0.7 }), fwd("3", { pHome: 0.95, final: [90, 100] })];
  const b = [fwd("1"), fwd("2"), fwd("3", { final: [90, 100] })];
  b[2] = { ...b[2], winner: { ...b[2].winner, sim: null } }; // challenger head missing on game 3
  const m = pairedMetrics(pairGames(a, b).pairs, { B: 100 }).winnerSimLogLoss;
  assert.equal(m.n, 2);
  assert.equal(m.champion, Number(((a[0].winner.sim.logLoss + a[1].winner.sim.logLoss) / 2).toFixed(4)), "champion mean over the 2 paired rows, not 3");
});

/* plausible — OT from minutes refuses a side short of a 240/265 multiple (already true at 47bb50c6d2; pinned). */
test("OT from minutes: a side 10 minutes short of 240 is undetermined, never 'no overtime'", () => {
  const short = boxDoc("s", { teamMinutes: 240 });
  short.players = short.players.map((p, i) => (p.providerTeamId === HOME && i === 0 ? { ...p, minutes: p.minutes - 10 } : p));
  assert.equal(overtimeFromBoxscore(short), null);
});
