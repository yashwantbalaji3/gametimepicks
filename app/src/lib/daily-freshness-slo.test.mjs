/**
 * Freshness-SLO proofs (Program 100-103 §14: "Observer flags a deliberately stale fixture").
 *
 * The fixture that matters is the incident itself: Aug 3, 8 games scheduled, newest board still
 * 2026-07-31, automation green. That must be a FAILURE — not a warning — past the SLO hour.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateDailyFreshness, currentEtHour, FRESHNESS_STATES, BOARD_DUE_ET_HOUR } from "./daily-freshness-slo.mjs";

const incidentFixture = (etHour) => ({
  todayEt: "2026-08-03",
  etHour,
  newestBoard: "2026-07-31", // the real stale board that served for three days
  scheduledGames: 8,
});

test("THE INCIDENT FIXTURE · stale board past the SLO hour is a FAILURE", () => {
  const r = evaluateDailyFreshness(incidentFixture(BOARD_DUE_ET_HOUR));
  assert.equal(r.severity, "FAIL", "a 3-day-old board on a scheduled slate day must FAIL, not warn");
  assert.equal(r.state, FRESHNESS_STATES.STALE);
  assert.match(r.detail, /2026-08-03/);
  assert.match(r.detail, /2026-07-31/, "the detail must name what is actually being served");
});

test("MUTATION · give the same fixture a current board → healthy", () => {
  const fixed = { ...incidentFixture(BOARD_DUE_ET_HOUR), newestBoard: "2026-08-03", coveredGames: 8 };
  assert.notEqual(fixed.newestBoard, incidentFixture(0).newestBoard, "mutation must actually apply");
  const r = evaluateDailyFreshness(fixed);
  assert.equal(r.severity, "OK");
  assert.equal(r.state, FRESHNESS_STATES.CURRENT);
});

test("severity escalates with the clock, so an early morning is not noise", () => {
  assert.equal(evaluateDailyFreshness(incidentFixture(8)).severity, "OK", "before the window");
  assert.equal(evaluateDailyFreshness(incidentFixture(12)).severity, "WARN", "past the warn hour");
  assert.equal(evaluateDailyFreshness(incidentFixture(15)).severity, "FAIL", "past the due hour");
});

test("a partial but CURRENT board is healthier than a complete stale one", () => {
  const partialCurrent = evaluateDailyFreshness({ todayEt: "2026-08-03", etHour: 20, newestBoard: "2026-08-03", scheduledGames: 8, coveredGames: 3 });
  assert.equal(partialCurrent.severity, "OK");
  assert.equal(partialCurrent.state, FRESHNESS_STATES.PARTIAL);
  // …while the complete-but-stale board at the same hour fails.
  assert.equal(evaluateDailyFreshness(incidentFixture(20)).severity, "FAIL");
});

test("no scheduled games is healthy, never stale", () => {
  const r = evaluateDailyFreshness({ todayEt: "2026-08-03", etHour: 23, newestBoard: "2026-07-31", scheduledGames: 0 });
  assert.equal(r.severity, "OK");
  assert.equal(r.state, FRESHNESS_STATES.NO_SCHEDULE);
});

test("a board with zero market coverage is awaiting-markets, not stale", () => {
  const r = evaluateDailyFreshness({ todayEt: "2026-08-03", etHour: 10, newestBoard: "2026-08-03", scheduledGames: 8, coveredGames: 0 });
  assert.equal(r.severity, "OK");
  assert.equal(r.state, FRESHNESS_STATES.AWAITING_MARKETS);
});

test("TIMEZONE ANCHOR · the midnight ET hour is 0, never 24", () => {
  // Intl with hour12:false formats the midnight hour as "24". Uncaught, that makes 00:33 ET read
  // as "past 14:00" and fires a false outage EVERY midnight — the exact TIMEZONE_DATE_ANCHOR
  // failure class. Caught live on 2026-08-03 at 00:33 ET.
  const midnightEt = new Date("2026-08-03T04:33:00Z"); // 00:33 ET (EDT, UTC-4)
  assert.equal(currentEtHour(midnightEt), 0, "midnight must be hour 0");
  assert.ok(currentEtHour(midnightEt) < BOARD_DUE_ET_HOUR, "…so midnight is never 'past the deadline'");

  // And the surrounding hours stay correct.
  assert.equal(currentEtHour(new Date("2026-08-03T05:15:00Z")), 1);
  assert.equal(currentEtHour(new Date("2026-08-03T18:00:00Z")), 14);
  assert.equal(currentEtHour(new Date("2026-08-04T03:59:00Z")), 23);

  // A missing board at midnight is therefore NOT an outage; the same board at 3pm is.
  assert.equal(evaluateDailyFreshness({ ...incidentFixture(currentEtHour(midnightEt)) }).severity, "OK");
});

test("patched coverage is reported distinctly from base coverage", () => {
  const r = evaluateDailyFreshness({ todayEt: "2026-08-03", etHour: 18, newestBoard: "2026-08-03", scheduledGames: 8, coveredGames: 5, hasPatches: true });
  assert.equal(r.state, FRESHNESS_STATES.CURRENT_PATCHED);
});
