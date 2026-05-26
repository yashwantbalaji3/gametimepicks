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
  dedupeSettledPicksByMarket,
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

// ---------------------------------------------------------------------------
// PR #114: dedupe per-bookmaker duplicate audit rows
// ---------------------------------------------------------------------------

function bookRow({ book, player = "P1", market = "PTS", line = 18.5, side = "Over",
                  result = "win", finalStat = 19, projection = 19.2, edge = 4,
                  oddsOver = -110, gameId = "g1" } = {}) {
  return {
    date: "2026-05-25",
    gameId,
    playerId: 1,
    playerName: player,
    team: "CLE",
    market,
    side,
    line,
    bookmaker: book,
    oddsOver,
    oddsUnder: -110,
    modelProjection: projection,
    edgePct: edge,
    confidence: "High",
    finalStat,
    result,
  };
}

test("PR #114: dedupe collapses 8 book rows into 1 group with bookCount=8", () => {
  const rows = [
    bookRow({ book: "draftkings", oddsOver: -110 }),
    bookRow({ book: "fanduel",    oddsOver: -108 }),
    bookRow({ book: "betmgm",     oddsOver: -115 }),
    bookRow({ book: "caesars",    oddsOver: -109 }),
    bookRow({ book: "espnbet",    oddsOver: -112 }),
    bookRow({ book: "betrivers",  oddsOver: -110 }),
    bookRow({ book: "unibet",     oddsOver: -113 }),
    bookRow({ book: "pointsbet",  oddsOver: -111 }),
  ];
  const out = dedupeSettledPicksByMarket(rows);
  assert.equal(out.length, 1, "single market bucket");
  assert.equal(out[0].market, "PTS");
  assert.equal(out[0].groups.length, 1, "single deduped group");
  const g = out[0].groups[0];
  assert.equal(g.bookCount, 8);
  assert.equal(g.result, "win");
  assert.equal(g.actual, 19);
  assert.equal(g.line, 18.5);
  assert.equal(g.side, "Over");
  assert.equal(g.oddsRange, "-115 / -108",
    "odds range surfaces min/max across books");
});

test("PR #114: dedupe keeps distinct (line, side) tuples separate", () => {
  const rows = [
    bookRow({ book: "draftkings", line: 18.5, side: "Over"  }),
    bookRow({ book: "fanduel",    line: 18.5, side: "Over"  }),
    bookRow({ book: "draftkings", line: 19.5, side: "Over"  }),
    bookRow({ book: "fanduel",    line: 18.5, side: "Under" }),
  ];
  const out = dedupeSettledPicksByMarket(rows);
  // Three distinct tuples: (18.5 Over), (19.5 Over), (18.5 Under).
  assert.equal(out[0].groups.length, 3,
    "three distinct (line, side) tuples must produce three groups");
});

test("PR #114: dedupe survives book disagreement on projection by taking the median", () => {
  const rows = [
    bookRow({ book: "a", projection: 17.0 }),
    bookRow({ book: "b", projection: 19.0 }),
    bookRow({ book: "c", projection: 25.0 }), // outlier
  ];
  const g = dedupeSettledPicksByMarket(rows)[0].groups[0];
  assert.equal(g.projection, 19.0,
    "median projection — outlier book does not drag the headline");
});

test("PR #114: dedupe surfaces a single result + actual even if rows disagree", () => {
  // Should never happen in practice (all books grade against the
  // same box score), but the helper picks the mode.
  const rows = [
    bookRow({ book: "a", result: "win",  finalStat: 19 }),
    bookRow({ book: "b", result: "win",  finalStat: 19 }),
    bookRow({ book: "c", result: "loss", finalStat: 19 }),
  ];
  const g = dedupeSettledPicksByMarket(rows)[0].groups[0];
  assert.equal(g.result, "win", "mode result wins");
  assert.equal(g.actual, 19);
});

test("PR #114: dedupe keeps NBA market order PTS → REB → AST", () => {
  const rows = [
    bookRow({ book: "a", market: "AST", finalStat: 5 }),
    bookRow({ book: "a", market: "PTS", finalStat: 20 }),
    bookRow({ book: "a", market: "REB", finalStat: 8 }),
  ];
  const out = dedupeSettledPicksByMarket(rows);
  assert.deepEqual(out.map((m) => m.market), ["PTS", "REB", "AST"]);
});
