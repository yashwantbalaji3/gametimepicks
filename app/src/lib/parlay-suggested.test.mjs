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
  groupSuggestedBySport,
  diversifiedAllOrder,
  getSlipSports,
  slipContainsSport,
  slipContainsTeam,
  slipContainsPlayer,
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

test("getAvailableTeamsFromSlips respects sport filter (NBA tab includes multi-slip NBA legs)", () => {
  // NBA tab should include teams from any NBA leg, including legs
  // inside multi-sport slips (s4 has a NY NBA leg).
  const nbaTeams = getAvailableTeamsFromSlips(POOL, "nba").map((t) => t.team);
  assert.deepEqual(nbaTeams.sort(), ["CLE", "NY", "OKC"]);
  // MLB tab includes LAD from s3 + from the MLB leg inside s4.
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
  // NY matches s2 (NY leg) AND s4 (multi-sport slip with an NY NBA leg).
  // Under the new NBA-aware sport rule, multi slips count under "nba".
  const ny = filterSlipsBySportTeamPlayer(POOL, { sport: "nba", team: "NY" });
  assert.deepEqual(ny.map((s) => s.slipId).sort(), ["s2", "s4"]);
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

test("fallbackToBestUnfilteredSlips honors sport filter (MLB tab includes multi)", () => {
  // s3 is MLB-only, s4 contains an MLB leg → both should appear under MLB.
  const top = fallbackToBestUnfilteredSlips(POOL, "mlb", 5);
  assert.deepEqual(top.map((s) => s.slipId).sort(), ["s3", "s4"]);
});

// ---------------------------------------------------------------------------
// NBA-visibility regression tests — locks the May 25 fix
// ---------------------------------------------------------------------------

test("groupSuggestedBySport: NBA tab includes multi-sport slips with NBA legs", () => {
  const buckets = groupSuggestedBySport(POOL);
  // NBA tab: s1, s2 (single-sport NBA), s4 (multi w/ NBA leg) → 3 slips.
  // s3 is MLB-only and should not appear.
  assert.deepEqual(buckets.nba.map((s) => s.slipId).sort(), ["s1", "s2", "s4"]);
  // MLB tab: s3 + s4 (multi w/ MLB leg) → 2 slips.
  assert.deepEqual(buckets.mlb.map((s) => s.slipId).sort(), ["s3", "s4"]);
  // Multi tab: strictly slips with legs from 2+ sports → just s4.
  assert.deepEqual(buckets.multi.map((s) => s.slipId), ["s4"]);
  // All bucket = every slip.
  assert.equal(buckets.all.length, 4);
});

test("getSlipSports / slipContainsSport correctly tags multi-sport slips", () => {
  const sports = getSlipSports(POOL[3]); // s4
  assert.deepEqual(Array.from(sports).sort(), ["mlb", "nba"]);
  assert.equal(slipContainsSport(POOL[3], "nba"), true);
  assert.equal(slipContainsSport(POOL[3], "mlb"), true);
  assert.equal(slipContainsSport(POOL[2], "nba"), false); // MLB_LAD
});

test("slipContainsTeam + slipContainsPlayer", () => {
  assert.equal(slipContainsTeam(POOL[3], "NY"), true);
  assert.equal(slipContainsTeam(POOL[3], "LAD"), true);
  assert.equal(slipContainsTeam(POOL[3], "OKC"), false);
  assert.equal(slipContainsPlayer(POOL[3], "Brunson"), true);
  assert.equal(slipContainsPlayer(POOL[3], "brunson"), true); // case-insensitive
  assert.equal(slipContainsPlayer(POOL[3], "Tatum"), false);
});

test("diversifiedAllOrder keeps highest-scored slip first AND surfaces NBA after 2 non-NBA picks", () => {
  // Build a pool: 3 conservative MLB + 1 conservative multi-NBA.
  // Expected behavior:
  //   pick 1: highest-scored MLB (cm1) — no bias, take the top.
  //   pick 2: next-best MLB (cm2) — 1 consecutive non-NBA.
  //   pick 3: bias triggers → swap in the NBA multi (cmu) ahead of cm3.
  //   pick 4: cm3 (the remaining MLB).
  const cMlb1 = mkSlip({ slipId: "cm1", riskProfile: "conservative", sport: "mlb",
    legs: [mkLeg({ sport: "mlb", team: "LAD", playerName: "P1" })], score: 2.0 });
  const cMlb2 = mkSlip({ slipId: "cm2", riskProfile: "conservative", sport: "mlb",
    legs: [mkLeg({ sport: "mlb", team: "LAD", playerName: "P2" })], score: 1.9 });
  const cMlb3 = mkSlip({ slipId: "cm3", riskProfile: "conservative", sport: "mlb",
    legs: [mkLeg({ sport: "mlb", team: "LAD", playerName: "P3" })], score: 1.8 });
  const cMulti = mkSlip({ slipId: "cmu", riskProfile: "conservative", sport: "multi",
    legs: [mkLeg({ sport: "nba", team: "NY", playerName: "NBA1" })], score: 1.0 });
  const out = diversifiedAllOrder([cMlb1, cMlb2, cMlb3, cMulti]);
  assert.deepEqual(out.map((s) => s.slipId), ["cm1", "cm2", "cmu", "cm3"]);
});
