/**
 * TODAY, ACROSS SPORTS — the day claim behind "No games today".
 *
 * 2026-09-28: the homepage said "No games today" while Philadelphia @ Chicago kicked off at 8:15 PM
 * ET. The banner asked only MLB (0 — the day after the regular season) and whether top picks existed;
 * the product days already knew NFL was LIVE. These fixtures pin the semantics, independent of any
 * slate or clock: every date below is a fixture date, every artifact a temp file.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildSportToday, crossSportToday, sportTodayFrom } from "./product-day.ts";
import { computeSlateLiveness } from "../slate-liveness.ts";

const D = "2031-01-15"; // a fixture day, nowhere near a real slate
const S = (sport, eventsToday, forecastsToday = eventsToday, known = true) => ({ sport, today: D, eventsToday, forecastsToday, known });

test("🔴 CASE A — MLB 0, NFL 1, EPL 0, UFC 0: one event today, never 'No games today'", () => {
  const c = crossSportToday(D, [S("mlb", 0), S("epl", 0), S("ufc", 0), S("nfl", 1)]);
  assert.equal(c.eventsToday, 1);
  assert.equal(c.state, "EVENTS");
  assert.equal(c.headline, "1 event today");
  assert.deepEqual(c.sportsWithEvents, ["nfl"]);
  // …and the banner fed from it renders nothing (a live day), so "No games today" cannot appear.
  const v = computeSlateLiveness({ today: D, latestSlate: D, hasGamesToday: c.eventsToday > 0, todayEvidence: "known" });
  assert.equal(v.status, "live-today");
  assert.doesNotMatch(v.headline, /No games today/);
});

test("CASE B — all four sports at zero, every schedule known: the global empty state is allowed", () => {
  const c = crossSportToday(D, [S("mlb", 0), S("epl", 0), S("ufc", 0), S("nfl", 0)]);
  assert.equal(c.state, "NO_EVENTS");
  assert.equal(c.headline, "No games today");
  const v = computeSlateLiveness({ today: D, latestSlate: D, hasGamesToday: false, todayEvidence: "known" });
  assert.equal(v.status, "latest-available");
  assert.match(v.headline, /^No games today · /);
});

test("🔴 CASE C — an NFL event with no forecast still counts as a game today", () => {
  const nfl = sportTodayFrom("nfl", D, [{ id: "401", startUtc: `${D}T20:00:00Z`, status: "STATUS_SCHEDULED" }], [] /* no forecast */);
  assert.equal(nfl.eventsToday, 1, "a scheduled game is a game, with or without our forecast");
  assert.equal(nfl.forecastsToday, 0);
  const c = crossSportToday(D, [S("mlb", 0), S("epl", 0), S("ufc", 0), nfl]);
  assert.equal(c.state, "EVENTS");
  assert.equal(c.eventsToday, 1);
  assert.equal(c.forecastsToday, 0, "the missing forecast is visible as a count, never as an erased game");
});

test("CASE D — several sports with events aggregate, each counted once", () => {
  const nfl = sportTodayFrom("nfl", D,
    [{ id: "a", startUtc: `${D}T18:00:00Z` }, { id: "b", startUtc: `${D}T21:25:00Z` }],
    [{ id: "a", startUtc: `${D}T18:00:00Z` }]); // forecast for a scheduled game is the SAME event
  const c = crossSportToday(D, [S("mlb", 12, 12), S("epl", 3, 3), S("ufc", 0), nfl]);
  assert.equal(nfl.eventsToday, 2);
  assert.equal(nfl.forecastsToday, 1);
  assert.equal(c.eventsToday, 17);
  assert.equal(c.forecastsToday, 16);
  assert.deepEqual(c.sportsWithEvents, ["mlb", "epl", "nfl"]);
  assert.equal(c.headline, "17 events today");
});

test("CASE E — nothing found but a schedule is not loaded: UNKNOWN, and the banner will not call it a quiet day", () => {
  const c = crossSportToday(D, [S("mlb", 0, 0, false), S("epl", 0), S("ufc", 0), S("nfl", 0)]);
  assert.equal(c.state, "UNKNOWN");
  assert.notEqual(c.headline, "No games today");
  const v = computeSlateLiveness({ today: D, latestSlate: D, hasGamesToday: false, todayEvidence: "unknown" });
  assert.doesNotMatch(v.headline, /No games today/);
  assert.equal(v.status, "slate-pending");
});

test("a sport-scoped page says whose games: 'No MLB games today', never the unscoped global sentence", () => {
  const v = computeSlateLiveness({ today: D, latestSlate: D, hasGamesToday: false, scope: "MLB" });
  assert.match(v.headline, /^No MLB games today · /);
});

test("ET day anchoring: a 8:15 PM ET kickoff (00:15Z next UTC day) is TODAY; postponed and cancelled are not games", () => {
  const nfl = sportTodayFrom("nfl", "2031-09-29", [
    { id: "mnf", startUtc: "2031-09-30T00:15Z", status: "STATUS_SCHEDULED" },       // Mon 8:15 PM ET
    { id: "tue", startUtc: "2031-09-30T16:00Z", status: "STATUS_SCHEDULED" },       // Tue noon ET
    { id: "pp", startUtc: "2031-09-29T17:00Z", status: "STATUS_POSTPONED" },
    { id: "cx", startUtc: "2031-09-29T17:00Z", status: "STATUS_CANCELED" },
    { id: "bad", startUtc: "not a date" },
  ], []);
  assert.equal(nfl.eventsToday, 1);
});

test("the reader counts each sport from its schedule owner (temp data root, fixture day)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-today-"));
  const put = (rel, obj) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), JSON.stringify(obj)); };
  put("nfl/schedule/latest.json", { generatedAt: `${D}T12:00:00Z`, windowDays: 14, rows: [
    { providerEventId: "900", dateUtc: `${D}T20:00Z`, statusRaw: "STATUS_SCHEDULED" },
    { providerEventId: "901", dateUtc: "2031-01-16T20:00Z", statusRaw: "STATUS_SCHEDULED" },
  ] });
  put("nfl/index.json", { events: [] }); // CASE C at the reader: no forecast published
  put("soccer/epl/fixtures/capture-2030-31-2031-01-14T1200.json", { rows: [
    { eventId: "e1", kickoffIso: `${D}T15:00:00Z`, lifecycle: "SCHEDULED" },
    { eventId: "e2", kickoffIso: `${D}T17:30:00Z`, lifecycle: "POSTPONED" },
  ] });
  put(`mlb/schedule/${D}.json`, { games: [] });
  const days = [
    { sport: "mlb", productDate: D, state: "NO_EVENTS", events: 0, eligible: 0 },
    { sport: "ufc", productDate: "2031-01-18", state: "EVENT_UPCOMING", events: 12, eligible: 12 }, // Saturday's card is not today's
  ];
  const by = Object.fromEntries(buildSportToday(root, { today: D, days }).map((s) => [s.sport, s]));
  assert.deepEqual([by.nfl.eventsToday, by.nfl.forecastsToday, by.nfl.known], [1, 0, true]);
  assert.deepEqual([by.epl.eventsToday, by.epl.known], [1, true]);
  assert.deepEqual([by.mlb.eventsToday, by.mlb.known], [0, true]);
  assert.deepEqual([by.ufc.eventsToday, by.ufc.known], [0, true], "an upcoming card is not an event today");
  const c = crossSportToday(D, Object.values(by));
  assert.equal(c.eventsToday, 2);
  assert.equal(c.state, "EVENTS");

  // A capture taken BEFORE its window reaches today proves nothing about today.
  put("nfl/schedule/latest.json", { generatedAt: "2030-12-01T12:00:00Z", windowDays: 14, rows: [] });
  const stale = buildSportToday(root, { today: D, days }).find((s) => s.sport === "nfl");
  assert.equal(stale.known, false);
});
