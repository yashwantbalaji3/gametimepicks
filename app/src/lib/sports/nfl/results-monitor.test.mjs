/**
 * NFL results-monitor guards (Program 163 · Release E).
 *
 * Every charter case: nonfinal→final, score correction after grading, status regression,
 * disappearing event inside vs outside the window, reschedule, metadata drift — plus first-join
 * candidate discovery from the REAL committed artifacts (DET-CIN must surface for Aug 13 without
 * a human remembering it).
 *
 * Run: npx tsx --test src/lib/sports/nfl/results-monitor.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { monitorNflResults, firstJoinCandidates, MONITOR_CLASSES } from "./results-monitor.mjs";

const ROW = (id, over = {}) => ({ providerEventId: id, shortName: `GAME ${id}`, dateUtc: "2026-08-08T23:00Z", statusRaw: "STATUS_FINAL", seasonType: 1, week: 1, ftHome: 21, ftAway: 14, ...over });
const ART = (rows, over = {}) => ({ generatedAt: "2026-08-12T14:10:00Z", windowDays: 9, rows, ...over });

test("BECAME_FINAL, SCORE_CORRECTION and STATUS_REGRESSION are named; corrections always demand review", () => {
  const prev = ART([ROW("a", { statusRaw: "STATUS_IN_PROGRESS", ftHome: 10, ftAway: 7 }), ROW("b"), ROW("c")]);
  const next = ART([ROW("a"), ROW("b", { ftHome: 24 }), ROW("c", { statusRaw: "STATUS_POSTPONED" })]);
  const out = monitorNflResults(prev, next);
  assert.equal(out.counts.BECAME_FINAL, 1);
  const corr = out.changes.find((x) => x.class === "SCORE_CORRECTION");
  assert.deepEqual({ before: corr.before, after: corr.after, review: corr.review }, { before: "21-14", after: "24-14", review: true });
  assert.equal(out.counts.STATUS_REGRESSION, 1);
  assert.equal(out.reviewRequired.length, 2, "corrections and regressions both require review — nothing regrades silently");
  assert.equal(out.reconciliation.exact, true);
});

test("a vanished event INSIDE the window demands review; one that slid out is expected mechanics", () => {
  const prev = ART([ROW("recent", { dateUtc: "2026-08-10T23:00Z" }), ROW("old", { dateUtc: "2026-08-01T23:00Z" })]);
  const next = ART([]);
  const out = monitorNflResults(prev, next);
  assert.equal(out.counts.DISAPPEARED_UNEXPECTED, 1);
  assert.match(out.changes.find((c) => c.class === "DISAPPEARED_UNEXPECTED").evidence, /preserved/);
  assert.equal(out.counts.LEFT_WINDOW, 1);
});

test("reschedule and season-metadata drift are separate classes; unchanged rows are counted", () => {
  const prev = ART([ROW("a"), ROW("b")]);
  const next = ART([ROW("a", { dateUtc: "2026-08-09T23:00Z" }), ROW("b", { seasonType: 2 })]);
  const out = monitorNflResults(prev, next);
  assert.equal(out.counts.RESCHEDULED, 1);
  assert.equal(out.counts.METADATA_CHANGE, 1);
  assert.ok(out.changes.find((c) => c.class === "METADATA_CHANGE").review, "season separation must be re-verified, not assumed");
  const same = monitorNflResults(prev, prev);
  assert.equal(same.counts.UNCHANGED, 2);
  for (const c of same.changes) assert.ok(MONITOR_CLASSES.includes(c.class));
});

test("REAL ARTIFACTS · the next scheduled game surfaces as a first-join candidate from committed data alone", () => {
  const dir = path.join(process.cwd(), "public", "data", "nfl", "schedule");
  const scheduleRows = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).rows ?? []) scheduleRows.push(r);
  }
  const resultsArtifact = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "nfl", "results", "latest.json"), "utf8"));
  // P178: `nowIso` was pinned to Aug 13 and the candidate was pinned to DET@CIN. Both rotted when
  // that night went final. Derive the instant from the artifacts themselves — a day before the
  // earliest still-scheduled kickoff — so the window is always real and never a calendar guess.
  const nextKickoff = scheduleRows.filter((x) => x.statusRaw === "STATUS_SCHEDULED").map((x) => x.dateUtc).sort()[0];
  assert.ok(nextKickoff, "the committed captures hold a forward slate");
  const nowIso = new Date(Date.parse(nextKickoff) - 24 * 3600_000).toISOString();
  const candidates = firstJoinCandidates({ scheduleRows, resultsArtifact, nowIso, horizonDays: 2 });
  assert.ok(candidates.length >= 1, `the window before ${nextKickoff} has scheduled games`);
  const det = candidates[0];
  assert.ok(det.shortName, "the candidate is discovered from artifacts, not memory");
  assert.match(det.acceptance, /joins \(not quarantines\)/);
  assert.throws(() => firstJoinCandidates({ scheduleRows, resultsArtifact, nowIso: "nope" }));
});
