/** NBA slate readiness — pure parts. Run (from app/): npx tsx --test scripts/nba/slate-readiness.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { reconcile, scheduleRowsFor, productionCheck } from "./slate-readiness.mjs";

test("reconciliation names every game missing from receipts, lane or schedule (lane exclusions are not 'missing')", () => {
  const r = reconcile({ scheduleIds: ["1", "2", "3"], receiptIds: ["1", "2"], laneIds: ["1"], laneExcludedIds: ["2"] });
  assert.deepEqual([r.schedule, r.receipts, r.lane, r.laneExcluded], [3, 2, 1, 1]);
  assert.deepEqual(r.noReceipt, ["3"]);
  assert.deepEqual(r.notInLane, ["3"], "2 is an honest exclusion, 3 is missing");
  assert.deepEqual(r.notScheduled, []);
});

test("schedule rows: the union of every capture for the ET date (a later capture that dropped a game still counts it)", () => {
  const a = { rows: [{ providerEventId: "1", seasonType: 2, dateUtc: "2026-10-24T22:00Z" }, { providerEventId: "9", seasonType: 1, dateUtc: "2026-10-24T22:00Z" }] };
  const b = { rows: [{ providerEventId: "2", seasonType: 2, dateUtc: "2026-10-25T02:30Z" }, { providerEventId: "3", seasonType: 2, dateUtc: "2026-10-25T16:00Z" }] };
  assert.deepEqual(scheduleRowsFor("2026-10-24", [a, b]).map((r) => r.providerEventId), ["1", "2"], "02:30Z is still 10-24 ET; preseason and 10-25 excluded");
});

test("production check: a bot challenge is UNKNOWN, a missing card or Elo row is FAIL, all four pages serving the game is OK", () => {
  const ok = { status: 200, text: '<article id="nba-exp-7"></article>' };
  const pages = { "/nba/": ok, "/nba/projections/": ok, "/nba/projections/2026-10-24/": ok, "/nba/simulation/7/": ok };
  assert.equal(productionCheck({ id: "7", date: "2026-10-24", pages, laneGame: null }).state, "OK");
  assert.equal(productionCheck({ id: "7", date: "2026-10-24", pages: { ...pages, "/nba/": { challenged: true } }, laneGame: null }).state, "UNKNOWN");
  assert.equal(productionCheck({ id: "7", date: "2026-10-24", pages: { ...pages, "/nba/": { status: 200, text: "" } }, laneGame: null }).state, "FAIL");
  assert.equal(productionCheck({ id: "7", date: "2026-10-24", pages: { ...pages, "/nba/simulation/7/": { status: 404, text: "" } }, laneGame: null }).state, "FAIL");
});
