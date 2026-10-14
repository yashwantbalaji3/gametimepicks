/**
 * LIVE HUB V2 FOUNDATION — the shared view model never invents state, progress or forecasts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LIVE_V2_STATUS as S, LIVE_V2_CAPABILITY, statusFromLifecycle, isTracked, progressLine, ufcResultLine,
  orderEvents, groupEvents, forecastProgress, topForecasts,
} from "./event-view.mjs";

test("lifecycle → status: provisional vs canonical finals; unknown is DATA_UNAVAILABLE, never PREGAME", () => {
  assert.equal(statusFromLifecycle("PRE"), S.PREGAME);
  assert.equal(statusFromLifecycle("FINAL_PENDING_SETTLEMENT"), S.FINAL_PROVISIONAL);
  assert.equal(statusFromLifecycle("SETTLED"), S.FINAL_CANONICAL);
  assert.equal(statusFromLifecycle("POSTPONED"), S.POSTPONED);
  assert.equal(statusFromLifecycle("CANCELLED"), S.CANCELLED);
  for (const x of ["UNKNOWN", undefined, null, "SOMETHING"]) assert.equal(statusFromLifecycle(x), S.DATA_UNAVAILABLE);
});

test("only sports with a validated adapter AND the flag on are tracked; NBA, soccer and UFC never are", () => {
  assert.equal(isTracked("nfl", true), true);
  assert.equal(isTracked("mlb", false), false, "the rollout flag is respected");
  for (const s of ["nba", "soccer", "ufc"]) {
    assert.equal(isTracked(s, true), false, `${s} has no adapter`);
    assert.ok(LIVE_V2_CAPABILITY[s].reason, `${s} says why`);
    assert.deepEqual(LIVE_V2_CAPABILITY[s].fields, []);
  }
});

test("progress lines come only from verified fields, and only while live", () => {
  assert.equal(progressLine("nfl", { quarter: 3, clock: "7:27" }, S.LIVE), "Q3 · 7:27");
  assert.equal(progressLine("nfl", { quarter: 5, clock: "2:00" }, S.LIVE), "OT · 2:00");
  assert.equal(progressLine("nba", { quarter: 2, clock: "0:41" }, S.DELAYED), "Q2 · 0:41");
  assert.equal(progressLine("mlb", { inning: 9, half: "top", outs: 2 }, S.LIVE), "Top 9th · 2 outs");
  assert.equal(progressLine("mlb", { inning: 1, half: "bottom", outs: 1 }, S.LIVE), "Bottom 1st · 1 out");
  assert.equal(progressLine("mlb", { inning: 3 }, S.LIVE), null, "no half → no guess");
  assert.equal(progressLine("soccer", { minute: 67 }, S.LIVE), "67'");
  assert.equal(progressLine("soccer", { phase: "HALFTIME" }, S.LIVE), "Half-time");
  assert.equal(progressLine("ufc", { round: 2 }, S.LIVE), "Round 2");
  // Not live → nothing, whatever the feed carries (NEW-2: no "Top 9th" beside FINAL).
  for (const st of [S.PREGAME, S.FINAL_PROVISIONAL, S.FINAL_CANONICAL, S.POSTPONED, S.DATA_UNAVAILABLE]) {
    assert.equal(progressLine("mlb", { inning: 9, half: "top", outs: 3 }, st), null, st);
  }
  assert.equal(progressLine("nfl", null, S.LIVE), null);
  assert.equal(progressLine("cricket", { over: 4 }, S.LIVE), null, "an unknown sport prints nothing");
});

test("a UFC result is printed only from an OFFICIAL record, and a method only when named", () => {
  assert.equal(ufcResultLine({ winner: "Malott", method: "KO/TKO", round: 2, official: true }), "Malott won · KO/TKO · R2");
  assert.equal(ufcResultLine({ winner: "Malott", official: true }), "Malott won");
  assert.equal(ufcResultLine({ winner: "Malott", method: "KO/TKO", official: false }), null);
  assert.equal(ufcResultLine(null), null);
});

test("reading order: live → upcoming (soonest) → recent finals (newest) → earlier finals → postponed → unavailable", () => {
  const now = Date.parse("2026-10-18T20:00:00Z");
  const ev = (id, status, startUtc) => ({ id, status, startUtc });
  const list = [
    ev("unavail", S.DATA_UNAVAILABLE, "2026-10-18T18:00:00Z"),
    ev("old-final", S.FINAL_CANONICAL, "2026-10-15T00:00:00Z"),
    ev("pp", S.POSTPONED, "2026-10-18T17:00:00Z"),
    ev("later", S.PREGAME, "2026-10-19T00:20:00Z"),
    ev("soon", S.PREGAME, "2026-10-18T20:25:00Z"),
    ev("recent-a", S.FINAL_PROVISIONAL, "2026-10-18T13:30:00Z"),
    ev("recent-b", S.FINAL_CANONICAL, "2026-10-18T17:00:00Z"),
    ev("live", S.LIVE, "2026-10-18T17:00:00Z"),
    ev("delayed", S.DELAYED, "2026-10-18T17:05:00Z"),
  ];
  assert.deepEqual(orderEvents(list, now).map((e) => e.id), ["live", "delayed", "soon", "later", "recent-b", "recent-a", "old-final", "pp", "unavail"]);
  assert.deepEqual(groupEvents(list, now).map((g) => [g.label, g.events.length]), [["Live now", 2], ["Upcoming", 2], ["Recently finished", 2], ["Earlier finals", 1], ["Postponed or cancelled", 1], ["Live data unavailable", 1]]);
  assert.deepEqual(groupEvents([], now), [], "no events → no groups (the page shows its empty state)");
});

test("forecast progress reads the frozen line, never moves it, and never calls an under early", () => {
  assert.deepEqual(forecastProgress({ line: 64.5, side: "over", current: 41, status: S.LIVE }), { state: "IN_PROGRESS", remaining: 24 });
  assert.deepEqual(forecastProgress({ line: 64.5, side: "over", current: 65, status: S.LIVE }), { state: "REACHED_AWAITING_SETTLEMENT", remaining: 0 });
  assert.equal(forecastProgress({ line: 64.5, side: "over", current: 70, status: S.FINAL_PROVISIONAL }).state, "REACHED_AWAITING_SETTLEMENT", "no WIN before canonical settlement");
  assert.equal(forecastProgress({ line: 64.5, side: "over", current: 70, status: S.FINAL_CANONICAL }).state, "SETTLED_HIT");
  assert.equal(forecastProgress({ line: 64.5, side: "over", current: 50, status: S.FINAL_PROVISIONAL }).state, "FINAL_SHORT_AWAITING_SETTLEMENT", "short at a provisional final is not yet a loss");
  assert.equal(forecastProgress({ line: 4.5, side: "under", current: 2, status: S.LIVE }).state, "ON_TRACK_UNTIL_FINAL");
  assert.equal(forecastProgress({ line: 4.5, side: "under", current: 2, status: S.LIVE }).room, 2);
  assert.equal(forecastProgress({ line: 4.5, side: "under", current: 5, status: S.LIVE }).state, "OVER_THE_LINE");
  assert.equal(forecastProgress({ line: 4.5, side: "under", current: 3, status: S.FINAL_CANONICAL }).state, "SETTLED_HIT");
  assert.deepEqual(forecastProgress({ line: 64.5, side: "over", current: null, status: S.LIVE }), { state: "NOT_MEASURED", remaining: null }, "no verified value → no computed remainder");
  assert.equal(forecastProgress({ line: null, side: "over", current: 3, status: S.LIVE }).state, "NO_LINE");
});

test("top forecasts are never padded", () => {
  assert.deepEqual(topForecasts([{ a: 1 }, { a: 2 }], { max: 5 }), [{ a: 1 }, { a: 2 }]);
  assert.equal(topForecasts([1, 2, 3, 4, 5, 6, 7]).length, 5);
  assert.deepEqual(topForecasts([{ ok: false }], { qualifies: (r) => r.ok }), []);
  assert.deepEqual(topForecasts(null), []);
});
