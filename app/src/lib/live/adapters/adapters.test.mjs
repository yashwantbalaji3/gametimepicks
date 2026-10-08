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
import { stableHash } from "../../game-simulations/rng.ts";

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

/*
 * ── MLB 8 · WHY MLB SHIPS NO LIVE PLAYER STATS, AND WHAT THE OTHER SIDE OF THE JOIN REALLY IS ────────
 *
 * CI-001 (2026-10-08). The first version of this test said the full-game simulation emits NO per-player
 * output ("verified 2026-09-15: `players` is undefined on gamePk 824307"). That was never true. Every
 * simulated game since the engine landed (2026-07-24), 824307 included, carries
 * `players: { batters: [...], pitchers: [...] }`, an OBJECT. The check was
 * `Array.isArray(g.players) && g.players.length > 0`, which an object can never satisfy, so the
 * subject assertion passed vacuously on all 583 simulated games. The only line that could ever go red
 * was a non-vacuity precondition: "a `ready` game exists in the newest slate", later "in the last 14
 * slates". That precondition broke on its own when `ready` became rare (board-adapter.ts, 2026-09-25:
 * nine POSTED-line projections per side). Only 8 of the 245 historical `ready` games meet that
 * predicate, and the newest is 2026-09-07. The 2026-10-08 slate pushed the last 2026-09-24 `ready`
 * label (pre-correction) out of the 14-slate window, and main went red.
 *
 * Nothing about the simulation broke. Every non-`unavailable` game in the window has 10,000 runs and
 * full winner / score / total / run-line / team-total distributions. `ready` vs `degraded` is an
 * INPUT-COMPLETENESS label (the "Complete inputs" / "Degraded inputs" chip). It is not product
 * eligibility, which reads `gameLabSimulation.status` from a different artifact.
 *
 * So these tests pin the invariant that matters, on deterministic evidence:
 *   - MLB 8  : the live adapter emits no MLB player stats.
 *   - MLB 8a : the evidence is real producer output, untouched, and covers every level.
 *   - MLB 8b : what the simulation's per-player rows ARE (simulated means keyed by StatsAPI id) and
 *              what they can never be (a bookmaker price), plus the shape check the old one missed.
 *   - MLB 8c : the same invariant over EVERY committed slate, status-agnostic. No rolling window, and
 *              no dependence on any level being common.
 */
const SIM_FIXTURE = fixture("mlb-full-game-sims.json");
const SIM_DIR = path.join(APP_PUBLIC, "mlb/full-game-simulations");
const BATTER_KEYS = ["playerId", "name", "team", "battingOrder", "plateAppearances", "hits", "totalBases", "homeRuns", "runs", "rbi", "walks", "strikeouts"];
const PITCHER_KEYS = ["playerId", "name", "team", "role", "battersFaced", "strikeouts", "hitsAllowed", "runsAllowed", "outsRecorded"];
/** Any key a sportsbook row carries. One of these on a simulation player row means a price is posing as a projection. */
const MARKET_KEY = /odds|price|implied|book|provider|vig|juice|selection|^line$|^point$|market/i;
const emitsPlayers = (g) => g.players != null && typeof g.players === "object" && (g.players.batters?.length > 0 || g.players.pitchers?.length > 0);
const marketKeysOf = (row) => Object.keys(row).filter((k) => MARKET_KEY.test(k));

/** Every way a simulation game can violate the player-output contract. Empty list = clean. */
function playerContractViolations(g) {
  const where = `gamePk ${g.gamePk} (${g.status})`;
  const out = [];
  if (g.status === "unavailable") {
    // The pre-event boundary: a refused game structurally cannot carry a forecast of any kind.
    if (g.players != null) out.push(`${where}: unavailable but carries players`);
    if (g.winProbability != null) out.push(`${where}: unavailable but carries a win probability`);
    return out;
  }
  if (!emitsPlayers(g)) return [`${where}: simulated but emits no per-player rows`];
  for (const [rows, keys, kind] of [[g.players.batters, BATTER_KEYS, "batter"], [g.players.pitchers, PITCHER_KEYS, "pitcher"]]) {
    for (const r of rows) {
      const leaked = marketKeysOf(r);
      if (leaked.length) out.push(`${where}: ${kind} ${r.name} carries market field(s) ${leaked.join(",")}`);
      if (JSON.stringify(Object.keys(r).sort()) !== JSON.stringify([...keys].sort())) out.push(`${where}: ${kind} ${r.name} keys ${Object.keys(r).join(",")}`);
      for (const k of keys.filter((k) => !["playerId", "name", "team", "role"].includes(k))) {
        if (!Number.isFinite(r[k]) || r[k] < 0) out.push(`${where}: ${kind} ${r.name} ${k}=${r[k]} is not a simulated non-negative mean`);
      }
      // A filler is never dressed as a person, and a person is never given a filler's identity.
      if (kind === "batter" && (r.playerId < 0) !== (r.name === "Lineup fallback")) out.push(`${where}: batter ${r.name} id ${r.playerId} — fallback identity mismatch`);
    }
  }
  for (const side of ["away", "home"]) {
    const team = side === "away" ? g.awayTeam : g.homeTeam;
    const batters = g.players.batters.filter((b) => b.team === team);
    if (batters.length !== 9) out.push(`${where}: ${team} has ${batters.length} batters, not 9`);
    const source = g.completeness?.[`${side}LineupSource`];
    const rated = g.completeness?.[`${side}RatedCount`];
    const fillers = batters.filter((b) => b.playerId < 0).length;
    if (source === "confirmed" && fillers) out.push(`${where}: ${team} confirmed order contains ${fillers} filler row(s)`);
    if (source === "prop-derived" && fillers !== Math.max(0, 9 - rated)) out.push(`${where}: ${team} ${fillers} filler row(s) vs ${rated} rated`);
  }
  return out;
}

test("MLB 8 · ⚠ MLB carries NO live player stats — no join exists yet that would not misstate a forecast", () => {
  /*
   * Deferred on principle, so a future author does not "complete" it by reaching for the wrong join.
   *
   * A live player stat needs a published GameTime forecast for THAT player on the other side. Neither
   * MLB source qualifies today:
   *   - `mlb/player-props/<date>.json` is a BOOKMAKER PRICE LIST: American odds, provider names, the
   *     player named by NAME with `team: null` and an opaque hashed gameId. It is not a GameTime
   *     forecast and has no person id to join on. Showing it beside a live stat dresses a market
   *     price as a GameTime projection.
   *   - `mlb/full-game-simulations/<date>.json` DOES emit per-player rows, keyed by StatsAPI id (MLB 8b).
   *     They are average box-score lines across the simulated games, not a published per-player range.
   *     On a confirmed order, a batter with no posted line keeps his real name but is simulated at
   *     REPLACEMENT-LEVEL rates, and the row does not say which batters those are (only the game-level
   *     notes do). A live join would put a generic rate beside a real player's live line as if it
   *     were his forecast. Per-row disclosure is roadmap TRUTH-001; coverage is MLB-003. Live
   *     player tracking belongs to LIVE-001.
   */
  const [live] = normalizeMlbSchedule(fixture("mlb-schedule.json"), FETCHED);
  assert.equal(live.playerStats, null);
  for (const g of normalizeMlbSchedule(fixture("mlb-schedule.json"), FETCHED)) {
    assert.equal(g.playerStats, null, `MLB event ${g.eventId} must not carry player stats`);
  }
});

test("MLB 8a · the simulation evidence is verbatim producer output and covers every completeness level", () => {
  const { _provenance: prov, games } = SIM_FIXTURE;
  assert.equal(games.length, prov.sources.length);
  for (const [i, g] of games.entries()) {
    // Self-verifying: the producer hashes each game without its hash. An edited fixture cannot pass.
    assert.equal(stableHash({ ...g, artifactHash: undefined }), g.artifactHash, `fixture gamePk ${g.gamePk} was altered after extraction`);
    assert.equal(g.artifactHash, prov.sources[i].artifactHash);
    assert.equal(g.gamePk, prov.sources[i].gamePk);
    assert.equal(g.status, g.completeness.level, "status mirrors the completeness level");
  }
  const levels = new Set(games.map((g) => g.status));
  assert.deepEqual([...levels].sort(), ["degraded", "ready", "unavailable"], "every level the producer can emit is represented");
  // The scenarios the invariants below are about, named so they cannot be dropped silently.
  const by = (pk) => games.find((g) => g.gamePk === pk);
  const ready = by(824229);
  assert.ok(ready.completeness.awayRatedCount >= 9 && ready.completeness.homeRatedCount >= 9, "`ready` under the CURRENT predicate");
  assert.equal(by(849838).completeness.awayLineupSource, "confirmed");
  assert.ok(by(849838).completeness.awayRatedCount < 9, "a confirmed order with replacement-rated real batters");
  assert.equal(by(849832).completeness.awayLineupSource, "prop-derived");
  assert.ok(by(849832).players.batters.some((b) => b.playerId < 0), "a prop-derived order with filler rows");
  assert.equal(by(823570).completeness.startedBeforeGeneration, true);
});

test("MLB 8b · ⚠ simulation player rows are simulated means keyed by StatsAPI id — never a bookmaker price", () => {
  const { games } = SIM_FIXTURE;
  const ready = games.find((g) => g.status === "ready");

  // Why the old check was blind, pinned so it cannot come back: it looked for an ARRAY.
  const oldPredicate = (g) => Array.isArray(g.players) && g.players.length > 0;
  assert.equal(oldPredicate(ready), false, "the pre-CI-001 predicate cannot see real output");
  assert.equal(ready.players.batters.length, 18);

  // Positive / negative controls for the predicates used here and in MLB 8c.
  assert.equal(emitsPlayers(ready), true);
  assert.equal(emitsPlayers({ players: null }), false);
  assert.equal(emitsPlayers({ players: { batters: [], pitchers: [] } }), false);
  const propsRow = { player: "Jose Ramirez", team: null, market: "batter_hits", point: 0.5, americanOdds: -225, provider: "BetMGM" };
  const boardLean = { playerId: 608070, marketKey: "batter_hits", line: 0.5, oddsOver: -240, impliedOver: 0.7059, bookmaker: "draftkings", projection: 1.11 };
  assert.deepEqual(marketKeysOf(propsRow).sort(), ["americanOdds", "market", "point", "provider"]);
  assert.deepEqual(marketKeysOf(boardLean).sort(), ["bookmaker", "impliedOver", "line", "marketKey", "oddsOver"]);
  assert.deepEqual(marketKeysOf(ready.players.batters[0]), []);
  // The detector must fire through the full contract check, not just in isolation.
  const leaked = structuredClone(ready);
  leaked.players.batters[0].oddsOver = -240;
  assert.ok(playerContractViolations(leaked).some((v) => v.includes("market field")));
  const disguised = structuredClone(ready);
  disguised.players.batters[0].playerId = -1;
  assert.ok(playerContractViolations(disguised).some((v) => v.includes("fallback identity")));

  for (const g of games) assert.deepEqual(playerContractViolations(g), [], `fixture gamePk ${g.gamePk}`);

  // Simulated, not padded: every simulated level carries full game-level distributions too.
  for (const g of games.filter((x) => x.status !== "unavailable")) {
    assert.equal(g.runCount, 10000);
    assert.ok(g.winProbability && g.totalRuns?.distribution?.length && g.finalScores.length, `gamePk ${g.gamePk} has full distributions`);
  }
  // Pitcher rows only for posted starters: MIL had none on 2026-10-07, so one row, and it is SD's.
  const noStarter = games.find((g) => g.gamePk === 849827);
  assert.deepEqual(noStarter.players.pitchers.map((p) => p.team), ["SD"]);
});

test("MLB 8c · every committed MLB simulation honours the player-output contract — all slates, any level", () => {
  const files = fs.readdirSync(SIM_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
  const sims = files.flatMap((f) => JSON.parse(fs.readFileSync(path.join(SIM_DIR, f), "utf8")).games ?? []);
  // Whole history, not a rolling window: this only shrinks if committed forecasts are deleted.
  const simulated = sims.filter(emitsPlayers);
  assert.ok(simulated.length > 0, `no simulated game with player rows in ${files.length} committed slate(s)`);
  const violations = sims.flatMap(playerContractViolations);
  assert.deepEqual(violations, [], `player-output contract broken:\n  ${violations.slice(0, 20).join("\n  ")}`);
});

test("MLB 9 · ⚠ a PRE game carries NO score — StatsAPI zeroes it an hour before first pitch", () => {
  /*
   * The exact payload observed in production on 2026-09-16: abstractGameState "Preview",
   * detailedState "Pre-Game", and BOTH the schedule score and the linescore runs already at 0.
   * Rendering that as 0–0 tells a reader the game is under way and scoreless.
   */
  const preGame = {
    gamePk: 824382,
    gameDate: "2026-09-16T17:10:00Z",
    status: { abstractGameState: "Preview", codedGameState: "P", detailedState: "Pre-Game" },
    teams: { home: { team: { id: 114, abbreviation: "CLE" }, score: 0 }, away: { team: { id: 145, abbreviation: "CWS" }, score: 0 } },
    linescore: { teams: { home: { runs: 0, hits: 0, errors: 0 }, away: { runs: 0, hits: 0, errors: 0 } } },
  };
  const e = normalizeMlbGame(preGame, FETCHED);
  assert.equal(e.state, "PRE");
  assert.equal(e.competitors.home.score, null, "a scheduled game has no score, not a zero");
  assert.equal(e.competitors.away.score, null);
});

test("MLB 10 · a genuine 0 DURING play is still reported — the fix must not hide real zeroes", () => {
  // The inverse of MLB 9. Suppressing zeroes wholesale would be a worse bug than showing them early.
  const scorelessLive = {
    gamePk: 999100,
    gameDate: "2026-09-16T17:10:00Z",
    status: { abstractGameState: "Live", codedGameState: "I", detailedState: "In Progress" },
    teams: { home: { team: { id: 1, abbreviation: "AAA" }, score: 0 }, away: { team: { id: 2, abbreviation: "BBB" }, score: 0 } },
    linescore: { currentInning: 3, inningState: "Top", outs: 1, teams: { home: { runs: 0 }, away: { runs: 0 } } },
  };
  const e = normalizeMlbGame(scorelessLive, FETCHED);
  assert.equal(e.state, "LIVE");
  assert.equal(e.competitors.home.score, 0, "a scoreless third inning IS 0, not absent");
  assert.equal(e.competitors.away.score, 0);

  // And a real final keeps a shutout.
  const shutout = structuredClone(scorelessLive);
  shutout.status = { abstractGameState: "Final", codedGameState: "F", detailedState: "Final" };
  shutout.linescore.teams.away.runs = 5;
  const f = normalizeMlbGame(shutout, FETCHED);
  assert.equal(f.competitors.home.score, 0, "a shutout is a real 0");
  assert.equal(f.competitors.away.score, 5);
});

test("MLB 11 · ⚠ Warmup is NOT live: coded state P outranks abstract 'Live' — no score, no inning, no LIVE", () => {
  /*
   * The exact status observed in production on 2026-09-16 for LAD @ CIN (824467) at 22:14Z, 26 minutes
   * before its 22:40Z first pitch: abstractGameState "Live", codedGameState "P", detailedState "Warmup",
   * with the linescore already at Top 1st and 0–0. Before this fix it normalized to LIVE, and Since Your
   * Last Visit would have told a reader the game was "Now live".
   */
  const warmup = {
    gamePk: 824467,
    gameDate: "2026-09-16T22:40:00Z",
    status: { abstractGameState: "Live", codedGameState: "P", detailedState: "Warmup", statusCode: "PW" },
    teams: { home: { team: { id: 113, abbreviation: "CIN" }, score: 0 }, away: { team: { id: 119, abbreviation: "LAD" }, score: 0 } },
    linescore: { currentInning: 1, currentInningOrdinal: "1st", inningState: "Top", outs: 0, teams: { home: { runs: 0 }, away: { runs: 0 } } },
  };
  const e = normalizeMlbGame(warmup, FETCHED);
  assert.equal(e.state, "PRE");
  assert.equal(e.competitors.home.score, null);
  assert.equal(e.competitors.away.score, null);
  assert.equal(e.period, null, "no 'Top 1st' before a pitch");
  assert.equal(mapMlbState({ abstractGameState: "Preview", codedGameState: "S" }), "PRE");
  // Positive control: once play begins (coded I) the same game is LIVE and keeps its genuine zeroes.
  const started = normalizeMlbGame({ ...warmup, status: { abstractGameState: "Live", codedGameState: "I", detailedState: "In Progress" } }, FETCHED);
  assert.equal(started.state, "LIVE");
  assert.equal(started.competitors.home.score, 0);
  assert.equal(started.period?.label, "Top 1st");
});
