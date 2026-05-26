/**
 * Tests for the player-grouping + slip-leg helpers used by the
 * Results redesign (PR #111).
 *
 * Run: npx tsx --test app/src/lib/settled-player-summary.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  groupSettledLeansByPlayer,
  summarizePlayerResults,
  sortPlayerResultsForDisplay,
  groupPlayerRowsByMarket,
  summarizeSlipLegResults,
  isNearMissSlip,
  getSlipLosingLegIndices,
  classifySlipStatus,
} from "./settled-player-summary.ts";

function row({
  player = "P1",
  team = "OKC",
  market = "PTS",
  result = "win",
  date = "2026-05-25",
  gameId = "g1",
  playerId = 1,
} = {}) {
  return {
    date,
    gameId,
    playerId,
    playerName: player,
    team,
    market,
    side: "Over",
    line: 5,
    result,
  };
}

// ---------------------------------------------------------------------------
// Player grouping
// ---------------------------------------------------------------------------

test("groupSettledLeansByPlayer buckets case-insensitively by player name", () => {
  const rows = [
    row({ player: "Aaron Judge", market: "Hits", result: "win" }),
    row({ player: "aaron judge", market: "TB", result: "loss" }),
    row({ player: "Soto", market: "Hits", result: "stats_unavailable" }),
  ];
  const grouped = groupSettledLeansByPlayer(rows);
  assert.equal(grouped.length, 2);
  const judge = grouped.find((g) => g.player.toLowerCase() === "aaron judge");
  assert.ok(judge);
  assert.equal(judge.rows.length, 2);
  assert.equal(judge.wins, 1);
  assert.equal(judge.losses, 1);
});

test("summarizePlayerResults handles pushes + pending without inflating decisive", () => {
  const rows = [
    row({ result: "win" }),
    row({ result: "loss" }),
    row({ result: "push" }),
    row({ result: "stats_unavailable" }),
    row({ result: "unresolved" }),
  ];
  const s = summarizePlayerResults(rows);
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 1);
  assert.equal(s.pushes, 1);
  assert.equal(s.pending, 2,
    "stats_unavailable + unresolved BOTH bucket to pending");
  assert.equal(s.decisive, 2);
  assert.equal(s.hitRate, 0.5);
});

test("summarizePlayerResults — hitRate is null with zero decisive (no fake 0%)", () => {
  const rows = [
    row({ result: "push" }),
    row({ result: "stats_unavailable" }),
  ];
  const s = summarizePlayerResults(rows);
  assert.equal(s.decisive, 0);
  assert.equal(s.hitRate, null,
    "hitRate must be null when no decisive picks — never 0%");
});

test("summarizePlayerResults picks the most-frequent team", () => {
  const rows = [
    row({ player: "P", team: "BOS", result: "win" }),
    row({ player: "P", team: "BOS", result: "loss" }),
    row({ player: "P", team: "OKC", result: "win" }),
  ];
  const s = summarizePlayerResults(rows);
  assert.equal(s.team, "BOS",
    "Most-frequent team observed should win the display slot");
});

test("sortPlayerResultsForDisplay orders by decisive > wins > hitRate > name", () => {
  const players = [
    { player: "A", team: null, playerId: null, gameId: null, wins: 0, losses: 0, pushes: 0, pending: 5, decisive: 0, hitRate: null, rows: [] },
    { player: "B", team: null, playerId: null, gameId: null, wins: 3, losses: 2, pushes: 0, pending: 0, decisive: 5, hitRate: 0.6, rows: [] },
    { player: "C", team: null, playerId: null, gameId: null, wins: 2, losses: 3, pushes: 0, pending: 0, decisive: 5, hitRate: 0.4, rows: [] },
    { player: "D", team: null, playerId: null, gameId: null, wins: 1, losses: 0, pushes: 0, pending: 0, decisive: 1, hitRate: 1.0, rows: [] },
  ];
  const out = sortPlayerResultsForDisplay(players);
  assert.deepEqual(out.map((p) => p.player), ["B", "C", "D", "A"],
    "Most decisive first; alphabetical only as tiebreaker on the tail");
});

test("sortPlayerResultsForDisplay promotes featured players ahead of pending-only", () => {
  const players = [
    { player: "Rookie", team: null, playerId: null, gameId: null, wins: 5, losses: 0, pushes: 0, pending: 0, decisive: 5, hitRate: 1, rows: [] },
    { player: "Star", team: null, playerId: null, gameId: null, wins: 0, losses: 0, pushes: 0, pending: 1, decisive: 0, hitRate: null, rows: [] },
  ];
  // Without featured set, Rookie wins.
  let out = sortPlayerResultsForDisplay(players);
  assert.equal(out[0].player, "Rookie");
  // With Star featured, Star jumps to the top.
  out = sortPlayerResultsForDisplay(players, {
    featured: new Set(["star"]),
  });
  assert.equal(out[0].player, "Star");
});

test("groupPlayerRowsByMarket — NBA market order is PTS → REB → AST", () => {
  const rows = [
    row({ market: "AST", result: "win" }),
    row({ market: "PTS", result: "loss" }),
    row({ market: "REB", result: "win" }),
    row({ market: "Hits", result: "win" }),
  ];
  const grouped = groupPlayerRowsByMarket(rows);
  // NBA stat order locked; non-NBA falls through to alphabetical.
  assert.deepEqual(grouped.map((g) => g.market), ["PTS", "REB", "AST", "Hits"]);
});

// ---------------------------------------------------------------------------
// Slip-level helpers
// ---------------------------------------------------------------------------

test("summarizeSlipLegResults counts legs per state", () => {
  const slip = {
    status: "loss",
    legs: [
      { result: "win" },
      { result: "loss" },
      { result: "push" },
      { result: "unresolved" },
    ],
  };
  const c = summarizeSlipLegResults(slip);
  assert.equal(c.total, 4);
  assert.equal(c.wins, 1);
  assert.equal(c.losses, 1);
  assert.equal(c.pushes, 1);
  assert.equal(c.pending, 1);
});

test("isNearMissSlip — true iff status loss + exactly one losing leg + no pending", () => {
  const nearMiss = {
    status: "loss",
    legs: [{ result: "win" }, { result: "win" }, { result: "loss" }],
  };
  assert.equal(isNearMissSlip(nearMiss), true);

  // Two losing legs → not a near miss.
  const blowout = {
    status: "loss",
    legs: [{ result: "win" }, { result: "loss" }, { result: "loss" }],
  };
  assert.equal(isNearMissSlip(blowout), false);

  // Pending legs → not a near miss (we can't tell yet).
  const stillPending = {
    status: "loss",
    legs: [{ result: "win" }, { result: "loss" }, { result: "unresolved" }],
  };
  assert.equal(isNearMissSlip(stillPending), false);

  // Winning slips are never near misses.
  const winner = {
    status: "win",
    legs: [{ result: "win" }, { result: "win" }],
  };
  assert.equal(isNearMissSlip(winner), false);
});

test("getSlipLosingLegIndices returns indices in order", () => {
  const slip = {
    status: "loss",
    legs: [
      { result: "win" },
      { result: "loss" },
      { result: "win" },
      { result: "loss" },
    ],
  };
  assert.deepEqual(getSlipLosingLegIndices(slip), [1, 3]);
});

test("classifySlipStatus honors explicit status first", () => {
  assert.equal(classifySlipStatus({ status: "win", legs: [{ result: "loss" }] }), "win",
    "Explicit status field beats leg inspection");
  assert.equal(classifySlipStatus({ status: "pending", legs: [] }), "pending");
});

test("classifySlipStatus derives from legs when status missing", () => {
  assert.equal(classifySlipStatus({ legs: [{ result: "win" }, { result: "loss" }] }),
    "loss",
    "Any losing leg → slip loss when status absent");
  assert.equal(classifySlipStatus({ legs: [{ result: "win" }, { result: "win" }] }),
    "win");
  assert.equal(classifySlipStatus({ legs: [{ result: "win" }, { result: "unresolved" }] }),
    "pending",
    "Pending legs with no losses → slip pending");
});
