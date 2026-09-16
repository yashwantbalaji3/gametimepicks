/**
 * MY GAMETIME — selector tests (v1.1.3 · §33.1, 33.4, 33.6, 33.7, 33.3).
 *
 * Pure: literal inputs and an injected clock. The selectors decide inclusion, so this is where a fuzzy
 * join, a duplicated card, or a stale "upcoming" claim would be caught.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  followsAnyMlbTeam, pageStateFor, selectFollowedLiveEvents, selectFollowedPlayerRows,
  selectRecentFollowedResults, selectUpcomingFollowedGames,
} from "./selectors.mjs";

const NOW = Date.parse("2026-09-16T18:00:00Z");
const f = (sport, entityType, id, label) => ({ sport, entityType, id, label });
const MARINERS = f("MLB", "team", "mlb-team-136", "Seattle Mariners");
const ANGELS = f("MLB", "team", "mlb-team-108", "Los Angeles Angels");
const BILLS = f("NFL", "team", "nfl-team-2", "Buffalo Bills");
const LIONS = f("NFL", "team", "nfl-team-8", "Detroit Lions");
const ST_BROWN = f("NFL", "player", "nfl-athlete-4374302", "Amon-Ra St. Brown");

const env = (eventId, state, homeId, awayId, startTime = "2026-09-16T17:10:00Z") => ({
  eventId, state, startTime,
  competitors: { home: { teamId: homeId }, away: { teamId: awayId } },
});

/* ─────────────────────────── Live Now ─────────────────────────── */

test("L1 · a live game is included when the HOME team is followed", () => {
  const { events } = selectFollowedLiveEvents({ a: env("a", "LIVE", "136", "108") }, [MARINERS]);
  assert.deepEqual(events.map((e) => e.eventId), ["a"]);
});

test("L2 · …and when the AWAY team is followed", () => {
  const { events } = selectFollowedLiveEvents({ a: env("a", "LIVE", "999", "108") }, [ANGELS]);
  assert.deepEqual(events.map((e) => e.eventId), ["a"]);
});

test("L3 · excluded when neither team is followed", () => {
  const { events } = selectFollowedLiveEvents({ a: env("a", "LIVE", "147", "111") }, [MARINERS]);
  assert.deepEqual(events, []);
});

test("L4 · both teams followed → ONE card, not two", () => {
  const { events } = selectFollowedLiveEvents({ a: env("a", "LIVE", "136", "108") }, [MARINERS, ANGELS, MARINERS]);
  assert.equal(events.length, 1);
});

test("L5 · only in-play states; PRE belongs to Up Next and FINAL to Results", () => {
  const slate = {
    a: env("a", "PRE", "136", "1"), b: env("b", "FINAL", "136", "2"),
    c: env("c", "LIVE", "136", "3"), d: env("d", "DELAYED", "136", "4"),
    e: env("e", "POSTPONED", "136", "5"),
  };
  assert.deepEqual(selectFollowedLiveEvents(slate, [MARINERS]).events.map((x) => x.eventId).sort(), ["c", "d"]);
});

test("L6 · ⚠ no display-name fallback — an envelope without a numeric team id joins nothing", () => {
  const byName = { competitors: { home: { name: "Seattle Mariners", abbr: "SEA" }, away: { name: "x" } } };
  const { events, unjoined } = selectFollowedLiveEvents({ a: { eventId: "a", state: "LIVE", ...byName } }, [MARINERS]);
  assert.deepEqual(events, [], "a matching NAME does not include the game");
  assert.equal(unjoined, 1, "…and the miss is counted, not silent");
});

test("L7 · deterministic order: start time, then event id", () => {
  const slate = {
    z: env("z", "LIVE", "136", "1", "2026-09-16T19:00:00Z"),
    y: env("y", "LIVE", "108", "2", "2026-09-16T17:00:00Z"),
    x: env("x", "LIVE", "108", "3", "2026-09-16T17:00:00Z"),
  };
  assert.deepEqual(selectFollowedLiveEvents(slate, [MARINERS, ANGELS]).events.map((e) => e.eventId), ["x", "y", "z"]);
});

test("L8 · NFL follows never produce a Live card (public Live is MLB-only)", () => {
  const { events } = selectFollowedLiveEvents({ a: env("a", "LIVE", "2", "8") }, [BILLS, LIONS]);
  assert.deepEqual(events, [], "nfl-team-2 must not match an MLB envelope whose StatsAPI id happens to be 2");
});

/* ─────────────────────────── Up Next ─────────────────────────── */

const game = (sport, gameId, startUtc, homeId, awayId) => ({ sport, gameId, startUtc, homeId, awayId });

test("U1 · exact followed-team join, both sports", () => {
  const games = [
    game("MLB", "1", "2026-09-17T17:00:00Z", "mlb-team-136", "mlb-team-1"),
    game("NFL", "401872932", "2026-09-18T00:15:00Z", "nfl-team-2", "nfl-team-8"),
    game("MLB", "2", "2026-09-17T18:00:00Z", "mlb-team-147", "mlb-team-111"),
  ];
  const { games: out } = selectUpcomingFollowedGames(games, [MARINERS, BILLS], { nowMs: NOW });
  assert.deepEqual(out.map((g) => g.gameId), ["1", "401872932"]);
});

test("U2 · chronological order, deterministic on ties", () => {
  const t = "2026-09-17T17:00:00Z";
  const games = [
    game("MLB", "b", "2026-09-18T17:00:00Z", "mlb-team-136", "x"),
    game("MLB", "a2", t, "mlb-team-136", "x"),
    game("MLB", "a1", t, "mlb-team-108", "x"),
  ];
  assert.deepEqual(selectUpcomingFollowedGames(games, [MARINERS, ANGELS], { nowMs: NOW }).games.map((g) => g.gameId), ["a1", "a2", "b"]);
});

test("U3 · a game with both teams followed appears once", () => {
  const games = [game("MLB", "1", "2026-09-17T17:00:00Z", "mlb-team-136", "mlb-team-108")];
  assert.equal(selectUpcomingFollowedGames(games, [MARINERS, ANGELS], { nowMs: NOW }).games.length, 1);
});

test("U4 · ⚠ past games and games with UNKNOWN start are excluded (fail closed)", () => {
  const games = [
    game("MLB", "past", "2026-09-16T17:10:00Z", "mlb-team-136", "x"),  // started before NOW
    game("MLB", "now", "2026-09-16T18:00:00Z", "mlb-team-136", "x"),   // exactly now is not "next"
    game("MLB", "unknown", null, "mlb-team-136", "x"),
    game("MLB", "bad", "tbd", "mlb-team-136", "x"),
    game("MLB", "future", "2026-09-16T23:00:00Z", "mlb-team-136", "x"),
  ];
  assert.deepEqual(selectUpcomingFollowedGames(games, [MARINERS], { nowMs: NOW }).games.map((g) => g.gameId), ["future"]);
});

test("U5 · ⚠ the same artifact gives a DIFFERENT answer later — the present is the reader's clock", () => {
  const games = [game("MLB", "1", "2026-09-16T23:00:00Z", "mlb-team-136", "x")];
  assert.equal(selectUpcomingFollowedGames(games, [MARINERS], { nowMs: NOW }).games.length, 1);
  const later = Date.parse("2026-09-17T00:00:00Z");
  assert.equal(selectUpcomingFollowedGames(games, [MARINERS], { nowMs: later }).games.length, 0,
    "a game that has started is no longer 'up next', without any rebuild");
});

test("U6 · bounded, and reports the full count so 'View all' can be honest", () => {
  const games = Array.from({ length: 10 }, (_, i) => game("MLB", String(i), `2026-09-${17 + (i % 5)}T17:0${i}:00Z`, "mlb-team-136", "x"));
  const r = selectUpcomingFollowedGames(games, [MARINERS], { nowMs: NOW, limit: 4 });
  assert.equal(r.games.length, 4);
  assert.equal(r.total, 10);
});

test("U7 · a row with no canonical ids is counted as unjoined, not matched by name", () => {
  const r = selectUpcomingFollowedGames([{ sport: "MLB", gameId: "1", startUtc: "2026-09-17T17:00:00Z", homeName: "Seattle Mariners" }], [MARINERS], { nowMs: NOW });
  assert.deepEqual(r.games, []);
  assert.equal(r.unjoined, 1);
});

test("U8 · an MLB id never matches an NFL game even with the same numeric suffix", () => {
  const games = [game("NFL", "e", "2026-09-18T00:15:00Z", "nfl-team-136", "nfl-team-2")];
  assert.deepEqual(selectUpcomingFollowedGames(games, [MARINERS], { nowMs: NOW }).games, []);
});

/* ─────────────────────────── Recent Results ─────────────────────────── */

const res = (sport, gameId, resultAt, homeId, awayId, homeScore, awayScore) => ({ sport, gameId, resultAt, homeId, awayId, homeScore, awayScore });

test("R1 · a canonical result for a followed team is included; unrelated excluded", () => {
  const rows = [
    res("MLB", "1", "2026-09-15T09:58:42Z", "mlb-team-109", "mlb-team-136", 2, 4),
    res("MLB", "2", "2026-09-15T09:58:42Z", "mlb-team-147", "mlb-team-111", 1, 0),
  ];
  assert.deepEqual(selectRecentFollowedResults(rows, [MARINERS]).results.map((r) => r.gameId), ["1"]);
});

test("R2 · most recent first; unknown dates sort LAST, not first", () => {
  const rows = [
    res("MLB", "old", "2026-09-13T09:00:00Z", "mlb-team-136", "x", 1, 2),
    res("MLB", "undated", null, "mlb-team-136", "x", 3, 4),
    res("MLB", "new", "2026-09-15T09:00:00Z", "mlb-team-136", "x", 5, 6),
  ];
  assert.deepEqual(selectRecentFollowedResults(rows, [MARINERS]).results.map((r) => r.gameId), ["new", "old", "undated"]);
});

test("R3 · both teams followed → one result", () => {
  const rows = [res("NFL", "e", "2026-09-14T20:00:00Z", "nfl-team-2", "nfl-team-8", 30, 27)];
  assert.equal(selectRecentFollowedResults(rows, [BILLS, LIONS]).results.length, 1);
});

test("R4 · ⚠ a row without integer scores is not shown — no fabricated or partial final", () => {
  const rows = [
    res("MLB", "a", "2026-09-15T09:00:00Z", "mlb-team-136", "x", null, null),
    res("MLB", "b", "2026-09-15T09:00:00Z", "mlb-team-136", "x", 2.5, 1),
    res("MLB", "c", "2026-09-15T09:00:00Z", "mlb-team-136", "x", 0, 0),
  ];
  assert.deepEqual(selectRecentFollowedResults(rows, [MARINERS]).results.map((r) => r.gameId), ["c"], "a real 0-0 is still a result");
});

test("R5 · the selector carries no grading — it cannot say who 'won' for the model", () => {
  const out = selectRecentFollowedResults([res("MLB", "1", "2026-09-15T09:00:00Z", "mlb-team-136", "x", 4, 2)], [MARINERS]).results[0];
  for (const k of ["outcome", "won", "lost", "roi", "accuracy", "pick", "grade"]) {
    assert.equal(k in out, false, `results must not carry "${k}"`);
  }
});

/* ─────────────────────────── NFL players ─────────────────────────── */

const prow = (playerId, name, kickoffUtc, markets = {}) => ({ playerId, name, kickoffUtc, team: "DET", markets });

test("P1 · exact nfl-athlete join; absent followed players are reported, not zeroed", () => {
  const rows = [prow("nfl-athlete-4374302", "Amon-Ra St. Brown", "2026-09-18T00:15:00Z", { player_receptions: { median: 6 } })];
  const follows = [ST_BROWN, f("NFL", "player", "nfl-athlete-1", "Someone Off The Board")];
  const { present, absent } = selectFollowedPlayerRows(rows, follows);
  assert.deepEqual(present.map((p) => p.playerId), ["nfl-athlete-4374302"]);
  assert.deepEqual(absent, ["nfl-athlete-1"], "no current published row ⇒ absent, never a row of zeroes");
});

test("P2 · ⚠ no name-based player join", () => {
  const rows = [prow("nfl-athlete-999", "Amon-Ra St. Brown", "2026-09-18T00:15:00Z")];
  const { present, absent } = selectFollowedPlayerRows(rows, [ST_BROWN]);
  assert.deepEqual(present, [], "same NAME, different id → not this player");
  assert.deepEqual(absent, ["nfl-athlete-4374302"]);
});

test("P3 · a player on two boards shows the SOONER game once", () => {
  const rows = [
    prow("nfl-athlete-4374302", "A", "2026-09-21T17:00:00Z"),
    prow("nfl-athlete-4374302", "A", "2026-09-18T00:15:00Z"),
  ];
  const { present } = selectFollowedPlayerRows(rows, [ST_BROWN]);
  assert.equal(present.length, 1);
  assert.equal(present[0].kickoffUtc, "2026-09-18T00:15:00Z");
});

test("P4 · the selector cannot widen eligibility — it passes through only markets the read model kept", () => {
  const markets = { player_receptions: { median: 6 } };
  const { present } = selectFollowedPlayerRows([prow("nfl-athlete-4374302", "A", "2026-09-18T00:15:00Z", markets)], [ST_BROWN]);
  assert.deepEqual(Object.keys(present[0].markets), ["player_receptions"]);
});

/* ─────────────────────────── page state ─────────────────────────── */

test("S1 · first-run only when there is genuinely nothing personal", () => {
  assert.equal(pageStateFor({ followedCount: 0, savedCount: 0 }), "FIRST_RUN");
  assert.equal(pageStateFor({ followedCount: 0, savedCount: 2 }), "PERSONALIZED", "saved-only is still useful");
  assert.equal(pageStateFor({ followedCount: 1, savedCount: 0 }), "PERSONALIZED");
});

test("S2 · the Live module mounts only for an MLB TEAM follow", () => {
  assert.equal(followsAnyMlbTeam([]), false);
  assert.equal(followsAnyMlbTeam([BILLS, ST_BROWN]), false, "NFL follows never mount a Live request");
  assert.equal(followsAnyMlbTeam([MARINERS]), true);
});
