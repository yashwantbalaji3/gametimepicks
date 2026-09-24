import test from "node:test";
import assert from "node:assert/strict";
import { feedTargets, openfootballSeason, judgeFeed, summarizeFeeds } from "./feed-health.mjs";

const T = Object.fromEntries(feedTargets({ etDate: "2026-09-11" }).map((t) => [t.id, t]));

test("openfootball season rolls over in August", () => {
  assert.equal(openfootballSeason("2026-09-11"), "2026-27");
  assert.equal(openfootballSeason("2026-07-31"), "2025-26");
  assert.equal(openfootballSeason("2027-01-15"), "2026-27");
  assert.match(T["openfootball-epl"].url, /football\.json\/master\/2026-27\/en\.1\.json$/);
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
});

test("openfootball feeds need a non-empty matches array", () => {
  assert.equal(judgeFeed(T["openfootball-ligue1"], { status: 200, body: '{"name":"Ligue 1","matches":[]}' }).ok, false);
  assert.equal(judgeFeed(T["openfootball-ligue1"], { status: 200, body: '{"matches":[{"team1":"A","team2":"B"}]}' }).ok, true);
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

/* ── B6 · the probe must request the shape the captures request ────────────────────────────────── */

test("B6 · every ESPN scoreboard probe uses the CAPTURE's request form, not the bare endpoint", async () => {
  /*
   * THE DEFECT THIS PINS. From 2026-09-15 to 2026-09-22 the EPL, NFL, UFC and NBA results captures
   * wrote nothing: ESPN began answering their `?dates=A-B` range form with 400. This watchdog stayed
   * GREEN the whole week, because it fetched the BARE scoreboard — a different request, which kept
   * answering 200. Measured again on 2026-09-23: bare 200 · range 400 · month 200.
   *
   * A watchdog that probes a request the system does not make cannot observe that system failing. So
   * the probe URL is built from `espn-scoreboard-window`, the same plan the captures use.
   */
  const { scoreboardMonthUrls } = await import("../sports/espn-scoreboard-window.mjs");
  const etDate = "2026-09-23";
  const targets = feedTargets({ etDate }).filter((t) => /scoreboard/.test(t.id));
  assert.ok(targets.length >= 3, `expected the ESPN scoreboard probes, got ${targets.length}`);

  const day = new Date(`${etDate}T12:00:00Z`);
  for (const t of targets) {
    const sportPath = t.url.split("/sports/")[1].split("/scoreboard")[0];
    const [expected] = scoreboardMonthUrls(sportPath, day, day);
    assert.equal(t.url, expected, `${t.id} must probe exactly what a capture would fetch for ${sportPath}`);
    // …and the load-bearing half: it must NOT be the bare form that lied for a week.
    assert.match(t.url, /\?dates=\d{6}&limit=1000$/, `${t.id} must carry the capture's month form`);
    assert.doesNotMatch(t.url, /scoreboard$/, `${t.id} must not probe the bare endpoint`);
  }
});

test("B6 · NEGATIVE CONTROL: the bare endpoint would NOT satisfy this guard", () => {
  /* Without this, the assertions above could be satisfied by a URL that merely looks plausible. The
     exact string that was in the file until 2026-09-23 must fail both halves. */
  const bare = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";
  assert.doesNotMatch(bare, /\?dates=\d{6}&limit=1000$/, "the old bare URL must not pass the form check");
  assert.match(bare, /scoreboard$/, "…and must be recognised as the bare endpoint");
});
