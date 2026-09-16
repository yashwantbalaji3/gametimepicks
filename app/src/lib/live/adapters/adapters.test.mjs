/**
 * LIVE ADAPTER CONTRACT TESTS (v1.1 · §15, §20.1).
 *
 * Deterministic by construction: every input is a committed fixture or a literal authored here, and
 * nothing in this file opens a socket. A game being live somewhere must never decide whether CI is
 * green — §25's rule, and the reason the adapters do no I/O.
 *
 * The pins that matter are the ones where a plausible wrong answer exists: a postponed game that
 * StatsAPI calls "Final", a clock on a finished game, a blank box-score cell, a column that moved.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { normalizeMlbGame, normalizeMlbSchedule, mapMlbState } from "./mlb-statsapi.mjs";
import {
  mapNflState,
  normalizeNflEvent,
  normalizeNflPlayerStats,
  normalizeNflScoreboard,
  summaryEventId,
} from "./espn-nfl.mjs";
import { LIVE_SCHEMA_VERSION, isTerminal, isUnavailable, makeUnavailable } from "../contract.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(here, "..", "fixtures", name), "utf8"));
const APP_PUBLIC = path.join(here, "..", "..", "..", "..", "public/data");
const FETCHED = "2026-09-16T02:00:00.000Z";

/* ────────────────────────────── MLB ────────────────────────────── */

test("MLB 1 · a real live game normalizes with inning, score and situation", () => {
  const [live] = normalizeMlbSchedule(fixture("mlb-schedule.json"), FETCHED);
  assert.equal(live.schemaVersion, LIVE_SCHEMA_VERSION);
  assert.equal(live.sport, "MLB");
  assert.equal(live.provider, "mlb-statsapi");
  assert.equal(live.state, "LIVE");
  assert.equal(live.eventId, live.providerEventId, "canonical MLB event id IS the gamePk");
  assert.equal(typeof live.period.number, "number");
  assert.equal(live.period.clock, null, "baseball has no clock — null, never '0:00'");
  assert.ok(live.competitors.home.score !== null && live.competitors.away.score !== null);
  assert.equal(live.fetchedAt, FETCHED);
});

test("MLB 2 · ⚠ a POSTPONED game is never a 0-0 final (StatsAPI calls it abstractGameState Final)", () => {
  // The exact shape observed for PIT/MIL 2026-07-10 and already encoded in settlement.
  const postponed = {
    gamePk: 999001,
    gameDate: "2026-09-15T23:07:00Z",
    status: { abstractGameState: "Final", codedGameState: "D", detailedState: "Postponed" },
    teams: { home: { team: { id: 1, abbreviation: "PIT" }, score: 0 }, away: { team: { id: 2, abbreviation: "MIL" }, score: 0 } },
  };
  const e = normalizeMlbGame(postponed, FETCHED);
  assert.equal(e.state, "POSTPONED");
  assert.equal(e.competitors.home.score, null, "a postponed game exposes NO score");
  assert.equal(e.competitors.away.score, null);
  assert.equal(isTerminal(e.state), true, "polling stops for a postponed game");
});

test("MLB 3 · cancelled and suspended map by coded state, not by abstract state", () => {
  const at = (coded) =>
    normalizeMlbGame(
      { gamePk: 1, status: { abstractGameState: "Final", codedGameState: coded, detailedState: "x" }, teams: { home: { team: {} }, away: { team: {} } } },
      FETCHED,
    ).state;
  assert.equal(at("C"), "CANCELLED");
  assert.equal(at("D"), "POSTPONED");
  assert.equal(at("U"), "DELAYED", "suspended may resume — never a final");
  assert.equal(at("F"), "FINAL");
});

test("MLB 4 · an unknown status is UNKNOWN, never guessed into a neighbouring state", () => {
  assert.equal(mapMlbState({ abstractGameState: "Rescheduled" }), "UNKNOWN");
  assert.equal(mapMlbState(undefined), "UNKNOWN");
});

test("MLB 5 · a game with no gamePk is refused, not given a synthetic id", () => {
  assert.equal(normalizeMlbGame({ status: {}, teams: {} }, FETCHED), null);
  assert.deepEqual(normalizeMlbSchedule({ dates: [{ games: [{ status: {} }] }] }, FETCHED), []);
});

test("MLB 6 · a malformed payload yields an empty list, never a fabricated event", () => {
  for (const bad of [null, {}, { dates: null }, { dates: [{}] }, "nope"]) {
    assert.deepEqual(normalizeMlbSchedule(bad, FETCHED), []);
  }
});

test("MLB 7 · sourceUpdatedAt is null — StatsAPI publishes none and we never invent one", () => {
  const [live] = normalizeMlbSchedule(fixture("mlb-schedule.json"), FETCHED);
  assert.equal(live.sourceUpdatedAt, null);
});

/* ────────────────────────────── NFL ────────────────────────────── */

test("NFL 1 · a real event normalizes and its id IS the GameTime event id", () => {
  const [e] = normalizeNflScoreboard(fixture("nfl-scoreboard.json"), FETCHED);
  assert.equal(e.eventId, "401872929", "the /nfl/game/[eventId] route key");
  assert.equal(e.providerEventId, e.eventId);
  assert.equal(e.sport, "NFL");
  assert.equal(e.state, "FINAL");
  assert.equal(e.competitors.home.abbr, "PHI");
  assert.equal(e.competitors.away.abbr, "WSH");
  assert.equal(e.competitors.home.score, 24);
});

test("NFL 2 · a finished game shows no clock and no situation", () => {
  const [e] = normalizeNflScoreboard(fixture("nfl-scoreboard.json"), FETCHED);
  assert.equal(e.period.clock, null, "'0:00' on a final would read as a running clock");
  assert.equal(e.situation, null, "ESPN omits situation on finals — verified, not assumed");
});

test("NFL 3 · postponed/cancelled are read from the status NAME, not the coarse state", () => {
  // A postponed NFL game is coarse-state "pre" and a cancelled one is "post": the coarse state alone
  // would call the first a normal pregame and the second a played-out final.
  const st = (name, state, completed) => mapNflState({ type: { name, state, completed } });
  assert.equal(st("STATUS_POSTPONED", "pre"), "POSTPONED");
  assert.equal(st("STATUS_CANCELED", "post"), "CANCELLED");
  assert.equal(st("STATUS_HALFTIME", "in"), "LIVE");
  assert.equal(st("STATUS_SCHEDULED", "pre"), "PRE");
  assert.equal(st("STATUS_IN_PROGRESS", "in"), "LIVE");
  assert.equal(st("STATUS_FINAL", "post", true), "FINAL");
  assert.equal(st("STATUS_UNKNOWN_TO_US", "post", false), "UNKNOWN", "a post state that never completed is not a final");
  assert.equal(st("STATUS_MADE_UP", "sideways"), "UNKNOWN");
});

test("NFL 4 · a postponed or pregame event carries no score", () => {
  const ev = (name, state) => ({
    id: "1", date: "2026-09-20T17:00Z",
    status: { type: { name, state }, period: 0 },
    competitions: [{ competitors: [{ homeAway: "home", score: "0", team: { id: "1", abbreviation: "A" } }, { homeAway: "away", score: "0", team: { id: "2", abbreviation: "B" } }] }],
  });
  for (const [name, state] of [["STATUS_SCHEDULED", "pre"], ["STATUS_POSTPONED", "pre"]]) {
    const e = normalizeNflEvent(ev(name, state), FETCHED);
    assert.equal(e.competitors.home.score, null, `${name} must expose no score`);
  }
});

test("NFL 5 · a live event surfaces the clock and the situation", () => {
  const e = normalizeNflEvent(
    {
      id: "401872932", date: "2026-09-18T00:15Z",
      status: { type: { name: "STATUS_IN_PROGRESS", state: "in", detail: "8:12 - 3rd", shortDetail: "3rd" }, period: 3, displayClock: "8:12" },
      competitions: [{
        situation: { shortDownDistanceText: "2nd & 7", possession: "8", possessionText: "DET 34" },
        competitors: [{ homeAway: "home", score: "17", team: { id: "2", abbreviation: "BUF" } }, { homeAway: "away", score: "14", team: { id: "8", abbreviation: "DET" } }],
      }],
    },
    FETCHED,
  );
  assert.equal(e.state, "LIVE");
  assert.equal(e.period.clock, "8:12");
  assert.equal(e.period.number, 3);
  assert.equal(e.situation.downDistance, "2nd & 7");
  assert.equal(e.situation.possessionTeamId, "8");
  assert.equal(isTerminal(e.state), false);
});

test("NFL 6 · an event with no id is refused; a malformed payload yields nothing", () => {
  assert.equal(normalizeNflEvent({ status: {} }, FETCHED), null);
  for (const bad of [null, {}, { events: null }, "nope"]) assert.deepEqual(normalizeNflScoreboard(bad, FETCHED), []);
});

/* ───────────────────── NFL player box score ───────────────────── */

test("NFL 7 · box-score stats join to canonical nfl-athlete ids with no name matching", () => {
  const rows = normalizeNflPlayerStats(fixture("nfl-summary.json"), { eventId: "401872929", fetchedAt: FETCHED });
  assert.ok(rows.length > 0);
  for (const r of rows) {
    assert.match(r.playerId, /^nfl-athlete-\d+$/);
    assert.equal(r.playerId, `nfl-athlete-${r.providerPlayerId}`);
    assert.equal(typeof r.value, "number");
  }
});

test("NFL 8 · ⚠ only PUBLISHED families are mapped — passing yards is deliberately absent", () => {
  // The fixture retains the passing group precisely so this stays a live assertion. NFL passing
  // yards is ESTIMATE and P318 is STOP: there is no published range to show a live value against.
  const rows = normalizeNflPlayerStats(fixture("nfl-summary.json"), { eventId: "401872929", fetchedAt: FETCHED });
  const markets = new Set(rows.map((r) => r.market));
  assert.deepEqual([...markets].sort(), ["player_reception_yds", "player_receptions", "player_rush_yds"]);
  assert.equal(markets.has("player_pass_yds"), false, "an ESTIMATE family must not reach the live view");
});

test("NFL 9 · values are read by column LABEL, so an inserted column cannot shift them", () => {
  const base = {
    header: { id: "1" },
    boxscore: { players: [{ team: { abbreviation: "XX" }, statistics: [{ name: "receiving", labels: ["REC", "YDS", "TD"], athletes: [{ athlete: { id: "77", displayName: "P" }, stats: ["5", "61", "1"] }] }] }] },
  };
  const before = normalizeNflPlayerStats(base, { eventId: "1", fetchedAt: FETCHED });
  assert.equal(before.find((r) => r.market === "player_reception_yds").value, 61);
  // ESPN inserts a leading column; a position-indexed reader would now report 5 receiving yards.
  const shifted = structuredClone(base);
  shifted.boxscore.players[0].statistics[0].labels = ["TGTS", "REC", "YDS", "TD"];
  shifted.boxscore.players[0].statistics[0].athletes[0].stats = ["8", "5", "61", "1"];
  const after = normalizeNflPlayerStats(shifted, { eventId: "1", fetchedAt: FETCHED });
  assert.equal(after.find((r) => r.market === "player_reception_yds").value, 61, "label-indexed, not position-indexed");
});

test("NFL 10 · a blank cell is ABSENT, never zero; an athlete with no id is skipped", () => {
  const payload = {
    header: { id: "1" },
    boxscore: { players: [{ team: { abbreviation: "XX" }, statistics: [{ name: "rushing", labels: ["CAR", "YDS"], athletes: [
      { athlete: { id: "1", displayName: "Blank" }, stats: ["--", "--"] },
      { athlete: { displayName: "No id" }, stats: ["3", "12"] },
      { athlete: { id: "3", displayName: "Real" }, stats: ["3", "0"] },
    ] }] }] },
  };
  const rows = normalizeNflPlayerStats(payload, { eventId: "1", fetchedAt: FETCHED });
  assert.equal(rows.filter((r) => r.playerId === "nfl-athlete-1").length, 0, "'--' is absent, not 0");
  assert.equal(rows.some((r) => r.name === "No id"), false, "identity is never minted from a name");
  const real = rows.find((r) => r.playerId === "nfl-athlete-3");
  assert.equal(real.value, 0, "a genuine 0 from the feed IS reported");
});

test("NFL 11 · a malformed summary yields no rows, never partial zeroes", () => {
  for (const bad of [null, {}, { boxscore: null }, { boxscore: { players: "x" } }]) {
    assert.deepEqual(normalizeNflPlayerStats(bad, { eventId: "1", fetchedAt: FETCHED }), []);
  }
});

test("NFL 12 · summaryEventId reports what the payload claims, so a mismatch can be refused", () => {
  assert.equal(summaryEventId(fixture("nfl-summary.json")), "401872929");
  assert.equal(summaryEventId({}), null);
});

/* ───────────────────────── refusal shape ───────────────────────── */

test("CONTRACT · a refusal is envelope-shaped and recognizable without duck typing", () => {
  const u = makeUnavailable({ reason: "PROVIDER_ERROR", fetchedAt: FETCHED });
  assert.equal(isUnavailable(u), true);
  assert.equal(isUnavailable(normalizeMlbSchedule(fixture("mlb-schedule.json"), FETCHED)[0]), false);
});

test("MLB 8 · ⚠ MLB carries NO live player stats — and the reason is a missing FORECAST, not a missing feed", () => {
  /*
   * Deferred on principle, so a future author does not "complete" it by reaching for the wrong join.
   *
   * A live comparison needs a published GameTime range on the other side. MLB has none per player:
   *   - `mlb/full-game-simulations/<date>.json` emits NO per-player output even on a `ready` game
   *     (verified 2026-09-15: `players` is undefined on gamePk 824307).
   *   - `mlb/player-props/<date>.json` is a BOOKMAKER PRICE LIST — American odds, provider names,
   *     the player identified by NAME with `team: null` and an opaque hashed gameId. It is not a
   *     GameTime forecast and it carries no person id to join on.
   *
   * So a live MLB player stat would sit either beside nothing, or beside a market price dressed as a
   * GameTime projection. Both are worse than the honest absence below.
   */
  const [live] = normalizeMlbSchedule(fixture("mlb-schedule.json"), FETCHED);
  assert.equal(live.playerStats, null);

  const simDate = path.join(APP_PUBLIC, "mlb/full-game-simulations");
  const newest = fs.readdirSync(simDate).filter((f) => f.endsWith(".json")).sort().pop();
  const slate = JSON.parse(fs.readFileSync(path.join(simDate, newest), "utf8"));
  const ready = slate.games.filter((g) => g.status === "ready");
  assert.ok(ready.length > 0, "the newest slate has a ready simulation — otherwise this proves nothing");
  for (const g of ready) {
    assert.ok(!Array.isArray(g.players) || g.players.length === 0,
      `gamePk ${g.gamePk} now emits per-player output — revisit the MLB live player slice`);
  }
});
