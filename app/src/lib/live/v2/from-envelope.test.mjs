/**
 * LIVE HUB V2 — the contract → V2 mapping carries only what the adapters filled, and lifecycle stays the owner's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { progressFromEnvelope, eventFromMlbRoster, eventFromNflRoster } from "./from-envelope.mjs";
import { progressLine, LIVE_V2_STATUS as S } from "./event-view.mjs";

const mlbEnv = (state, period, outs) => ({ state, period, situation: outs == null ? null : { outs }, competitors: { away: { score: 2 }, home: { score: 3 } } });

test("MLB: inning, half and outs come from the contract; Middle/End innings read as the scoreboard does", () => {
  const p = progressFromEnvelope("mlb", mlbEnv("LIVE", { number: 7, label: "Bottom 7th", clock: null, phase: "Bottom" }, 1));
  assert.deepEqual(p, { inning: 7, half: "bottom", outs: 1 });
  assert.equal(progressLine("mlb", p, S.LIVE), "Bottom 7th · 1 out");
  assert.equal(progressLine("mlb", progressFromEnvelope("mlb", mlbEnv("LIVE", { number: 7, phase: "Middle" }, null)), S.LIVE), "Middle 7th");
  assert.equal(progressFromEnvelope("mlb", { state: "PRE", period: null }), null, "a game that has not started has no inning");
});

test("NFL: quarter and clock from the contract; a final's clock is null and no line prints", () => {
  const live = progressFromEnvelope("nfl", { period: { number: 3, clock: "8:12", label: "3rd" } });
  assert.equal(progressLine("nfl", live, S.LIVE), "Q3 · 8:12");
  const fin = progressFromEnvelope("nfl", { period: { number: 4, clock: null, label: "Final" } });
  assert.equal(progressLine("nfl", fin, S.FINAL_PROVISIONAL), null);
});

test("roster mappers: lifecycle from the owner, absent scores stay null, canonical href kept", () => {
  const game = { gamePk: "849813", href: "/games/mlb/cle-vs-tb-2026-10-13/", awayAbbr: "CLE", homeAbbr: "TB", awayName: "Cleveland Guardians", homeName: "Tampa Bay Rays", firstPitch: "2026-10-14T00:00:00Z", forecast: { runs: {} }, settlement: null };
  /* The lifecycle owner's rule: live OFF (not asked) → the schedule's "Scheduled" is honest; asked and REFUSED →
     unknown, never "Scheduled" for a game that may have started. The mapper passes the caller's answer through. */
  const pre = eventFromMlbRoster(game, null);
  assert.equal(pre.status, S.PREGAME);
  assert.equal(pre.away.score, null);
  assert.equal(eventFromMlbRoster(game, null, { feedState: "REFUSED" }).status, S.DATA_UNAVAILABLE);
  const live = eventFromMlbRoster(game, mlbEnv("LIVE", { number: 9, phase: "Top" }, 2));
  assert.equal(live.status, S.LIVE);
  assert.equal(live.home.score, 3);
  assert.equal(live.reportHref, game.href);
  assert.equal(live.forecastLocked, "Forecast locked pregame");
  const fin = eventFromMlbRoster({ ...game, settlement: { actual: { homeRuns: 3, awayRuns: 2 } } }, mlbEnv("FINAL", { number: 9, phase: "End" }, null));
  assert.equal(fin.status, S.FINAL_CANONICAL, "a canonical settlement makes it canonical");
  const nfl = eventFromNflRoster({ providerEventId: "401", kickoffUtc: "2026-10-16T00:15:00Z", awayAbbr: "SEA", homeAbbr: "DEN", awayTeam: "Seattle Seahawks", homeTeam: "Denver Broncos" }, { state: "PRE", period: null });
  assert.equal(nfl.status, S.PREGAME);
  assert.equal(nfl.reportHref, "/nfl/game/401/");
});
