/**
 * TRUTH-001 — every simulated batter row says where its rates came from.
 *
 * Run: npx tsx --test src/lib/mlb/full-game/rate-source.test.mjs
 *
 * On a confirmed batting order, a batter with no GTP projection keeps his real name and slot but is
 * simulated at replacement-level rates. His box-score row looked exactly like a projected one; only a
 * game-level note in the Methodology tab gave the count (2026-10-07 TB @ NYY 849838: 3 TB, 2 NYY rows).
 * New artifacts now carry `rateSource` per row; published artifacts are never rewritten.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { gameInputsFromBoard } from "./board-adapter.ts";
import { simulateFullGame } from "./simulate.ts";

const GAME = {
  gamePk: 7001, date: "2026-10-10", venue: "Park", gameDate: "2026-10-10T23:00:00Z",
  awayTeamAbbr: "AAA", homeTeamAbbr: "BBB", awayTeamName: "A", homeTeamName: "B",
  awayProbablePitcherId: 1, awayProbablePitcherName: "Ace A", homeProbablePitcherId: 2, homeProbablePitcherName: "Ace B",
};
const hitLean = (playerId, team, projection) => ({
  gamePk: 7001, playerId, playerName: `P${playerId}`, playerTeamAbbr: team, playerRole: "batter", marketKey: "batter_hits", projection,
});
const confirmedNine = (base) => ({
  capturedAt: "2026-10-10T20:00:00Z", minutesToFirstPitch: 180,
  batters: Array.from({ length: 9 }, (_, i) => ({ playerId: base + i, name: `Real ${base + i}`, position: "OF", battingOrderSlot: i + 1 })),
});

// AAA: confirmed order, 7 of 9 projected (slots 3 and 8 have no projection).
// BBB: no confirmed order, 6 projected hitters → 3 fillers.
const board = {
  date: "2026-10-10",
  games: [GAME],
  leans: [
    ...[100, 101, 103, 104, 105, 106, 108].map((id) => hitLean(id, "AAA", 0.95)),
    ...[200, 201, 202, 203, 204, 205].map((id) => hitLean(id, "BBB", 0.9)),
  ],
};
const confirmed = new Map([[7001, { away: confirmedNine(100), home: null }]]);
const opts = { runCount: 400, modelVersion: "t", simulationVersion: 1, generatedAt: "2026-10-10T20:05:00Z" };

test("inputs: a confirmed batter with no projection is himself, at replacement rates, and says so", () => {
  const [input] = gameInputsFromBoard(board, undefined, confirmed);
  const sources = input.awayLineup.map((b) => [b.playerId, b.name, b.rateSource]);
  assert.deepEqual(sources[2], [102, "Real 102", "replacement"]);
  assert.deepEqual(sources[7], [107, "Real 107", "replacement"]);
  assert.equal(input.awayLineup.filter((b) => b.rateSource === "projection").length, 7);
  assert.equal(input.completeness.awayRatedCount, 7);
  // prop-derived side: fillers are replacement, rated hitters are projection.
  assert.equal(input.homeLineup.filter((b) => b.playerId < 0).every((b) => b.rateSource === "replacement"), true);
  assert.equal(input.homeLineup.filter((b) => b.rateSource === "projection").length, 6);
});

test("artifact: every batter row carries rateSource and it matches the game's own counts", () => {
  const [input] = gameInputsFromBoard(board, undefined, confirmed);
  const g = simulateFullGame(input, opts);
  const rows = g.players.batters;
  assert.equal(rows.length, 18);
  assert.ok(rows.every((r) => r.rateSource === "projection" || r.rateSource === "replacement"));
  const away = rows.filter((r) => r.team === "AAA");
  assert.deepEqual(away.filter((r) => r.rateSource === "replacement").map((r) => r.name), ["Real 102", "Real 107"]);
  assert.equal(away.filter((r) => r.rateSource === "replacement").length, 9 - g.completeness.awayRatedCount);
  const home = rows.filter((r) => r.team === "BBB");
  assert.equal(home.filter((r) => r.rateSource === "replacement").length, 9 - g.completeness.homeRatedCount);
});

test("the note names the true gap: no GTP projection, not necessarily no posted line", () => {
  const [input] = gameInputsFromBoard(board, undefined, confirmed);
  const note = input.completeness.notes.find((n) => n.startsWith("AAA confirmed batting order used"));
  assert.match(note, /2 of 9 have no GTP projection \(no posted prop line, or too little data\)/);
  assert.doesNotMatch(note, /have no posted prop line and/);
});
