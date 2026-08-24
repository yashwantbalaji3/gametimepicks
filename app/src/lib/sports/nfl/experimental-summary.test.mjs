/**
 * NFL cohort-separation guards (Program 196 · Release E).
 *
 * The failure being prevented is two weeks out: the first regular-season grade flowing into a
 * lifetime aggregate built from preseason rotation football. Every assertion here is about
 * cohorts never sharing an aggregate.
 *
 * Run: npx tsx --test src/lib/sports/nfl/experimental-summary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { summariseByCohort, cohortRecord, SEASON_TYPE_LABEL } from "./experimental-summary.mjs";

const ev = (kickoffUtc, seasonType, correct, margin = 7) => ({
  kickoffUtc, seasonType,
  grade: { winner: { correct }, margin: { absError: margin, insideInterval80: margin <= 10 }, total: { absError: 4, insideInterval80: true } },
});

test("metrics aggregate WITHIN a cohort, never across", () => {
  const pre = [ev("2026-08-14T00:00Z", 1, true), ev("2026-08-22T00:00Z", 1, true)];
  const reg = [ev("2026-09-11T00:00Z", 2, false)];
  const out = summariseByCohort([...pre, ...reg], (e) => e.seasonType);
  assert.equal(out.cohorts.preseason.settledForecasts, 2);
  assert.equal(out.cohorts.preseason.winnerAccuracy, 1);
  assert.equal(out.cohorts["regular-season"].settledForecasts, 1);
  assert.equal(out.cohorts["regular-season"].winnerAccuracy, 0);
  // The blended number 2/3 must appear NOWHERE.
  for (const c of Object.values(out.cohorts)) assert.notEqual(c.winnerAccuracy, Number((2 / 3).toFixed(4)));
});

test("the headline is the cohort of the LATEST kickoff — the season a reader is living in", () => {
  const preOnly = summariseByCohort([ev("2026-08-14T00:00Z", 1, true)], (e) => e.seasonType);
  assert.equal(preOnly.seasonTypeScope, "preseason");
  const flipped = summariseByCohort([ev("2026-08-14T00:00Z", 1, true), ev("2026-09-11T00:00Z", 2, false)], (e) => e.seasonType);
  assert.equal(flipped.seasonTypeScope, "regular-season");
  assert.equal(flipped.current.settledForecasts, 1, "the new season starts at its honest small n");
  assert.equal(flipped.cohorts.preseason.settledForecasts, 1, "preseason keeps its own block, unchanged");
});

test("an unresolvable season type pads NEITHER cohort — UNKNOWN is reported as itself", () => {
  const out = summariseByCohort([ev("2026-08-14T00:00Z", 1, true), ev("2026-08-15T00:00Z", null, false)], (e) => e.seasonType);
  assert.equal(out.unknownCount, 1);
  assert.equal(out.cohorts.preseason.settledForecasts, 1);
  assert.ok(out.cohorts.UNKNOWN, "the unknown bucket is visible, not folded away");
  assert.equal(out.seasonTypeScope, "preseason", "an UNKNOWN row can never become the headline scope");
});

test("a tie stays out of the decisive denominator inside every cohort", () => {
  const tie = { kickoffUtc: "2026-08-16T00:00Z", seasonType: 1, grade: { winner: { correct: null }, margin: { absError: 0, insideInterval80: true }, total: { absError: 1, insideInterval80: true } } };
  const rec = cohortRecord([tie, ev("2026-08-17T00:00Z", 1, true)]);
  assert.equal(rec.settledForecasts, 2);
  assert.equal(rec.decisive, 1);
  assert.equal(rec.winnerAccuracy, 1);
});

test("the label map is closed — season types are named, never interpolated", () => {
  assert.deepEqual(Object.values(SEASON_TYPE_LABEL), ["preseason", "regular-season", "postseason"]);
});
