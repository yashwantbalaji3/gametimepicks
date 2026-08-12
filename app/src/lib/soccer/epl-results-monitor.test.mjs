/**
 * EPL results-monitor guards (Program 163 · Release J) — the detection instrument ready before
 * the first real FT exists (Aug 21). No real results are manufactured; the DISK case proves the
 * current PRESEASON artifact diffs to zero changes against itself.
 *
 * Run: npx tsx --test src/lib/soccer/epl-results-monitor.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { monitorEplResults, EPL_MONITOR_CLASSES } from "./epl-results-monitor.mjs";

const ROW = (id, over = {}) => ({ providerEventId: id, home: "Arsenal", away: "Coventry City", dateUtc: "2026-08-21T19:00:00Z", statusRaw: "STATUS_FULL_TIME", ftHome: 2, ftAway: 0, ...over });
const ART = (rows) => ({ generatedAt: "2026-08-22T14:10:00Z", windowDays: 9, rows });

test("SCORE_CORRECTION on a changed FT is review-gated with before/after; unchanged finals count", () => {
  const out = monitorEplResults(ART([ROW("m1"), ROW("m2")]), ART([ROW("m1", { ftAway: 2 }), ROW("m2")]));
  const corr = out.changes.find((c) => c.class === "SCORE_CORRECTION");
  assert.deepEqual({ before: corr.before, after: corr.after, review: corr.review }, { before: "2-0", after: "2-2", review: true });
  assert.match(corr.evidence, /append-only correction receipt required/);
  assert.equal(out.counts.UNCHANGED, 1);
  assert.equal(out.reconciliation.exact, true);
});

test("full-time transition, regression, window mechanics and reschedule classify through the shared core", () => {
  const prev = ART([ROW("m1", { statusRaw: "STATUS_IN_PLAY", ftHome: 1, ftAway: 0 }), ROW("gone", { dateUtc: "2026-08-21T14:00:00Z" }), ROW("m2")]);
  const next = ART([ROW("m1"), ROW("m2", { statusRaw: "STATUS_POSTPONED", dateUtc: "2026-09-01T19:00:00Z" })]);
  const out = monitorEplResults(prev, next);
  assert.equal(out.counts.BECAME_FINAL, 1);
  assert.equal(out.counts.STATUS_REGRESSION, 1, "a FULL_TIME that un-finals is the lie class");
  assert.equal(out.counts.RESCHEDULED, 1);
  assert.equal(out.counts.DISAPPEARED_UNEXPECTED, 1);
  for (const c of out.changes) assert.ok(EPL_MONITOR_CLASSES.includes(c.class));
});

test("DISK · the committed PRESEASON artifact diffs to pure UNCHANGED against itself (zero rows, zero drama)", () => {
  const a = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "data", "soccer", "epl", "results", "latest.json"), "utf8"));
  const out = monitorEplResults(a, a);
  assert.equal(out.changes.length, (a.rows ?? []).length, "row-for-row accounting, nothing invented");
  assert.equal(out.reviewRequired.length, 0);
});
