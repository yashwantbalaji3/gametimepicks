import test from "node:test";
import assert from "node:assert/strict";
import { feedTargets, footballDataSeason, judgeFeed, summarizeFeeds } from "./feed-health.mjs";

const T = Object.fromEntries(feedTargets({ etDate: "2026-09-11" }).map((t) => [t.id, t]));

test("football-data season rolls over in August", () => {
  assert.equal(footballDataSeason("2026-09-11"), "2627");
  assert.equal(footballDataSeason("2026-07-31"), "2526");
  assert.equal(footballDataSeason("2027-01-15"), "2627");
  assert.match(T["football-data-epl"].url, /mmz4281\/2627\/E0\.csv$/);
});

test("every feed is covered once, and statsapi is asked for the ET date", () => {
  assert.equal(new Set(Object.keys(T)).size, feedTargets({ etDate: "2026-09-11" }).length);
  for (const s of ["mlb", "nfl", "ufc", "soccer", "weather"]) assert.ok(Object.values(T).some((t) => t.sport === s), s);
  assert.match(T["mlb-statsapi-schedule"].url, /date=2026-09-11$/);
});

test("a 200 with the wrong shape is a failure, not a pass", () => {
  assert.equal(judgeFeed(T["espn-nfl-injuries"], { status: 200, body: '{"injuries":[]}' }).ok, false, "empty injuries feed");
  assert.equal(judgeFeed(T["espn-nfl-injuries"], { status: 200, body: "<html>" }).detail, "not JSON");
  assert.equal(judgeFeed(T["espn-nfl-injuries"], { status: 200, body: '{"injuries":[{"id":1}]}' }).ok, true);
});

test("CSV feeds check their header and row count", () => {
  const nfl = T["nflverse-games"];
  assert.match(judgeFeed(nfl, { status: 200, body: "game_id,gameday\n1,2" }).detail, /header missing gametime, roof/);
  const rows = ["game_id,season,gameday,gametime,roof", ...Array.from({ length: 1200 }, (_, i) => `${i},2026,2026-09-10,20:20,dome`)].join("\n");
  assert.equal(judgeFeed(nfl, { status: 200, body: rows }).ok, true);
  assert.equal(judgeFeed(T["football-data-epl"], { status: 200, body: "﻿Div,Date,HomeTeam,AwayTeam,FTR\nE0,1,A,B,H" }).ok, true, "BOM tolerated");
});

test("HTTP and network failures carry their cause", () => {
  assert.equal(judgeFeed(T["nws-points"], { status: 503, body: "" }).detail, "HTTP 503");
  assert.match(judgeFeed(T["nws-points"], { error: "timeout" }).detail, /timeout/);
});

test("summary: one down is DEGRADED, all down is DOWN, none is UNKNOWN", () => {
  assert.equal(summarizeFeeds([{ id: "a", ok: true }, { id: "b", ok: false }]).state, "DEGRADED");
  assert.equal(summarizeFeeds([{ id: "a", ok: false }]).state, "DOWN");
  assert.equal(summarizeFeeds([]).state, "UNKNOWN");
  assert.equal(summarizeFeeds([{ id: "a", ok: true }]).state, "OK");
});
