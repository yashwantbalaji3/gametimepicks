/**
 * Unit tests for the team-first filtering helpers.
 *
 * Run:
 *   node --test app/src/lib/parlay-suggested.test.mjs
 *
 * Uses Node's experimental TS support (22.6+) so we can import .ts
 * directly. If the local node is older, run via:
 *   npx tsx --test app/src/lib/parlay-suggested.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  getAvailableSportsFromSlips,
  getAvailableTeamsFromSlips,
  getAvailablePlayersForTeam,
  filterSlipsBySportTeamPlayer,
  fallbackToBestUnfilteredSlips,
} from "./parlay-suggested.ts";

function mkLeg({ sport = "nba", team = "OKC", playerName = "Player A", market = "PTS" } = {}) {
  return {
    sport,
    gameId: `g-${team}`,
    gameDate: "2026-05-25",
    playerId: 1,
    playerName,
    team,
    opponent: null,
    market,
    side: "Over",
    line: 5,
    projection: 6,
    edgePct: 5,
    confidence: "High",
    bookmaker: "draftkings",
    oddsForSide: -110,
  };
}

function mkSlip({ slipId, riskProfile = "balanced", sport = "nba", legs = [], score = 1 } = {}) {
  return {
    slipId,
    riskProfile,
    sport,
    status: "pending",
    legs,
    score,
    sameGame: false,
    hasAnomalyLeg: false,
  };
}

const NBA_OKC = mkSlip({
  slipId: "s1",
  sport: "nba",
  legs: [mkLeg({ team: "OKC", playerName: "SGA" }), mkLeg({ team: "OKC", playerName: "Holmgren" })],
  score: 1.5,
});
const NBA_NYK = mkSlip({
  slipId: "s2",
  sport: "nba",
  legs: [mkLeg({ team: "NY", playerName: "Brunson" }), mkLeg({ team: "CLE", playerName: "Mitchell" })],
  score: 1.2,
});
const MLB_LAD = mkSlip({
  slipId: "s3",
  sport: "mlb",
  legs: [mkLeg({ sport: "mlb", team: "LAD", playerName: "Smith" }), mkLeg({ sport: "mlb", team: "LAD", playerName: "Betts" })],
  score: 1.0,
});
const MULTI = mkSlip({
  slipId: "s4",
  sport: "multi",
  legs: [mkLeg({ sport: "nba", team: "NY", playerName: "Brunson" }), mkLeg({ sport: "mlb", team: "LAD", playerName: "Smith" })],
  score: 0.9,
});

const POOL = [NBA_OKC, NBA_NYK, MLB_LAD, MULTI];

test("getAvailableSportsFromSlips lists every present sport with all-first", () => {
  const sports = getAvailableSportsFromSlips(POOL);
  assert.deepEqual(sports, ["all", "nba", "mlb", "multi"]);
});

test("getAvailableSportsFromSlips returns [] for empty pool", () => {
  assert.deepEqual(getAvailableSportsFromSlips([]), []);
});

test("getAvailableTeamsFromSlips respects sport filter", () => {
  const nbaTeams = getAvailableTeamsFromSlips(POOL, "nba").map((t) => t.team);
  assert.deepEqual(nbaTeams.sort(), ["CLE", "NY", "OKC"]);
  const mlbTeams = getAvailableTeamsFromSlips(POOL, "mlb").map((t) => t.team);
  assert.deepEqual(mlbTeams, ["LAD"]);
});

test("getAvailableTeamsFromSlips 'all' lists everything", () => {
  const all = getAvailableTeamsFromSlips(POOL, "all").map((t) => t.team);
  assert.deepEqual(all.sort(), ["CLE", "LAD", "NY", "OKC"]);
});

test("getAvailablePlayersForTeam filters to selected team", () => {
  const okcPlayers = getAvailablePlayersForTeam(POOL, "nba", "OKC").map((p) => p.name);
  assert.deepEqual(okcPlayers.sort(), ["Holmgren", "SGA"]);
});

test("getAvailablePlayersForTeam returns all sport players when team is null", () => {
  const allNba = getAvailablePlayersForTeam(POOL, "nba", null).map((p) => p.name);
  assert.deepEqual(allNba.sort(), ["Brunson", "Holmgren", "Mitchell", "SGA"]);
});

test("filterSlipsBySportTeamPlayer matches when any leg is on the team", () => {
  // OKC matches s1 (both legs OKC).
  const okc = filterSlipsBySportTeamPlayer(POOL, { sport: "nba", team: "OKC" });
  assert.deepEqual(okc.map((s) => s.slipId), ["s1"]);
  // NY matches s2 (one leg NY).
  const ny = filterSlipsBySportTeamPlayer(POOL, { sport: "nba", team: "NY" });
  assert.deepEqual(ny.map((s) => s.slipId), ["s2"]);
});

test("filterSlipsBySportTeamPlayer player filter requires every selected name", () => {
  const both = filterSlipsBySportTeamPlayer(POOL, {
    sport: "all",
    playerNames: ["Brunson", "Smith"],
  });
  assert.deepEqual(both.map((s) => s.slipId), ["s4"]);
});

test("filterSlipsBySportTeamPlayer returns [] when nothing matches", () => {
  const none = filterSlipsBySportTeamPlayer(POOL, {
    sport: "nba",
    team: "BOS",
  });
  assert.deepEqual(none, []);
});

test("fallbackToBestUnfilteredSlips ranks by suggestedScore", () => {
  const top = fallbackToBestUnfilteredSlips(POOL, "all", 2);
  assert.equal(top.length, 2);
  // suggestedScore subtracts profile offset; all here are "balanced" so
  // raw score wins. Top should be NBA_OKC (1.5) then NBA_NYK (1.2).
  assert.equal(top[0].slipId, "s1");
  assert.equal(top[1].slipId, "s2");
});

test("fallbackToBestUnfilteredSlips honors sport filter", () => {
  const top = fallbackToBestUnfilteredSlips(POOL, "mlb", 5);
  assert.equal(top.length, 1);
  assert.equal(top[0].slipId, "s3");
});
