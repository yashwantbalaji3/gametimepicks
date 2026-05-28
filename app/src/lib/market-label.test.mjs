/**
 * Tests for the human market-label resolver. Pure mapping; guards
 * against regressions when the pipeline adds new market keys.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSideLine, humanMarketLabel } from "./market-label.ts";

test("humanMarketLabel: NBA stat keys", () => {
  assert.equal(humanMarketLabel("nba", "pts"), "PTS");
  assert.equal(humanMarketLabel("nba", "reb"), "REB");
  assert.equal(humanMarketLabel("nba", "ast"), "AST");
  assert.equal(humanMarketLabel("nba", "player_points"), "PTS");
  assert.equal(humanMarketLabel("nba", "player_points_alternate"), "PTS");
  assert.equal(humanMarketLabel("nba", "player_rebounds_alternate"), "REB");
  assert.equal(humanMarketLabel("nba", "player_assists_alternate"), "AST");
});

test("humanMarketLabel: MLB stat keys", () => {
  assert.equal(humanMarketLabel("mlb", "batter_hits"), "Hits");
  assert.equal(humanMarketLabel("mlb", "batter_total_bases"), "Total Bases");
  assert.equal(humanMarketLabel("mlb", "batter_hits_runs_rbis"), "H+R+RBI");
  assert.equal(humanMarketLabel("mlb", "pitcher_strikeouts"), "Pitcher Ks");
  assert.equal(humanMarketLabel("mlb", "batter_hits_alternate"), "Hits");
});

test("humanMarketLabel: pipeline-provided marketLabel wins", () => {
  // When the snapshot already has an explicit human label, honor it
  // (the pipeline may know context the resolver doesn't).
  assert.equal(
    humanMarketLabel("mlb", "batter_hits", "Singles Only"),
    "Singles Only",
  );
});

test("humanMarketLabel: marketLabel == raw market is treated as no override", () => {
  assert.equal(humanMarketLabel("mlb", "batter_hits", "batter_hits"), "Hits");
});

test("humanMarketLabel: empty market falls back to 'Stat'", () => {
  assert.equal(humanMarketLabel("nba", ""), "Stat");
  assert.equal(humanMarketLabel("nba", null), "Stat");
  assert.equal(humanMarketLabel(null, null), "Stat");
});

test("humanMarketLabel: unknown market echoes the raw key", () => {
  assert.equal(
    humanMarketLabel("nba", "some_new_market_key"),
    "some_new_market_key",
  );
});

test("humanMarketLabel: sport-less leg still resolves common keys", () => {
  // Legacy snapshots may store "pts" or "batter_hits" without a sport
  // disambiguator — cross-sport fallback covers them.
  assert.equal(humanMarketLabel(null, "pts"), "PTS");
  assert.equal(humanMarketLabel("", "batter_hits"), "Hits");
});

test("humanMarketLabel: case-insensitive on sport + market", () => {
  assert.equal(humanMarketLabel("NBA", "PTS"), "PTS");
  assert.equal(humanMarketLabel("Mlb", "Batter_Hits"), "Hits");
});

test("formatSideLine: Over 1.5 / Under 6.5", () => {
  assert.equal(formatSideLine("Over", 1.5), "Over 1.5");
  assert.equal(formatSideLine("under", 6.5), "Under 6.5");
  assert.equal(formatSideLine("OVER", 0.5), "Over 0.5");
});

test("formatSideLine: missing line → side only", () => {
  assert.equal(formatSideLine("Over", null), "Over");
  assert.equal(formatSideLine("Under", undefined), "Under");
});

test("formatSideLine: missing both → '—'", () => {
  assert.equal(formatSideLine(null, null), "—");
  assert.equal(formatSideLine("", null), "—");
});

test("formatSideLine: non-finite line treated as missing", () => {
  assert.equal(formatSideLine("Over", Number.NaN), "Over");
  assert.equal(formatSideLine("Over", Number.POSITIVE_INFINITY), "Over");
});
