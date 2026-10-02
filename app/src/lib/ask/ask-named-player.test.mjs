/**
 * Session 5 · A5 — a player-named forecast question reaches that player's canonical row.
 * Production (after #875): "What is Michael Pittman Jr.'s projection?" answered "no projection is listed" while
 * the PIT @ CLE game page printed 2 rec · 18 yds. The projection carried the top 6 rows per game; he ranked 7th.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { makeExecutor } from "./executor.mjs";
import { makeAskLoader, fixtureFetchText } from "./loader.mjs";
import { buildEvidence } from "./evidence.mjs";
import { ASK_ERROR } from "./contract.mjs";
import { GENERIC_PLAYER_ROWS } from "./tools/forecast.mjs";

const NOW = () => new Date("2031-10-02T00:00:00Z"); // ET 2031-10-01
const row = (i, extra = {}) => ({ playerId: `nfl-athlete-${100 + i}`, name: `Player ${i}`, team: "PIT", markets: [{ key: "player_receptions", label: "Receptions", median: i, p10: 0, p90: i + 3 }], anytimeTd: null, ...extra });
const players = [...Array.from({ length: 6 }, (_, i) => row(i)), row(7, { playerId: "nfl-athlete-4035687", name: "Michael Pittman Jr.", markets: [{ key: "player_receptions", label: "Receptions", median: 2, p10: 0, p90: 5 }, { key: "player_reception_yds", label: "Receiving yards", median: 18, p10: 2, p90: 49 }] })];
const forecasts = { schemaVersion: 1, forecasts: [
  { forecastId: "nfl-401872964", sport: "NFL", gameId: "401872964", matchup: "PIT @ CLE", startUtc: "2031-10-02T00:15Z", away: "PIT", home: "CLE", experimental: true, players, links: [{ id: "report", label: "Open the NFL game report", href: "/nfl/game/401872964/" }] },
  { forecastId: "nfl-401872965", sport: "NFL", gameId: "401872965", matchup: "ARI @ NYG", startUtc: "2031-10-05T17:00Z", away: "ARI", home: "NYG", experimental: true, players: [row(1, { team: "ARI" })], links: [{ id: "report", label: "Open the NFL game report", href: "/nfl/game/401872965/" }] },
] };
const entities = { schemaVersion: 1, entries: [{ id: "nfl-athlete-4035687", kind: "player", sport: "NFL", label: "Michael Pittman Jr.", hint: "PIT" }, { id: "nfl-athlete-999", kind: "player", sport: "NFL", label: "Nobody Projected", hint: "PIT" }] };
const executor = () => makeExecutor({ turn: makeAskLoader(fixtureFetchText({ "/data/ask/v1/forecasts.json": forecasts, "/data/ask/v1/entities.json": entities })).beginTurn(), now: NOW });

test("A5 · a generic game question stays compact: the top rows only", async () => {
  const r = await executor().run({ id: "c1", name: "getPublishedForecasts", arguments: { gameId: "401872964" } });
  assert.equal(r.data.forecasts[0].players.length, GENERIC_PLAYER_ROWS);
  assert.ok(!r.data.forecasts[0].players.some((p) => p.name === "Michael Pittman Jr."), "the 7th row is outside a generic answer's budget");
});

test("A5 · a player-named question carries that player's canonical row, beyond the budget, and no other game", async () => {
  const ex = executor();
  const r = await ex.run({ id: "c1", name: "getPublishedForecasts", arguments: { playerId: "nfl-athlete-4035687" } });
  assert.equal(r.status, "OK");
  assert.equal(r.data.forecasts.length, 1);
  assert.equal(r.data.forecasts[0].matchup, "PIT @ CLE");
  assert.deepEqual(r.data.forecasts[0].players.map((p) => p.name), ["Michael Pittman Jr."]);
  const ev = buildEvidence(ex.evidence).facts.map((f) => f.text).join("\n");
  assert.match(ev, /Michael Pittman Jr\. Receptions: GameTime's simulated median is 2, with a 10th–90th percentile range of 0 to 5/);
  assert.match(ev, /Michael Pittman Jr\. Receiving yards: GameTime's simulated median is 18/);
});

test("A5 · a player with no published row is answered honestly — never a row invented from the team forecast", async () => {
  const r = await executor().run({ id: "c1", name: "getPublishedForecasts", arguments: { playerId: "nfl-athlete-999" } });
  assert.equal(r.status, "UNSUPPORTED");
  assert.equal(r.error ?? r.data?.error, ASK_ERROR.NOT_PUBLISHED);
});

test("A5 · LIVE: the built projection carries every published board row, not a top-6 cut", () => {
  const p = "../data/ask-projection/v1/forecasts.json"; // built daily, not committed
  if (!fs.existsSync(p)) return console.log("no built ask projection — run ask:build");
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  const most = Math.max(0, ...doc.forecasts.filter((f) => f.sport === "NFL").map((f) => f.players?.length ?? 0));
  console.log(`A5 live: largest NFL game carries ${most} player rows`);
  if (doc.forecasts.some((f) => f.sport === "NFL" && f.players?.length)) assert.ok(most > GENERIC_PLAYER_ROWS, "the projection must not truncate at the evidence budget");
  const pit = doc.forecasts.find((f) => f.gameId === "401872964");
  if (pit) assert.ok(pit.players.some((p) => p.playerId === "nfl-athlete-4035687"), "PIT @ CLE: Pittman Jr.'s published row reaches the projection");
});

test("A5 · WIRED: the planner routes a named player's projection through playerId", () => {
  const src = fs.readFileSync("src/lib/ask/planner.mjs", "utf8");
  assert.match(src, /names a PLAYER: resolveEntity for the player.*getPublishedForecasts with that playerId/);
});
