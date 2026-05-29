/**
 * Tests for the projections market grouping helper.
 *
 * Locks the "no per-book duplicate rows" contract on the /projections
 * page. Also guards: best-odds picks the most favorable price, edge
 * follows the best book, empty inputs return [], and unknown sides
 * never crash.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupLeansByMarket } from "./projections-market-group.ts";

function lean(overrides = {}) {
  return {
    sport: "nba",
    gameId: "g",
    playerId: 1,
    playerName: "Test Player",
    team: "SAS",
    opponent: "OKC",
    market: "PTS",
    marketLabel: "Points",
    side: "Over",
    line: 21.5,
    projection: 24.0,
    edgePct: 12.5,
    confidence: "Medium",
    oddsOver: -110,
    oddsUnder: -110,
    recentSeries: [22, 24, 20, 26, 23],
    bookmaker: "fanduel",
    reason: null,
    ...overrides,
  };
}

test("empty input → empty result", () => {
  assert.deepEqual(groupLeansByMarket([]), []);
});

test("two leans, same (market, side, line), different books → one group", () => {
  const groups = groupLeansByMarket([
    lean({ bookmaker: "fanduel", oddsOver: -122, edgePct: 38.7 }),
    lean({ bookmaker: "draftkings", oddsOver: -127, edgePct: 37.8 }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].leans.length, 2);
  assert.equal(groups[0].bookCount, 2);
  assert.deepEqual(groups[0].bookmakers, ["draftkings", "fanduel"]);
});

test("best odds picks the most favorable price for the chosen side", () => {
  // -122 > -127 in American odds (less negative = better for the bettor).
  const groups = groupLeansByMarket([
    lean({ bookmaker: "fanduel", oddsOver: -122 }),
    lean({ bookmaker: "draftkings", oddsOver: -127 }),
  ]);
  assert.equal(groups[0].bestOdds, -122);
  assert.equal(groups[0].bestBookmaker, "fanduel");
});

test("best odds works for Under picks too", () => {
  const groups = groupLeansByMarket([
    lean({ side: "Under", oddsUnder: -130, bookmaker: "fanduel" }),
    lean({ side: "Under", oddsUnder: -115, bookmaker: "draftkings" }),
  ]);
  assert.equal(groups[0].bestOdds, -115);
  assert.equal(groups[0].bestBookmaker, "draftkings");
});

test("Pass / No Play side has null bestOdds (no fabrication)", () => {
  const groups = groupLeansByMarket([
    lean({ side: "Pass", oddsOver: -110, oddsUnder: -110 }),
  ]);
  assert.equal(groups[0].bestOdds, null);
  assert.equal(groups[0].bestBookmaker, null);
});

test("edge follows the best book", () => {
  // FanDuel gives better odds AND higher edge → both fields adopted.
  const groups = groupLeansByMarket([
    lean({ bookmaker: "draftkings", oddsOver: -130, edgePct: 9.0 }),
    lean({ bookmaker: "fanduel", oddsOver: -115, edgePct: 12.5 }),
  ]);
  assert.equal(groups[0].bestEdgePct, 12.5);
  assert.equal(groups[0].bestBookmaker, "fanduel");
});

test("different lines → different groups (alt lines preserved)", () => {
  const groups = groupLeansByMarket([
    lean({ line: 21.5 }),
    lean({ line: 22.5 }),
  ]);
  assert.equal(groups.length, 2);
});

test("different sides → different groups", () => {
  const groups = groupLeansByMarket([
    lean({ side: "Over" }),
    lean({ side: "Under" }),
  ]);
  assert.equal(groups.length, 2);
});

test("different markets → different groups", () => {
  const groups = groupLeansByMarket([
    lean({ market: "PTS", marketLabel: "Points" }),
    lean({ market: "REB", marketLabel: "Rebounds" }),
    lean({ market: "AST", marketLabel: "Assists" }),
  ]);
  assert.equal(groups.length, 3);
});

test("live 2026-05-28 NBA shape: 6 leans (3 markets × 2 books) → 3 groups", () => {
  const groups = groupLeansByMarket([
    lean({ market: "PTS", marketLabel: "Points", line: 21.5, bookmaker: "fanduel" }),
    lean({ market: "PTS", marketLabel: "Points", line: 21.5, bookmaker: "draftkings" }),
    lean({ market: "REB", marketLabel: "Rebounds", line: 8.5, bookmaker: "fanduel" }),
    lean({ market: "REB", marketLabel: "Rebounds", line: 8.5, bookmaker: "draftkings" }),
    lean({ market: "AST", marketLabel: "Assists", line: 6.5, bookmaker: "fanduel" }),
    lean({ market: "AST", marketLabel: "Assists", line: 6.5, bookmaker: "draftkings" }),
  ]);
  assert.equal(groups.length, 3);
  for (const g of groups) {
    assert.equal(g.bookCount, 2);
    assert.equal(g.leans.length, 2);
  }
});

test("null line still groups consistently", () => {
  const groups = groupLeansByMarket([
    lean({ line: null, bookmaker: "fanduel" }),
    lean({ line: null, bookmaker: "draftkings" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].bookCount, 2);
});

test("missing bookmaker doesn't crash + bookCount stays accurate", () => {
  const groups = groupLeansByMarket([
    lean({ bookmaker: null }),
    lean({ bookmaker: "fanduel" }),
  ]);
  assert.equal(groups[0].leans.length, 2);
  assert.equal(groups[0].bookCount, 1);
  assert.deepEqual(groups[0].bookmakers, ["fanduel"]);
});

test("recentSeries + projection + confidence carry over from first lean", () => {
  const groups = groupLeansByMarket([
    lean({ projection: 24.5, recentSeries: [22, 23], confidence: "High" }),
    lean({ projection: 24.5, recentSeries: [22, 23], confidence: "High" }),
  ]);
  assert.equal(groups[0].projection, 24.5);
  assert.deepEqual(groups[0].recentSeries, [22, 23]);
  assert.equal(groups[0].confidence, "High");
});
