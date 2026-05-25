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
  selectDiverseForDisplay,
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

// ---------------------------------------------------------------------------
// Display-level cross-bucket diversity (PR #100 follow-up)
// ---------------------------------------------------------------------------

test("selectDiverseForDisplay: Conservative does not anchor every visible card on the same player when alternatives exist", () => {
  // Three Carroll-anchored slips that win raw-score against three
  // diverse alternatives — exactly the May-25 production scenario.
  const carrollA = mkSlip({
    slipId: "ca", riskProfile: "conservative", sport: "multi",
    legs: [mkLeg({ sport: "nba", team: "CLE", playerName: "Mobley", market: "REB" }),
           mkLeg({ sport: "mlb", team: "AZ", playerName: "Carroll", market: "Hits" })],
    score: 1.46,
  });
  const carrollB = mkSlip({
    slipId: "cb", riskProfile: "conservative", sport: "multi",
    legs: [mkLeg({ sport: "nba", team: "CLE", playerName: "Merrill", market: "REB" }),
           mkLeg({ sport: "mlb", team: "AZ", playerName: "Carroll", market: "Hits" })],
    score: 1.42,
  });
  const carrollC = mkSlip({
    slipId: "cc", riskProfile: "conservative", sport: "mlb",
    legs: [mkLeg({ sport: "mlb", team: "AZ", playerName: "Carroll", market: "Hits" }),
           mkLeg({ sport: "mlb", team: "CIN", playerName: "Steer", market: "Hits" })],
    score: 1.29,
  });
  const altRuiz = mkSlip({
    slipId: "alt1", riskProfile: "conservative", sport: "mlb",
    legs: [mkLeg({ sport: "mlb", team: "WSH", playerName: "Ruiz", market: "Hits" }),
           mkLeg({ sport: "mlb", team: "AZ", playerName: "Marte", market: "Hits" })],
    score: 1.24,
  });
  const altHarden = mkSlip({
    slipId: "alt2", riskProfile: "conservative", sport: "multi",
    legs: [mkLeg({ sport: "nba", team: "NY", playerName: "Harden", market: "REB" }),
           mkLeg({ sport: "mlb", team: "CIN", playerName: "Steer", market: "Hits" })],
    score: 1.23,
  });
  const altSoto = mkSlip({
    slipId: "alt3", riskProfile: "conservative", sport: "multi",
    legs: [mkLeg({ sport: "mlb", team: "NYY", playerName: "Soto", market: "Hits" }),
           mkLeg({ sport: "nba", team: "NY", playerName: "Hart", market: "REB" })],
    score: 1.22,
  });
  const pool = [carrollA, carrollB, carrollC, altRuiz, altHarden, altSoto];
  const top3 = selectDiverseForDisplay(pool, "conservative", 3);
  assert.equal(top3.length, 3);
  // Pick #1 keeps the top-scoring slip.
  assert.equal(top3[0].slipId, "ca");
  // The visible top-3 should NOT all contain Carroll. (Hits player)
  const carrollHits = top3.filter((s) =>
    s.legs.some((l) => l.playerName === "Carroll"),
  ).length;
  assert.ok(
    carrollHits < 3,
    `Conservative top-3 should not all contain Carroll, got ${carrollHits} of 3`,
  );
});

test("selectDiverseForDisplay: repeated player+market penalty rotates the visible anchor", () => {
  // Two slips both with player X market M, plus one alternative with
  // a different player. Top-2 must contain the alternative as #2.
  const a = mkSlip({
    slipId: "a", riskProfile: "conservative", sport: "nba",
    legs: [mkLeg({ playerName: "X", market: "REB" }),
           mkLeg({ playerName: "Y", market: "PTS" })],
    score: 1.5,
  });
  const b = mkSlip({
    slipId: "b", riskProfile: "conservative", sport: "nba",
    legs: [mkLeg({ playerName: "X", market: "REB" }), // same player+market as #a
           mkLeg({ playerName: "Z", market: "PTS" })],
    score: 1.45,
  });
  const c = mkSlip({
    slipId: "c", riskProfile: "conservative", sport: "nba",
    legs: [mkLeg({ playerName: "W", market: "AST" }),
           mkLeg({ playerName: "Q", market: "REB" })],
    score: 1.20,
  });
  const top2 = selectDiverseForDisplay([a, b, c], "conservative", 2);
  assert.equal(top2[0].slipId, "a", "Top slip keeps highest suggestedScore");
  assert.equal(
    top2[1].slipId, "c",
    "Repeat-player+market penalty should push c above b in #2 slot",
  );
});

test("selectDiverseForDisplay: first slip is always the top-suggestedScore slip", () => {
  // Five varied slips, well-separated scores. #1 must always be the
  // top scorer — diversity is a tiebreaker, not a way to suppress
  // the best slip.
  const slips = [];
  for (let i = 0; i < 5; i++) {
    slips.push(mkSlip({
      slipId: `s${i}`, riskProfile: "balanced", sport: "nba",
      legs: [mkLeg({ playerName: `P${i}`, market: "REB" })],
      score: 1.5 - i * 0.05,
    }));
  }
  const top3 = selectDiverseForDisplay(slips, "balanced", 3);
  assert.equal(top3[0].slipId, "s0", "Best slip stays first");
  assert.equal(top3.length, 3);
  // No empty fallback when real slips exist.
  for (const s of top3) {
    assert.ok(s != null && s.legs.length > 0);
  }
});

test("selectDiverseForDisplay: Conservative diversifies more strongly than Aggressive", () => {
  // Same pool, two profiles. Conservative should pick fewer repeats
  // of the same player than Aggressive given identical inputs.
  const make = (slipId, p1, p2, score, profile) =>
    mkSlip({
      slipId, riskProfile: profile, sport: "nba",
      legs: [mkLeg({ playerName: p1, market: "REB" }),
             mkLeg({ playerName: p2, market: "PTS" })],
      score,
    });
  // 4 slips, all containing "Star" but with different secondaries.
  const buildPool = (profile) => [
    make("a", "Star", "X", 1.50, profile),
    make("b", "Star", "Y", 1.45, profile),
    make("c", "Star", "Z", 1.40, profile),
    // Diverse alternative scoring slightly lower.
    make("d", "Different", "Q", 1.20, profile),
  ];
  const consTop3 = selectDiverseForDisplay(buildPool("conservative"), "conservative", 3);
  const aggTop3 = selectDiverseForDisplay(buildPool("aggressive"), "aggressive", 3);
  const countStar = (slips) =>
    slips.filter((s) => s.legs.some((l) => l.playerName === "Star")).length;
  const consStar = countStar(consTop3);
  const aggStar = countStar(aggTop3);
  assert.ok(
    consStar <= aggStar,
    `Conservative should diversify >= Aggressive (Star repeats: cons=${consStar} agg=${aggStar})`,
  );
  // And conservative specifically should not anchor all 3 on Star
  // when there is a non-Star alternative within ~0.3 raw score.
  assert.ok(consStar < 3, "Conservative top-3 should not all share the same anchor");
});

test("selectDiverseForDisplay: no empty/junk fallback when real slips exist", () => {
  // Penalty should never drive the helper to return an empty list,
  // and it must never pick a slip with no legs.
  const a = mkSlip({
    slipId: "a", riskProfile: "balanced", sport: "nba",
    legs: [mkLeg({ playerName: "P1", market: "REB" })],
    score: 0.9,
  });
  // Single slip → must come back as the lone pick.
  const onlyOne = selectDiverseForDisplay([a], "balanced", 3);
  assert.equal(onlyOne.length, 1);
  assert.equal(onlyOne[0].slipId, "a");
  // Empty input → empty output (no fabrication).
  assert.deepEqual(selectDiverseForDisplay([], "balanced", 3), []);
  // limit 0 → empty.
  assert.deepEqual(selectDiverseForDisplay([a], "balanced", 0), []);
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
