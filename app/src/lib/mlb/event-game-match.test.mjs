/**
 * MLB odds event ↔ gamePk is matched by teams AND start time, fail-closed (MLB Department, 2026-10-05).
 * Fixtures are the real StatsAPI schedule rows of the doubleheaders that were mis-joined.
 *
 * Run: npx tsx --test src/lib/mlb/event-game-match.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { matchEventToGamePk, matchGameToEvent } from "./event-game-match.mjs";

const app = process.cwd();
const TB = "Tampa Bay Rays", NYY = "New York Yankees", BAL = "Baltimore Orioles";

// 2026-09-22 split doubleheader (statsapi-schedule/2026-09-22.json) + the next day's series game (2026-09-23.json).
const sched0922 = [
  { gamePk: 823543, away: TB, home: NYY, commenceTime: "2026-09-22T17:05:00Z" },
  { gamePk: 823494, away: TB, home: NYY, commenceTime: "2026-09-22T23:05:00Z" },
];
// 2026-09-25 doubleheader whose game-2 start is a placeholder five minutes after game 1.
const sched0925 = [
  { gamePk: 823491, away: BAL, home: NYY, commenceTime: "2026-09-25T20:05:00Z" },
  { gamePk: 823489, away: BAL, home: NYY, commenceTime: "2026-09-25T20:10:00Z" },
];

test("each half of a split doubleheader gets its own gamePk", () => {
  assert.equal(matchEventToGamePk({ away: TB, home: NYY, commenceTime: "2026-09-22T17:05:00Z" }, sched0922).gamePk, 823543);
  assert.equal(matchEventToGamePk({ away: TB, home: NYY, commenceTime: "2026-09-22T23:05:00Z" }, sched0922).gamePk, 823494);
});

test("the next day's game in the same series is NOT stamped with today's gamePk (the 09-23 → 823494 defect)", () => {
  const m = matchEventToGamePk({ away: TB, home: NYY, commenceTime: "2026-09-23T23:06:00Z" }, sched0922);
  assert.equal(m.gamePk, null);
  assert.equal(m.reason, "NO_GAME");
});

test("a doubleheader whose two starts are both near the event is refused, not guessed", () => {
  const m = matchEventToGamePk({ away: BAL, home: NYY, commenceTime: "2026-09-25T20:07:00Z" }, sched0925);
  assert.equal(m.gamePk, null);
  assert.equal(m.reason, "AMBIGUOUS");
  assert.equal(m.candidates, 2);
});

test("a delayed start inside the tolerance still matches; teams must match exactly; no commence time → refused", () => {
  assert.equal(matchEventToGamePk({ away: TB, home: NYY, commenceTime: "2026-09-22T18:20:00Z" }, sched0922).gamePk, 823543);
  assert.equal(matchEventToGamePk({ away: NYY, home: TB, commenceTime: "2026-09-22T17:05:00Z" }, sched0922).gamePk, null, "home/away swapped is a different fixture");
  assert.equal(matchEventToGamePk({ away: TB, home: NYY, commenceTime: null }, sched0922).reason, "NO_EVENT_TIME");
});

test("times are compared as UTC instants: an offset form matches, a zoneless string is refused", () => {
  // 13:05 EDT (-04:00) is 17:05Z: the same instant as game 1 of the 09-22 doubleheader.
  assert.equal(matchEventToGamePk({ away: TB, home: NYY, commenceTime: "2026-09-22T13:05:00-04:00" }, sched0922).gamePk, 823543);
  assert.equal(matchEventToGamePk({ away: TB, home: NYY, commenceTime: "2026-09-22T17:05:00.000Z" }, sched0922).gamePk, 823543);
  // No zone: it would be read in the runner's local time, so it is not trusted.
  assert.equal(matchEventToGamePk({ away: TB, home: NYY, commenceTime: "2026-09-22T17:05:00" }, sched0922).reason, "NO_EVENT_TIME");
  assert.equal(matchEventToGamePk({ away: TB, home: NYY, commenceTime: "2026-09-22T17:05:00Z" }, [{ ...sched0922[0], commenceTime: "2026-09-22 17:05" }]).gamePk, null);
});

test("an ambiguous event is never resolved by team names alone", () => {
  // Both games share the teams; with no time that separates them the result is null, not either gamePk.
  for (const commenceTime of ["2026-09-25T20:05:00Z", "2026-09-25T20:10:00Z", "2026-09-25T21:00:00Z"]) {
    assert.equal(matchEventToGamePk({ away: BAL, home: NYY, commenceTime }, sched0925).gamePk, null, commenceTime);
  }
});

test("the reverse join refuses a doubleheader without start times and respects the time window", () => {
  const events = [
    { id: "g1", away: TB, home: NYY, commenceTime: "2026-09-22T17:05:00Z" },
    { id: "g2", away: TB, home: NYY, commenceTime: "2026-09-22T23:05:00Z" },
  ];
  assert.equal(matchGameToEvent({ away: TB, home: NYY, commenceTime: null }, events, { sameTeamGamesOnDate: 2 }), null);
  assert.equal(matchGameToEvent({ away: TB, home: NYY, commenceTime: null }, events), null, "two candidate events, no time to choose");
  assert.equal(matchGameToEvent({ away: TB, home: NYY, commenceTime: "2026-09-22T23:05:00Z" }, events)?.id, "g2");
  assert.equal(matchGameToEvent({ away: TB, home: NYY, commenceTime: null }, events.slice(0, 1))?.id, "g1");
});

test("no MLB odds capture joins events to games by team pair alone", () => {
  const files = [
    "scripts/capture-mlb-pregame-markets.mjs",
    "scripts/capture-mlb-pregame-player-props.mjs",
    "scripts/fetch-mlb-closing-odds.mjs",
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(app, f), "utf8");
    assert.match(src, /event-game-match\.mjs/, `${f} uses the shared fail-closed matcher`);
    assert.ok(!/gpByPair|schedByTeams|commenceByGame/.test(src), `${f} still has a team-pair-only map`);
    assert.ok(!/\.find\(\(e\) => norm\(e\.home_team\) === norm\(g\.homeTeam\)/.test(src), `${f} still picks the first event with the teams`);
  }
});
