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
  selectBuilderSlip,
  BUILDER_EARLY_STEP_MAX,
  legGameKey,
  legGameLabel,
  getSlipGames,
  slipContainsGame,
  getAvailableGamesFromSlips,
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
  // OKC matches s1 (both legs OKC, NBA-only).
  const okc = filterSlipsBySportTeamPlayer(POOL, { sport: "nba", team: "OKC" });
  assert.deepEqual(okc.map((s) => s.slipId), ["s1"]);
  // PR #114 contract: NBA tab now means NBA-only. Even though s4 is
  // a multi-sport slip with an NY NBA leg, the NBA tab must NOT
  // include it — it belongs in the Mixed tab. NY only matches s2.
  const ny = filterSlipsBySportTeamPlayer(POOL, { sport: "nba", team: "NY" });
  assert.deepEqual(ny.map((s) => s.slipId).sort(), ["s2"],
    "NBA tab must exclude multi-sport slips even when their NBA leg is on the team");
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

test("fallbackToBestUnfilteredSlips honors single-sport filter (MLB tab is MLB-only)", () => {
  // PR #114 contract: MLB tab now means MLB-only. s3 is MLB-only;
  // s4 is multi-sport (contains an MLB leg + an NBA leg) and must
  // NOT appear under MLB. Mixed tab is the only home for s4.
  const top = fallbackToBestUnfilteredSlips(POOL, "mlb", 5);
  assert.deepEqual(top.map((s) => s.slipId).sort(), ["s3"],
    "MLB tab must exclude multi-sport slips");
});

test("PR #114: NBA tab is NBA-only", () => {
  const nbaOnly = filterSlipsBySportTeamPlayer(POOL, { sport: "nba" });
  // s1 + s2 are NBA-only; s3 is MLB; s4 is multi. Tab returns s1, s2.
  assert.deepEqual(nbaOnly.map((s) => s.slipId).sort(), ["s1", "s2"]);
});

test("PR #114: MLB tab is MLB-only", () => {
  const mlbOnly = filterSlipsBySportTeamPlayer(POOL, { sport: "mlb" });
  // s3 is the only MLB-only slip.
  assert.deepEqual(mlbOnly.map((s) => s.slipId), ["s3"]);
});

test("PR #114: Mixed tab is the only home for cross-sport slips", () => {
  const mixed = filterSlipsBySportTeamPlayer(POOL, { sport: "multi" });
  // s4 is the only cross-sport slip.
  assert.deepEqual(mixed.map((s) => s.slipId), ["s4"]);
});

test("PR #114: All tab includes every slip (no sport filter)", () => {
  const all = filterSlipsBySportTeamPlayer(POOL, { sport: "all" });
  assert.deepEqual(all.length, POOL.length,
    "All tab must return every slip regardless of sport composition");
});

test("PR #114: NBA tab returns empty when only mixed-NBA slips exist", () => {
  // Pool with one multi-sport slip and one MLB-only slip — no
  // NBA-only slip → NBA tab must honestly return [].
  const nbaTab = filterSlipsBySportTeamPlayer([MULTI, MLB_LAD], {
    sport: "nba",
  });
  assert.deepEqual(nbaTab, [],
    "NBA tab must return [] when no NBA-only slip exists — caller is expected to render an honest empty state");
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
  // PR #110 filter D: Conservative now applies a Mixed-sport
  // (multi) display penalty, so a single-sport slip (carrollC,
  // sport: "mlb", score 1.29) outranks the multi-sport carrollA
  // (score 1.46) once the 0.5 mixed penalty is applied. Pick #1
  // should NOT be a mixed slip when a single-sport alternative is
  // available with score-after-penalty >= the mixed slip's
  // score-after-penalty.
  assert.equal(top3[0].slipId, "cc",
    "Conservative #1 should prefer single-sport when mixed-penalty wipes its lead");
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

test("selectDiverseForDisplay: Star Power lane diversifies between star-led slips", () => {
  // PR #101: star_power has its own display penalty entry. With 3
  // slips that all share an MLB superstar but have varied NBA stars,
  // the top-3 should rotate the second leg.
  const mkLeg = (name, market, sport = "nba") => ({
    sport, gameId: `g_${sport}`, gameDate: "2026-05-25",
    playerId: name.length, playerName: name, team: "X",
    opponent: null, market, side: "Over", line: 5, projection: 6,
    edgePct: 8, confidence: "High", bookmaker: "draftkings",
    oddsForSide: -110, starTier: "superstar", isStar: true,
  });
  const sp = (id, p2, score) => mkSlip({
    slipId: id, riskProfile: "star_power", sport: "multi",
    legs: [mkLeg("Mobley", "REB"), mkLeg(p2, "PTS")],
    score,
  });
  const slips = [sp("a", "Brunson", 1.5), sp("b", "Mitchell", 1.45),
                 sp("c", "KAT", 1.40)];
  const top3 = selectDiverseForDisplay(slips, "star_power", 3);
  assert.equal(top3[0].slipId, "a", "Top slip keeps highest score");
  // Each subsequent pick must rotate the second leg to a different
  // star (Mobley repeat is penalized).
  const names = top3.map((s) => s.legs[1].playerName);
  assert.equal(new Set(names).size, 3, `Star Power should rotate the second leg, got ${names}`);
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

// ---------------------------------------------------------------------------
// PR #110 safety filters — display-level Mixed penalty (filter D)
// ---------------------------------------------------------------------------

test("PR #110 D: Conservative prefers single-sport over mixed when scores are close", () => {
  // Mixed went 0-26 on 5/25. Conservative should down-rank a mixed
  // slip when a single-sport alternative is within ~0.5 of its score.
  const mixedTop = mkSlip({
    slipId: "mx", riskProfile: "conservative", sport: "multi",
    legs: [mkLeg({ sport: "nba", team: "OKC", playerName: "SGA" }),
           mkLeg({ sport: "mlb", team: "LAD", playerName: "Betts" })],
    score: 1.30,
  });
  const singleSport = mkSlip({
    slipId: "ss", riskProfile: "conservative", sport: "mlb",
    legs: [mkLeg({ sport: "mlb", team: "AZ", playerName: "Carroll" }),
           mkLeg({ sport: "mlb", team: "CIN", playerName: "Steer" })],
    score: 1.00,
  });
  const out = selectDiverseForDisplay([mixedTop, singleSport], "conservative", 2);
  // Mixed raw score wins by 0.30 — penalty 0.5 flips the order.
  assert.equal(out[0].slipId, "ss",
    "Conservative #1 should be the single-sport slip after the mixed penalty applies");
  assert.equal(out[1].slipId, "mx",
    "Mixed should still surface as #2 (we never hard-filter)");
});

test("PR #110 D: Conservative still picks Mixed when it is materially better", () => {
  // If the mixed slip is *clearly* better (score gap > 0.5), it
  // should still win #1 — we down-rank, we don't hard-filter.
  const mixedTop = mkSlip({
    slipId: "mx", riskProfile: "conservative", sport: "multi",
    legs: [mkLeg({ sport: "nba", team: "OKC", playerName: "SGA" }),
           mkLeg({ sport: "mlb", team: "LAD", playerName: "Betts" })],
    score: 2.00,
  });
  const singleSport = mkSlip({
    slipId: "ss", riskProfile: "conservative", sport: "mlb",
    legs: [mkLeg({ sport: "mlb", team: "AZ", playerName: "Carroll" }),
           mkLeg({ sport: "mlb", team: "CIN", playerName: "Steer" })],
    score: 1.00,
  });
  const out = selectDiverseForDisplay([mixedTop, singleSport], "conservative", 2);
  assert.equal(out[0].slipId, "mx",
    "Mixed should still win when materially better than single-sport");
});

test("PR #110 D: Aggressive does NOT apply a mixed-sport penalty", () => {
  // Aggressive / longshot lane allows mixed slips at face value.
  const mixedTop = mkSlip({
    slipId: "mx", riskProfile: "aggressive", sport: "multi",
    legs: [mkLeg({ sport: "nba", team: "OKC", playerName: "SGA" }),
           mkLeg({ sport: "mlb", team: "LAD", playerName: "Betts" })],
    score: 1.30,
  });
  const singleSport = mkSlip({
    slipId: "ss", riskProfile: "aggressive", sport: "mlb",
    legs: [mkLeg({ sport: "mlb", team: "AZ", playerName: "Carroll" }),
           mkLeg({ sport: "mlb", team: "CIN", playerName: "Steer" })],
    score: 1.00,
  });
  const out = selectDiverseForDisplay([mixedTop, singleSport], "aggressive", 2);
  // No mixed-penalty in aggressive — raw score wins.
  assert.equal(out[0].slipId, "mx",
    "Aggressive should keep the top-scoring slip even if mixed");
});

test("PR #110 D: Balanced applies a moderate mixed penalty", () => {
  // Balanced penalty is 0.3 — score gap of 0.2 should flip the order.
  const mixedTop = mkSlip({
    slipId: "mx", riskProfile: "balanced", sport: "multi",
    legs: [mkLeg({ sport: "nba", team: "OKC", playerName: "SGA" }),
           mkLeg({ sport: "mlb", team: "LAD", playerName: "Betts" })],
    score: 1.20,
  });
  const singleSport = mkSlip({
    slipId: "ss", riskProfile: "balanced", sport: "mlb",
    legs: [mkLeg({ sport: "mlb", team: "AZ", playerName: "Carroll" }),
           mkLeg({ sport: "mlb", team: "CIN", playerName: "Steer" })],
    score: 1.00,
  });
  const out = selectDiverseForDisplay([mixedTop, singleSport], "balanced", 2);
  assert.equal(out[0].slipId, "ss",
    "Balanced #1 should be single-sport when mixed lead < 0.3");
});

test("PR #110 D: mixed penalty does not produce empty output when only mixed slips exist", () => {
  // Honest fallback — if every candidate is mixed, the selector
  // should still return the top-scoring mixed slip rather than an
  // empty list.
  const mixedA = mkSlip({
    slipId: "ma", riskProfile: "conservative", sport: "multi",
    legs: [mkLeg({ sport: "nba", team: "OKC", playerName: "SGA" }),
           mkLeg({ sport: "mlb", team: "LAD", playerName: "Betts" })],
    score: 1.50,
  });
  const mixedB = mkSlip({
    slipId: "mb", riskProfile: "conservative", sport: "multi",
    legs: [mkLeg({ sport: "nba", team: "BOS", playerName: "Tatum" }),
           mkLeg({ sport: "mlb", team: "NYY", playerName: "Soto" })],
    score: 1.40,
  });
  const out = selectDiverseForDisplay([mixedA, mixedB], "conservative", 2);
  assert.equal(out.length, 2,
    "Selector must return mixed slips when no single-sport alternative exists");
  assert.equal(out[0].slipId, "ma", "Highest-scoring mixed still wins #1");
});

// ---------------------------------------------------------------------------
// Bank Builder — selectBuilderSlip (design doc §3.4)
// ---------------------------------------------------------------------------
//
// Section-by-combined-odds reference (parlay-risk-sections.ts):
//   low      (-∞, +300)     medium [+300, +600)
//   high     [+600, +1000)  longshot [+1000, +∞)
// Two-leg fixtures, combined American odds (decimal):
//   two -110  → +264  (3.645)  → Low      (clears a 2.0× target)
//   two +120  → +384  (4.84)   → Medium
//   two +200  → +800  (9.0)    → High
//   two +300  → +1500 (16.0)   → Longshot

/** Builder-test leg: full ParlayLeg shape with controllable odds /
 *  gameId / start time. Defaults to a -110 NBA prop. */
function bLeg({
  odds = -110,
  gameId = "g1",
  commenceTime = null,
  gameTime = null,
  playerName = "Player",
  team = "OKC",
  market = "PTS",
} = {}) {
  return {
    sport: "nba",
    gameId,
    gameDate: "2026-05-29",
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
    oddsForSide: odds,
    commenceTime,
    gameTime,
  };
}

/** Builder-test slip with controllable status / score / legs. */
function bSlip({ slipId, status = "pending", score = 1, legs = [], sameGame = false } = {}) {
  return {
    slipId,
    riskProfile: "balanced",
    sport: "nba",
    status,
    legs,
    score,
    sameGame,
    hasAnomalyLeg: false,
  };
}

// Two-leg fixtures in each section, distinct games, no settled outcome.
const B_LOW = bSlip({
  slipId: "low",
  score: 1.0,
  legs: [bLeg({ odds: -110, gameId: "g1" }), bLeg({ odds: -110, gameId: "g2" })],
});
const B_MED = bSlip({
  slipId: "med",
  score: 2.0,
  legs: [bLeg({ odds: 120, gameId: "g3" }), bLeg({ odds: 120, gameId: "g4" })],
});
const B_HIGH = bSlip({
  slipId: "high",
  score: 3.0,
  legs: [bLeg({ odds: 200, gameId: "g5" }), bLeg({ odds: 200, gameId: "g6" })],
});
const B_LONGSHOT = bSlip({
  slipId: "ls",
  score: 4.0,
  legs: [bLeg({ odds: 300, gameId: "g7" }), bLeg({ odds: 300, gameId: "g8" })],
});

test("selectBuilderSlip: risk preference — Low beats Medium/High even at lower score", () => {
  // B_LOW has the LOWEST raw score but the lowest-risk section, so the
  // section preference must dominate the confidence score.
  const r = selectBuilderSlip([B_HIGH, B_MED, B_LOW], { minDecimal: 2, stepNumber: 1 });
  assert.ok(r);
  assert.equal(r.slip.slipId, "low");
  assert.equal(r.section, "low");
});

test("selectBuilderSlip: within a section, higher suggestedScore wins", () => {
  const a = bSlip({ slipId: "a", score: 1.0, legs: [bLeg({ gameId: "g1" }), bLeg({ gameId: "g2" })] });
  const b = bSlip({ slipId: "b", score: 1.5, legs: [bLeg({ gameId: "g3" }), bLeg({ gameId: "g4" })] });
  const r = selectBuilderSlip([a, b], { minDecimal: 2, stepNumber: 1 });
  assert.equal(r.slip.slipId, "b");
});

test("selectBuilderSlip: returns combined American + decimal that cleared the target", () => {
  const r = selectBuilderSlip([B_LOW], { minDecimal: 2, stepNumber: 1 });
  assert.ok(r);
  assert.equal(r.combinedAmerican, 264);
  assert.ok(Math.abs(r.combinedDecimal - 3.6446) < 0.01,
    `expected ~3.6446, got ${r.combinedDecimal}`);
});

test("selectBuilderSlip: NEVER surfaces a settled slip; prefers a pending one", () => {
  // A settled (win) Low slip would be the best candidate by section +
  // score, but settled outcomes are never forward-looking picks.
  const settledLow = bSlip({
    slipId: "settled",
    status: "win",
    score: 9.0,
    legs: [bLeg({ odds: -110, gameId: "g1" }), bLeg({ odds: -110, gameId: "g2" })],
  });
  const r = selectBuilderSlip([settledLow, B_HIGH], { minDecimal: 2, stepNumber: 1 });
  assert.ok(r);
  assert.equal(r.slip.slipId, "high", "must skip the settled slip and take the pending High");
});

test("selectBuilderSlip: returns null when every clearing slip is settled", () => {
  const win = bSlip({ slipId: "w", status: "win", legs: [bLeg({ gameId: "g1" }), bLeg({ gameId: "g2" })] });
  const loss = bSlip({ slipId: "l", status: "loss", legs: [bLeg({ gameId: "g3" }), bLeg({ gameId: "g4" })] });
  const push = bSlip({ slipId: "p", status: "push", legs: [bLeg({ gameId: "g5" }), bLeg({ gameId: "g6" })] });
  assert.equal(selectBuilderSlip([win, loss, push], { minDecimal: 2, stepNumber: 1 }), null);
});

test("selectBuilderSlip: returns null for an empty pool or when nothing clears the target", () => {
  assert.equal(selectBuilderSlip([], { minDecimal: 2, stepNumber: 1 }), null);
  // Single -110 leg → decimal 1.909 < 2.0 → misses the target → null.
  const short = bSlip({ slipId: "short", legs: [bLeg({ odds: -110, gameId: "g1" })] });
  assert.equal(selectBuilderSlip([short], { minDecimal: 2, stepNumber: 1 }), null);
});

test("selectBuilderSlip: skips a slip with a missing leg price (never fabricates odds)", () => {
  const nullOdds = bSlip({
    slipId: "nullodds",
    legs: [bLeg({ odds: -110, gameId: "g1" }), { ...bLeg({ gameId: "g2" }), oddsForSide: null }],
  });
  assert.equal(selectBuilderSlip([nullOdds], { minDecimal: 2, stepNumber: 1 }), null);
});

test("selectBuilderSlip: avoids Longshot on early rungs, allows it later", () => {
  assert.equal(BUILDER_EARLY_STEP_MAX, 2);
  // Steps 1 & 2 are early → a lone Longshot is excluded → null.
  assert.equal(selectBuilderSlip([B_LONGSHOT], { minDecimal: 2, stepNumber: 1 }), null);
  assert.equal(selectBuilderSlip([B_LONGSHOT], { minDecimal: 2, stepNumber: 2 }), null);
  // Step 3+ → Longshot is eligible (ranked last, but selectable).
  const late = selectBuilderSlip([B_LONGSHOT], { minDecimal: 2, stepNumber: 3 });
  assert.ok(late);
  assert.equal(late.slip.slipId, "ls");
  assert.equal(late.section, "longshot");
  // Omitted stepNumber → treated as a late step (Longshot allowed).
  const noStep = selectBuilderSlip([B_LONGSHOT], { minDecimal: 2 });
  assert.ok(noStep);
  assert.equal(noStep.slip.slipId, "ls");
});

test("selectBuilderSlip: on an early rung, a Longshot is dropped but a lower section still wins", () => {
  const r = selectBuilderSlip([B_LONGSHOT, B_HIGH], { minDecimal: 2, stepNumber: 1 });
  assert.ok(r);
  assert.equal(r.slip.slipId, "high", "Longshot excluded early; High is the best remaining");
});

test("selectBuilderSlip: is deterministic and order-independent", () => {
  const r1 = selectBuilderSlip([B_HIGH, B_MED, B_LOW], { minDecimal: 2, stepNumber: 1 });
  const r2 = selectBuilderSlip([B_HIGH, B_MED, B_LOW], { minDecimal: 2, stepNumber: 1 });
  const r3 = selectBuilderSlip([B_LOW, B_HIGH, B_MED], { minDecimal: 2, stepNumber: 1 });
  assert.equal(r1.slip.slipId, r2.slip.slipId);
  assert.equal(r1.slip.slipId, r3.slip.slipId,
    "winner must not depend on input ordering");
});

test("selectBuilderSlip: does NOT mutate the caller's pool", () => {
  const pool = [B_HIGH, B_MED, B_LOW];
  const before = pool.map((s) => s.slipId);
  selectBuilderSlip(pool, { minDecimal: 2, stepNumber: 1 });
  assert.deepEqual(pool.map((s) => s.slipId), before,
    "input array order must be unchanged");
});

test("selectBuilderSlip: stable slipId tiebreak when all signals are equal", () => {
  // Identical section / score / diversity / known-starts → ascending
  // slipId breaks the tie.
  const zzz = bSlip({ slipId: "zzz", score: 1.0, legs: [bLeg({ gameId: "g1" }), bLeg({ gameId: "g2" })] });
  const aaa = bSlip({ slipId: "aaa", score: 1.0, legs: [bLeg({ gameId: "g3" }), bLeg({ gameId: "g4" })] });
  const r = selectBuilderSlip([zzz, aaa], { minDecimal: 2, stepNumber: 1 });
  assert.equal(r.slip.slipId, "aaa");
});

test("selectBuilderSlip: diversity tiebreak prefers more distinct games", () => {
  // Equal section + score; the same-game slip ('onegame', both legs on
  // gameId gX) loses to the two-game slip even though its slipId sorts
  // first — proving the distinct-games tiebreak fires before slipId.
  const oneGame = bSlip({ slipId: "onegame", score: 1.0, legs: [bLeg({ gameId: "gX" }), bLeg({ gameId: "gX" })] });
  const twoGame = bSlip({ slipId: "twogame", score: 1.0, legs: [bLeg({ gameId: "gA" }), bLeg({ gameId: "gB" })] });
  const r = selectBuilderSlip([oneGame, twoGame], { minDecimal: 2, stepNumber: 1 });
  assert.equal(r.slip.slipId, "twogame");
});

test("selectBuilderSlip: game-time tiebreak prefers slips with known start times", () => {
  // Equal section / score / distinct-games; the slip whose legs carry a
  // real commenceTime is preferred over the timeless one even though its
  // slipId sorts later — proving the known-start tiebreak fires before
  // slipId. We never fabricate a time when the board lacks one.
  const noTime = bSlip({ slipId: "anotime", score: 1.0, legs: [bLeg({ gameId: "g1" }), bLeg({ gameId: "g2" })] });
  const withTime = bSlip({
    slipId: "btime",
    score: 1.0,
    legs: [
      bLeg({ gameId: "g3", commenceTime: "2026-05-29T23:00:00Z" }),
      bLeg({ gameId: "g4", commenceTime: "2026-05-29T23:30:00Z" }),
    ],
  });
  const r = selectBuilderSlip([noTime, withTime], { minDecimal: 2, stepNumber: 1 });
  assert.equal(r.slip.slipId, "btime");
});

test("selectBuilderSlip: non-finite minDecimal returns null", () => {
  assert.equal(selectBuilderSlip([B_LOW], { minDecimal: NaN, stepNumber: 1 }), null);
  assert.equal(selectBuilderSlip([B_LOW], { minDecimal: Infinity, stepNumber: 1 }), null);
});

test("selectBuilderSlip: respects the step-5 1.875× target (decimal, not American)", () => {
  // Step 5 needs combined decimal ≥ 1.875. Two -110 legs (decimal
  // 3.645) clear it; a single -200 leg (decimal 1.5) does not.
  const clears = bSlip({ slipId: "clears", legs: [bLeg({ odds: -110, gameId: "g1" }), bLeg({ odds: -110, gameId: "g2" })] });
  const misses = bSlip({ slipId: "misses", legs: [bLeg({ odds: -200, gameId: "g3" })] });
  const r = selectBuilderSlip([clears, misses], { minDecimal: 1.875, stepNumber: 5 });
  assert.ok(r);
  assert.equal(r.slip.slipId, "clears");
});

// ---------------------------------------------------------------------------
// Game / matchup filter helpers (PR #9 — feature/parlay-lab-game-filter)
//
// Contract: a parlay "involves" a game when ANY leg belongs to it — the
// helpers must scan EVERY leg, never just leg 1, and must list every game
// on the slate (never a subset). No fabricated matchups.
// ---------------------------------------------------------------------------

// A leg whose gameId is blank so the order-normalized {team,opponent}
// fallback key is exercised. Both sides of the same matchup must collide
// onto one key/label regardless of which team the leg's player is on.
const FALLBACK_GAME = mkSlip({
  slipId: "s5",
  sport: "nba",
  legs: [
    { ...mkLeg({ team: "BOS", playerName: "Tatum" }), gameId: "", opponent: "MIA" },
    { ...mkLeg({ team: "MIA", playerName: "Herro" }), gameId: "", opponent: "BOS" },
  ],
});

test("legGameKey prefers the leg's gameId when present", () => {
  assert.equal(legGameKey(mkLeg({ team: "OKC" })), "g-OKC");
});

test("legGameKey falls back to an order-normalized matchup when gameId is blank", () => {
  const a = { ...mkLeg({ team: "NY" }), gameId: "", opponent: "BOS" };
  const b = { ...mkLeg({ team: "BOS" }), gameId: "", opponent: "NY" };
  // Same game, opposite sides → identical key.
  assert.equal(legGameKey(a), "BOS@NY");
  assert.equal(legGameKey(b), "BOS@NY");
});

test("legGameKey returns null when the leg carries no game identity", () => {
  const blank = { ...mkLeg({ team: "NY" }), gameId: "", team: null, opponent: null };
  assert.equal(legGameKey(blank), null);
});

test("legGameLabel is an order-normalized 'vs' matchup (never implies a venue)", () => {
  const a = { ...mkLeg({ team: "NY" }), opponent: "BOS" };
  const b = { ...mkLeg({ team: "BOS" }), opponent: "NY" };
  assert.equal(legGameLabel(a), "BOS vs NY");
  assert.equal(legGameLabel(b), "BOS vs NY");
  // One side known → just the team; both unknown → null.
  assert.equal(legGameLabel({ ...mkLeg({ team: "NY" }), opponent: null }), "NY");
  assert.equal(legGameLabel({ ...mkLeg(), team: null, opponent: null }), null);
});

test("getSlipGames spans EVERY leg, not just leg 1", () => {
  // NBA_NYK's two legs are different games (g-NY on leg 1, g-CLE on leg 2).
  const games = getSlipGames(NBA_NYK);
  assert.deepEqual([...games].sort(), ["g-CLE", "g-NY"]);
  // FALLBACK_GAME's two sides collide onto one normalized key.
  assert.deepEqual([...getSlipGames(FALLBACK_GAME)], ["BOS@MIA"]);
});

test("slipContainsGame matches a game on a non-first leg", () => {
  // g-CLE only appears on NBA_NYK's SECOND leg.
  assert.equal(slipContainsGame(NBA_NYK, "g-CLE"), true);
  assert.equal(slipContainsGame(NBA_NYK, "g-NY"), true);
  assert.equal(slipContainsGame(NBA_NYK, "g-OKC"), false);
  // Empty key never matches.
  assert.equal(slipContainsGame(NBA_NYK, ""), false);
});

test("getAvailableGamesFromSlips lists EVERY game for the sport (never a subset)", () => {
  // NBA tab: g-OKC (NBA_OKC), g-NY + g-CLE (NBA_NYK), and MULTI's NBA leg
  // (g-NY, already counted). MLB game g-LAD must NOT appear.
  const nba = getAvailableGamesFromSlips(POOL, "nba").map((g) => g.key);
  assert.deepEqual(nba.sort(), ["g-CLE", "g-NY", "g-OKC"]);
  // MLB tab: only the MLB game.
  const mlb = getAvailableGamesFromSlips(POOL, "mlb").map((g) => g.key);
  assert.deepEqual(mlb, ["g-LAD"]);
  // All tab spans every game on the slate.
  const all = getAvailableGamesFromSlips(POOL, "all").map((g) => g.key);
  assert.deepEqual(all.sort(), ["g-CLE", "g-LAD", "g-NY", "g-OKC"]);
});

test("getAvailableGamesFromSlips carries a label and is sorted by it", () => {
  const games = getAvailableGamesFromSlips([FALLBACK_GAME], "nba");
  assert.equal(games.length, 1);
  assert.equal(games[0].key, "BOS@MIA");
  assert.equal(games[0].label, "BOS vs MIA");
  assert.equal(games[0].sport, "nba");
});

test("filterSlipsBySportTeamPlayer gameKey matches when ANY leg belongs to the game", () => {
  // g-CLE lives only on NBA_NYK's second leg — proves all-legs scanning.
  const cle = filterSlipsBySportTeamPlayer(POOL, { sport: "nba", gameKey: "g-CLE" });
  assert.deepEqual(cle.map((s) => s.slipId), ["s2"]);
  // g-LAD on the All tab surfaces both the MLB slip and the multi slip.
  const lad = filterSlipsBySportTeamPlayer(POOL, { sport: "all", gameKey: "g-LAD" });
  assert.deepEqual(lad.map((s) => s.slipId).sort(), ["s3", "s4"]);
});

test("filterSlipsBySportTeamPlayer gameKey respects the sport pill", () => {
  // g-LAD is an MLB game; the NBA tab (single-sport NBA) must return [].
  const none = filterSlipsBySportTeamPlayer(POOL, { sport: "nba", gameKey: "g-LAD" });
  assert.deepEqual(none, []);
});

test("filterSlipsBySportTeamPlayer empty/absent gameKey is a no-op", () => {
  const all = filterSlipsBySportTeamPlayer(POOL, { sport: "all", gameKey: "" });
  assert.equal(all.length, POOL.length);
  const allNull = filterSlipsBySportTeamPlayer(POOL, { sport: "all", gameKey: null });
  assert.equal(allNull.length, POOL.length);
});

test("REGRESSION: team filter matches a team on a NON-FIRST leg", () => {
  // CLE appears only on NBA_NYK's second leg. The team filter must scan
  // every leg — locking the all-legs contract so a future refactor can't
  // silently regress to leg-1-only matching.
  const cle = filterSlipsBySportTeamPlayer(POOL, { sport: "nba", team: "CLE" });
  assert.deepEqual(cle.map((s) => s.slipId), ["s2"]);
});

test("game + team filters compose (both must hold)", () => {
  // NBA_NYK has leg1 NY/g-NY and leg2 CLE/g-CLE. Asking for team NY AND
  // game g-CLE still matches (NY on one leg, g-CLE on another).
  const both = filterSlipsBySportTeamPlayer(POOL, {
    sport: "nba",
    team: "NY",
    gameKey: "g-CLE",
  });
  assert.deepEqual(both.map((s) => s.slipId), ["s2"]);
  // Team OKC + game g-CLE share no slip → empty.
  const none = filterSlipsBySportTeamPlayer(POOL, {
    sport: "nba",
    team: "OKC",
    gameKey: "g-CLE",
  });
  assert.deepEqual(none, []);
});
