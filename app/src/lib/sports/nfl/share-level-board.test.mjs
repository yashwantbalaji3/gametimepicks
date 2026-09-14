/**
 * P300 — share-level projections on the public player board: receipt-read gates, ESPN identity mapping,
 * fail-to-v1 on any mismatch, and the roster gate that stale candidates require.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { shareLevelAdoptedMarkets, shareLevelRowsForEvent, shareLevelBasis, seasonOfKickoff } from "./share-level-board.mjs";

const APP = process.cwd();
const ROOT = path.join(APP, "..");
const COLUMNS = ["gameId", "kickoffUtc", "team", "opponent", "playerId", "name", "position", "market", "share", "mean", "p10", "p50", "p90", "line", "pOverLine", "shareVol", "lastSeason", "p25", "p75", "espnId"];
const row = (o) => COLUMNS.map((c) => o[c] ?? null);
const forecast = (rows, week = 2) => ({ week, columns: COLUMNS, rows: rows.map(row) });
const q = { mean: 50, p10: 10, p25: 30, p50: 45, p75: 65, p90: 95 };
const secondLook = { verdicts: { player_receptions: { teamFormVolume: "SECOND_LOOK_ELIGIBLE" }, player_rush_yds: { teamFormVolume: "SECOND_LOOK_ELIGIBLE" }, player_pass_yds: { teamFormVolume: "SECOND_LOOK_REJECTED" } }, results: { player_rush_yds: { teamFormVolume: { overall: { n: 14502 } } } } };

test("adopted markets are read from the second-look verdicts; a forward breach demotes", () => {
  assert.deepEqual([...shareLevelAdoptedMarkets({ secondLook, forwardReceipt: null })].sort(), ["player_receptions", "player_rush_yds"]);
  const breached = { families: { player_rush_yds: { state: "FORWARD_BREACHED", n: 400 }, player_receptions: { state: "FORWARD_HOLDING", n: 900 } } };
  assert.deepEqual([...shareLevelAdoptedMarkets({ secondLook, forwardReceipt: breached })], ["player_receptions"]);
  assert.equal(shareLevelAdoptedMarkets({ secondLook: null, forwardReceipt: null }).size, 0, "no receipt, no adoption");
});

test("LIVE · the committed receipts adopt receptions, receiving yards and rushing yards — never passing yards", () => {
  const p = path.join(ROOT, "data/internal/research/nfl/reports/player-props-share-level-second-look.json");
  if (!fs.existsSync(p)) return;
  const adopted = shareLevelAdoptedMarkets({ secondLook: JSON.parse(fs.readFileSync(p, "utf8")), forwardReceipt: null });
  assert.deepEqual([...adopted].sort(), ["player_reception_yds", "player_receptions", "player_rush_yds"]);
});

test("rows map ESPN abbreviations (WSH/LAR) to nflverse and key players by ESPN id", () => {
  const fc = forecast([
    { gameId: "2026_02_WAS_LA", team: "LA", opponent: "WAS", market: "player_rush_yds", espnId: "111", name: "A Back", ...q },
    { gameId: "2026_02_WAS_LA", team: "WAS", opponent: "LA", market: "player_receptions", espnId: "222", name: "B Wide", ...q },
    { gameId: "2026_02_WAS_LA", team: "WAS", opponent: "LA", market: "player_rush_yds", espnId: "222", name: "B Wide", ...q },
    { gameId: "2026_02_WAS_LA", team: "WAS", opponent: "LA", market: "player_rush_yds", espnId: null, name: "No Id", ...q },
    { gameId: "2026_02_WAS_LA", team: "WAS", opponent: "LA", market: "player_pass_yds", espnId: "333", name: "C Arm", ...q },
    { gameId: "2026_02_DET_BUF", team: "BUF", opponent: "DET", market: "player_rush_yds", espnId: "444", name: "Other Game", ...q },
  ]);
  const out = shareLevelRowsForEvent({ forecast: fc, matchup: "WSH @ LAR", week: 2, seasonType: 2, markets: new Set(["player_receptions", "player_rush_yds"]) });
  assert.equal(out.gameId, "2026_02_WAS_LA");
  assert.equal(out.withoutEspnId, 1, "a row with no ESPN id is counted, never guessed");
  const byId = Object.fromEntries(out.players.map((p) => [p.playerId, p]));
  assert.equal(byId["nfl-athlete-111"].team, "LAR");
  assert.equal(byId["nfl-athlete-222"].team, "WSH");
  assert.deepEqual(Object.keys(byId["nfl-athlete-222"].markets).sort(), ["player_receptions", "player_rush_yds"]);
  assert.equal(byId["nfl-athlete-333"], undefined, "a market the receipts did not adopt is not published from the forecast");
  assert.equal(byId["nfl-athlete-444"], undefined, "another game's rows never join this event");
  assert.deepEqual(byId["nfl-athlete-111"].markets.player_rush_yds, { mean: 50, p10: 10, p25: 30, median: 45, p75: 65, p90: 95 });
});

test("any mismatch falls back to v1 (null): wrong week, preseason, missing column, no game", () => {
  const fc = forecast([{ gameId: "2026_02_DET_BUF", team: "BUF", opponent: "DET", market: "player_rush_yds", espnId: "1", name: "x", ...q }]);
  const m = new Set(["player_rush_yds"]);
  assert.ok(shareLevelRowsForEvent({ forecast: fc, matchup: "DET @ BUF", week: 2, seasonType: 2, markets: m }));
  assert.equal(shareLevelRowsForEvent({ forecast: fc, matchup: "DET @ BUF", week: 3, seasonType: 2, markets: m }), null);
  assert.equal(shareLevelRowsForEvent({ forecast: fc, matchup: "DET @ BUF", week: 2, seasonType: 1, markets: m }), null);
  assert.equal(shareLevelRowsForEvent({ forecast: fc, matchup: "KC @ DEN", week: 2, seasonType: 2, markets: m }), null);
  assert.equal(shareLevelRowsForEvent({ forecast: { ...fc, columns: COLUMNS.filter((c) => c !== "p25") }, matchup: "DET @ BUF", week: 2, seasonType: 2, markets: m }), null);
  assert.equal(shareLevelRowsForEvent({ forecast: null, matchup: "DET @ BUF", week: 2, seasonType: 2, markets: m }), null);
});

test("season of a kickoff: January belongs to the previous season", () => {
  assert.equal(seasonOfKickoff("2026-09-18T00:15:00Z"), 2026);
  assert.equal(seasonOfKickoff("2027-01-10T18:00:00Z"), 2026);
});

test("basis states the evidence tier and carries no internal payload", () => {
  const b = shareLevelBasis({ market: "player_rush_yds", secondLook, forwardReceipt: { families: { player_rush_yds: { state: "ACCUMULATING", n: 57 } } } });
  assert.match(b, /second look/);
  assert.match(b, /not a blind test/);
  assert.match(b, /accumulating \(57 graded/);
  assert.match(b, /14,502/);
  for (const banned of ["data/internal", "PRIVATE_RESEARCH", "P300"]) assert.ok(!b.includes(banned), banned);
});

test("SOURCE PIN · the board keeps a share-level row only for a player on the team's current roster (fail-closed)", () => {
  const src = fs.readFileSync(path.join(APP, "scripts/nfl/build-nfl-player-board.mjs"), "utf8");
  assert.match(src, /for \(const row of shareLevel\?\.players \?\? \[\]\) \{\n\s+const roster = rosterByTeam\.get\(row\.team\);\n\s+if \(!roster \|\| !roster\.has\(row\.playerId\)\)/, "no roster, or not on it → no share-level row");
  assert.match(src, /if \(gate\(row\.playerId, row\.name, row\.team\)\) continue;/, "the injury gate applies to share-level rows");
  assert.match(src, /shareLevel\?\.markets\.has\(m\)/, "a share-level market replaces the v1 number, never duplicates it");
});
