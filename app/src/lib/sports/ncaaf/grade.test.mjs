/**
 * NCAAF-006 grading guards: pending is never a loss and carries no measurement; forfeits and cancellations are
 * VOID; a played final is measured against the forecast of record; re-grading identical inputs is a no-op; an
 * official correction appends a new version with corrections + 1; a decided grade can never revert to PENDING;
 * the forecast of record cannot change after grading; market numbers stay a labelled benchmark. PRIVATE_RESEARCH.
 *
 * All receipts and results are SYNTHETIC TEST FIXTURES.
 *
 * Run: npx tsx --test src/lib/sports/ncaaf/grade.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { appendGrade, crpsHistogram, devigHome, gradeEvent } from "./grade.mjs";

const RECEIPT = {
  capturedAt: "2026-10-09T21:42:09.641Z",
  code: { commit: "f".repeat(40) },
  event: { eventId: "900004001", startUtcAtCapture: "2026-10-10T19:30Z" },
  forecast: {
    winner: { pHome: 0.7 },
    score: { pHome: 0.66, marginMean: 7, marginSd: 15, totalMean: 55, totalSd: 14 },
    worlds: { pHome: 0.68, marginHistogram: { "-7": 30, 3: 40, 10: 30 }, totalHistogram: { 45: 50, 55: 50 }, marginPercentiles: { p10: -7, p90: 10 }, totalPercentiles: { p10: 45, p90: 55 } },
  },
  market: { provider: "SYNTH", capturedAt: "2026-10-09T21:42:09.641Z", homeMoneyline: -200, awayMoneyline: 170, homeSpread: -6.5, overUnder: 54.5 },
};
const result = (statusRaw, resultType, h, a, ot = 0) => ({ statusRaw, resultType, home: { score: h }, away: { score: a }, overtimePeriods: ot });
const at = { gradedAt: "2026-10-11T08:00:00Z", sourceCapturedAt: "2026-10-11T07:59:00Z" };

test("pending, postponed and in-progress games carry no measurement and no W/L", () => {
  for (const r of [null, result("STATUS_SCHEDULED", null, null, null), result("STATUS_POSTPONED", null, null, null), result("STATUS_IN_PROGRESS", null, 14, 0)]) {
    const g = gradeEvent({ receipt: RECEIPT, result: r, ...at });
    assert.equal(g.settlement.state, "PENDING");
    assert.equal(g.measurement, null);
    assert.equal(g.marketBenchmark, null, "a live 14-0 is not a cover");
  }
});

test("forfeits and cancellations are VOID, never graded", () => {
  assert.equal(gradeEvent({ receipt: RECEIPT, result: result("STATUS_FORFEIT", "FORFEIT", null, null), ...at }).settlement.state, "VOID");
  assert.equal(gradeEvent({ receipt: RECEIPT, result: result("STATUS_CANCELED", null, null, null), ...at }).measurement, null);
});

test("a played final is measured against the forecast of record; the market stays a benchmark", () => {
  const g = gradeEvent({ receipt: RECEIPT, result: result("STATUS_FINAL", "PLAYED_FINAL", 31, 24), ...at });
  assert.equal(g.settlement.state, "SETTLED");
  assert.ok(Math.abs(g.measurement.winnerC1.logLoss + Math.log(0.7)) < 1e-12);
  assert.equal(g.measurement.scoreC2.marginError, 0);
  assert.equal(g.measurement.worlds.marginIn80, true);
  assert.equal(g.marketBenchmark.spreadResult, "HOME_COVERED", "home −6.5 and won by 7");
  assert.equal(g.marketBenchmark.totalResult, "OVER");
  assert.ok(!("p" in g.marketBenchmark), "market block never carries a model probability field");
  const push = gradeEvent({ receipt: { ...RECEIPT, market: { ...RECEIPT.market, homeSpread: -7, overUnder: 55 } }, result: result("STATUS_FINAL", "PLAYED_FINAL", 31, 24), ...at });
  assert.equal(push.marketBenchmark.spreadResult, "PUSH");
  assert.equal(push.marketBenchmark.totalResult, "PUSH");
});

test("exact discrete CRPS and de-vig are correct on known values", () => {
  assert.equal(crpsHistogram({ 3: 1 }, 3), 0, "a point mass on the outcome scores 0");
  assert.equal(crpsHistogram({ 0: 1 }, 2), 2, "a point mass 2 away scores 2");
  assert.ok(Math.abs(devigHome(-110, -110) - 0.5) < 1e-12);
  assert.equal(devigHome(null, 120), null);
});

test("append-only log: identical re-grade is a no-op; pending → settled appends; correction bumps the count", () => {
  const pending = gradeEvent({ receipt: RECEIPT, result: null, ...at });
  let { log, action } = appendGrade([], pending);
  assert.equal(action, "APPEND");
  ({ log, action } = appendGrade(log, gradeEvent({ receipt: RECEIPT, result: null, gradedAt: "2026-10-11T09:00:00Z", sourceCapturedAt: "x" })));
  assert.equal(action, "NOOP", "re-running with no new information changes nothing");
  ({ log, action } = appendGrade(log, gradeEvent({ receipt: RECEIPT, result: result("STATUS_FINAL", "PLAYED_FINAL", 31, 24), ...at })));
  assert.equal(action, "APPEND");
  assert.equal(log.at(-1).corrections, 0);
  ({ log, action } = appendGrade(log, gradeEvent({ receipt: RECEIPT, result: result("STATUS_FINAL", "PLAYED_FINAL", 31, 24), ...at, gradedAt: "2026-10-12T00:00:00Z" })));
  assert.equal(action, "NOOP");
  ({ log, action } = appendGrade(log, gradeEvent({ receipt: RECEIPT, result: result("STATUS_FINAL", "PLAYED_FINAL", 31, 27), ...at })));
  assert.equal(action, "CORRECTION");
  assert.equal(log.length, 3);
  assert.equal(log[1].settlement.finalAway, 24, "the earlier truth is kept");
  assert.equal(log.at(-1).corrections, 1);
});

test("a decided grade never reverts to PENDING, and the forecast of record cannot change after grading", () => {
  const settled = appendGrade([], gradeEvent({ receipt: RECEIPT, result: result("STATUS_FINAL", "PLAYED_FINAL", 31, 24), ...at })).log;
  assert.throws(() => appendGrade(settled, gradeEvent({ receipt: RECEIPT, result: null, ...at })), /revert/);
  const later = { ...RECEIPT, capturedAt: "2026-10-10T12:00:00.000Z" };
  assert.throws(() => appendGrade(settled, gradeEvent({ receipt: later, result: result("STATUS_FINAL", "PLAYED_FINAL", 31, 24), ...at })), /forecast of record changed/);
});
