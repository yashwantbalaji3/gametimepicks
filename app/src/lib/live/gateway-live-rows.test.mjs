/**
 * Session 5 — the /live hub's live facts come from the gateway (gateway-live-rows.mjs).
 * Reproduces 2026-10-01 PIT @ CLE: producer record 404, gateway LIVE with player stats, every featured
 * row read "Live tracking temporarily unavailable".
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { GATEWAY_FAMILIES, mergeGatewayLiveRows, rowFeedFor } from "./gateway-live-rows.mjs";
import { FEED, GAME_PHASE, statusFor, trackForecast } from "./featured-forecasts.mjs";

const EV = "401872964";
const gateway = (stats, fetchedAt = "2026-10-02T00:28:53.317Z") => ({ fetchedAt, event: { providerEventId: EV, fetchedAt, state: "LIVE", playerStats: stats } });
const stat = (id, market, value) => ({ playerId: `nfl-athlete-${id}`, providerPlayerId: String(id), market, value });

test("Session 5 · producer 404 + gateway LIVE ⇒ gateway facts keyed by the producer's own predictionId", () => {
  const { artifact, gatewayIds, gatewayRead } = mergeGatewayLiveRows({ providerEventId: EV, artifact: null, envelope: gateway([stat(4569987, "player_rush_yds", 5), stat(4047650, "player_receptions", 2)]) });
  assert.equal(gatewayRead, true);
  const r = artifact.rows.find((x) => x.predictionId === `${EV}:nfl-athlete-4569987:player_rush_yds`);
  assert.equal(r.live.statValue, 5);
  assert.equal(r.live.observedAt, "2026-10-02T00:28:53.317Z");
  assert.equal(r.settlement, undefined, "the gateway never writes a settlement");
  assert.equal(gatewayIds.size, 2);
});

test("Session 5 · a producer row keeps its frozen block and settlement; a newer producer value is not overwritten", () => {
  const producer = { observedAt: "2026-10-02T00:30:45Z", rows: [
    { predictionId: `${EV}:nfl-athlete-1:player_rush_yds`, frozen: { median: 42.1 }, settlement: { state: "OPEN" }, live: { statValue: 9, observedAt: "2026-10-02T00:30:45Z" } },
    { predictionId: `${EV}:nfl-athlete-2:player_receptions`, frozen: { median: 4 }, live: { statValue: 1, observedAt: "2026-10-02T00:20:00Z" } },
    { predictionId: `${EV}:nfl-athlete-3:anytime_td`, frozen: { probability: 0.29 }, live: { statValue: 0, observedAt: "2026-10-02T00:20:00Z" } },
  ] };
  const { artifact } = mergeGatewayLiveRows({ providerEventId: EV, artifact: producer, envelope: gateway([stat(1, "player_rush_yds", 5), stat(2, "player_receptions", 3)], "2026-10-02T00:25:00Z") });
  const by = new Map(artifact.rows.map((r) => [r.predictionId, r]));
  assert.equal(by.get(`${EV}:nfl-athlete-1:player_rush_yds`).live.statValue, 9, "the newer producer observation stands");
  assert.deepEqual(by.get(`${EV}:nfl-athlete-1:player_rush_yds`).frozen, { median: 42.1 });
  assert.equal(by.get(`${EV}:nfl-athlete-2:player_receptions`).live.statValue, 3, "the newer gateway fact wins");
  assert.deepEqual(by.get(`${EV}:nfl-athlete-2:player_receptions`).frozen, { median: 4 }, "the frozen pregame forecast is untouched");
  assert.equal(by.get(`${EV}:nfl-athlete-3:anytime_td`).live.statValue, 0, "a family the gateway does not carry is exactly as the producer wrote it");
  assert.equal(artifact.observedAt, "2026-10-02T00:30:45Z");
});

test("Session 5 · identity is never minted: a non-numeric id, another event or a blank value is dropped", () => {
  const { artifact } = mergeGatewayLiveRows({ providerEventId: EV, artifact: null, envelope: gateway([{ playerId: "Jaylen Warren", market: "player_rush_yds", value: 5 }, stat(7, "player_rush_yds", null), stat(8, "player_pass_yds", 120), stat(9, "anytime_td", 1)]) });
  assert.deepEqual(artifact.rows, [], "a name is not an identity, blank is not zero, and families outside the gateway's are ignored");
  const other = mergeGatewayLiveRows({ providerEventId: EV, artifact: null, envelope: { event: { providerEventId: "999", playerStats: [stat(1, "player_rush_yds", 5)] } } });
  assert.equal(other.artifact, null);
  assert.equal(other.gatewayRead, false);
  assert.ok(!GATEWAY_FAMILIES.includes("player_pass_yds"), "passing is an ESTIMATE/STOP family — no live value is ever placed beside it");
});

test("Session 5 · per-row feed: a gateway family is measured, anytime TD is unavailable without the producer", () => {
  const base = { feed: "OK", producerFeed: "UNAVAILABLE", gatewayRead: true };
  assert.equal(rowFeedFor({ ...base, family: "player_reception_yds" }), "OK");
  assert.equal(rowFeedFor({ ...base, family: "anytime_td" }), "UNAVAILABLE");
  assert.equal(rowFeedFor({ ...base, family: "anytime_td", producerFeed: "OK" }), "OK");
  assert.equal(rowFeedFor({ feed: "UNAVAILABLE", producerFeed: "UNAVAILABLE", gatewayRead: false, family: "player_rush_yds" }), "UNAVAILABLE");
  assert.equal(rowFeedFor({ feed: "OK", family: "anytime_td" }), "OK", "a caller without the split keeps the card-level feed");
});

test("Session 5 · end to end: the PIT @ CLE featured rows stop saying unavailable", () => {
  const forecast = { predictionId: `${EV}:nfl-athlete-4569987:player_rush_yds`, playerId: "nfl-athlete-4569987", family: "player_rush_yds", kind: "RANGE", modelValue: 58.6, modelLow: 15, modelHigh: 151, line: null, frozenAt: "2026-10-01T22:30:25Z" };
  const { artifact, gatewayRead } = mergeGatewayLiveRows({ providerEventId: EV, artifact: null, envelope: gateway([stat(4569987, "player_rush_yds", 5)]) });
  const liveRow = artifact.rows.find((r) => r.predictionId === forecast.predictionId);
  const t = trackForecast(forecast, { gamePhase: GAME_PHASE.LIVE, liveRow, feed: rowFeedFor({ family: forecast.family, feed: FEED.OK, producerFeed: "UNAVAILABLE", gatewayRead }), observedAt: artifact.observedAt, nowMs: Date.parse("2026-10-02T00:29:10Z") });
  assert.equal(t.liveValue, 5);
  assert.doesNotMatch(t.status, /unavailable/i);
  /* The unmeasured receiver on the same card: awaiting, never unavailable and never a zero. */
  const quiet = trackForecast({ ...forecast, predictionId: `${EV}:nfl-athlete-1:player_reception_yds`, family: "player_reception_yds" }, { gamePhase: GAME_PHASE.LIVE, liveRow: null, feed: FEED.OK, observedAt: artifact.observedAt, nowMs: Date.parse("2026-10-02T00:29:10Z") });
  assert.equal(quiet.liveValue, null);
  assert.equal(statusFor({ rail: quiet.rail, binary: false, gamePhase: GAME_PHASE.LIVE, feed: FEED.OK, value: null, line: null, stale: false, hasRow: false }), quiet.status);
  assert.doesNotMatch(quiet.status, /unavailable/i);
});

import fs from "node:fs";
test("Session 5 · WIRED: the page's one refresh owner merges the gateway, and the card feeds each row by family", () => {
  const hook = fs.readFileSync("src/components/live/use-live-props.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const hub = fs.readFileSync("src/components/live/nfl-live-hub.tsx", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.match(hook, /mergeGatewayLiveRows\(\{\s*providerEventId:\s*id,\s*artifact:\s*producer,\s*envelope:\s*gateway\s*\}\)/, "the hook must merge the gateway into the producer record");
  assert.match(hook, /liveUrl\(\{\s*sport:\s*"nfl",\s*event:\s*id,\s*players:\s*true\s*\}\)/, "the gateway call is the per-event players request useLiveEvent makes");
  assert.match(hub, /feed:\s*rowFeed\(f\.family\)/, "each featured row gets the feed its family is entitled to");
});
