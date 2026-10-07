import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildTodaysGames, rowPhase, ROW_PHASE, etDayOf, liveCandidates, TODAY_GROUPS } from "./todays-games.mjs";

const MON = "2026-10-05";
const at = (iso) => Date.parse(iso);
const row = (over) => ({ eventId: "x", startUtc: "2026-10-05T17:00Z", providerStatus: null, hasForecast: true, liveFeed: false, href: "/x/", ...over });

test("MNF at 00:15Z Tuesday is Monday's game", () => {
  assert.equal(etDayOf("2026-10-06T00:15Z"), MON);
  const day = buildTodaysGames({
    today: MON, nowMs: at("2026-10-05T16:00Z"),
    sports: [{ sport: "nfl", known: true, rows: [row({ eventId: "nfl:401872979", startUtc: "2026-10-06T00:15Z" }), row({ eventId: "nfl:tue", startUtc: "2026-10-07T00:15Z" })] }],
  });
  assert.deepEqual(day.rows.map((r) => r.eventId), ["nfl:401872979"]);
});

test("⚠ nothing here ever says Live: a started game is 'Started', and only a gateway sport is a live candidate", () => {
  const now = at("2026-10-05T18:00Z");
  const day = buildTodaysGames({
    today: MON, nowMs: now,
    sports: [
      { sport: "nfl", known: true, rows: [row({ eventId: "nfl:1", liveFeed: true, providerStatus: "STATUS_SCHEDULED" })] },
      { sport: "nba", known: true, rows: [row({ eventId: "nba:1", hasForecast: false })] },
    ],
  });
  for (const r of day.rows) {
    assert.equal(r.phase, ROW_PHASE.STARTED, "a stale 'SCHEDULED' capture is never read as not started");
    assert.doesNotMatch(r.statusText, /\bLive\b|LIVE|in play/, "only the gateway envelope may say Live");
  }
  assert.equal(day.rows.find((r) => r.sport === "nba").statusText, "Started 1:00 PM ET · no live scores here");
  assert.deepEqual(liveCandidates(day).map((r) => r.eventId), ["nfl:1"]);
});

test("terminal facts come from the capture; a long-started game with no final is 'result not in yet', never Final", () => {
  const now = at("2026-10-06T06:00Z");
  assert.equal(rowPhase(row({ providerStatus: "STATUS_FINAL" }), now), ROW_PHASE.FINAL);
  assert.equal(rowPhase(row({ providerStatus: "Final" }), now), ROW_PHASE.FINAL);
  assert.equal(rowPhase(row({ providerStatus: "STATUS_POSTPONED" }), now), ROW_PHASE.POSTPONED);
  assert.equal(rowPhase(row({ providerStatus: "Cancelled" }), now), ROW_PHASE.CANCELLED);
  assert.equal(rowPhase(row({ providerStatus: "STATUS_SCHEDULED" }), now), ROW_PHASE.RESULT_NOT_IN);
  assert.equal(rowPhase(row({ startUtc: null }), now), ROW_PHASE.UNKNOWN);
});

test("Final wording: no forecast → plain Final; forecast → grading pending until settled", () => {
  const now = at("2026-10-06T06:00Z");
  const day = buildTodaysGames({
    today: MON, nowMs: now,
    sports: [{ sport: "nfl", known: true, rows: [
      row({ eventId: "a", providerStatus: "STATUS_FINAL" }),
      row({ eventId: "b", providerStatus: "STATUS_FINAL", settled: true }),
      row({ eventId: "c", providerStatus: "STATUS_FINAL", hasForecast: false }),
    ] }],
  });
  const words = Object.fromEntries(day.rows.map((r) => [r.eventId, r.statusText]));
  assert.deepEqual(words, { a: "Final · grading pending", b: "Final · graded", c: "Final" });
});

test("postponed games are listed but not counted; groups come in page order", () => {
  const day = buildTodaysGames({
    today: MON, nowMs: at("2026-10-05T18:00Z"),
    sports: [{ sport: "mlb", known: true, rows: [
      row({ eventId: "p", providerStatus: "Postponed" }),
      row({ eventId: "u", startUtc: "2026-10-05T23:00Z" }),
      row({ eventId: "s" }),
      row({ eventId: "f", startUtc: "2026-10-05T04:30Z", providerStatus: "Final" }),
    ] }],
  });
  assert.equal(day.eventsToday, 3);
  assert.equal(day.bySport[0].notPlayed, 1);
  assert.deepEqual(day.groups.map((g) => g.key), ["STARTED", "UPCOMING", "FINISHED", "NOT_PLAYED"]);
  assert.deepEqual(day.rows.map((r) => r.eventId), ["s", "u", "f", "p"]);
  assert.deepEqual([...TODAY_GROUPS], ["STARTED", "UPCOMING", "FINISHED", "NOT_PLAYED"]);
});

test("'No games today' needs every required schedule known; a forecast-only league cannot prove a quiet day", () => {
  const base = { today: MON, nowMs: at("2026-10-05T12:00Z") };
  const quiet = buildTodaysGames({ ...base, sports: [{ sport: "nfl", known: true, rows: [] }, { sport: "ligue-1", known: false, required: false, rows: [] }] });
  assert.equal(quiet.state, "NO_EVENTS");
  assert.deepEqual(quiet.unproven, ["ligue-1"], "disclosed, not hidden");
  const unknown = buildTodaysGames({ ...base, sports: [{ sport: "nfl", known: true, rows: [] }, { sport: "nba", known: false, rows: [] }] });
  assert.equal(unknown.state, "UNKNOWN");
  const nbaOnly = buildTodaysGames({ ...base, sports: [{ sport: "mlb", known: true, rows: [] }, { sport: "nba", known: true, rows: [row({ eventId: "nba:1", startUtc: "2026-10-05T23:30Z", hasForecast: false })] }] });
  assert.equal(nbaOnly.state, "EVENTS", "an NBA-only day is not 'no games today'");
  assert.equal(nbaOnly.headline, "1 game today");
});

test("duplicate ids are listed once", () => {
  const day = buildTodaysGames({ today: MON, nowMs: at("2026-10-05T12:00Z"), sports: [{ sport: "epl", known: true, rows: [row({ eventId: "d" }), row({ eventId: "d" })] }] });
  assert.equal(day.rows.length, 1);
});

/* ── Real committed data: the list must agree with the existing day count. Agreement, never a pinned
      total, so the test cannot drift as captures land. ── */
test("on committed data, NFL / MLB / EPL / UFC counts equal product-day's buildSportToday", async () => {
  const { loadTodaysGames } = await import("./todays-games-source.ts");
  const { buildSportToday } = await import("../product-day/product-day.ts");
  const dataRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "public", "data");
  const days = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
  let compared = 0;
  for (const today of days) {
    const mine = loadTodaysGames(dataRoot, { today, nowMs: Date.parse(`${today}T12:00:00Z`) });
    const theirs = buildSportToday(dataRoot, { today });
    for (const t of theirs) {
      if (t.sport === "mlb") continue; // product-day takes max(official, odds-era, board); the list reads the official schedule only
      const m = mine.bySport.find((s) => s.sport === t.sport);
      /* UFC: product-day counts BOUTS; the list shows ONE row per card and carries the bout count on it. */
      const listed = t.sport === "ufc"
        ? mine.rows.filter((r) => r.sport === "ufc").reduce((n, r) => n + (r.boutCount ?? 0), 0)
        : m?.eventsToday ?? 0;
      assert.equal(listed, t.eventsToday, `${t.sport} ${today}`);
      compared += 1;
    }
    const official = mine.bySport.find((s) => s.sport === "mlb");
    const pd = theirs.find((s) => s.sport === "mlb");
    assert.ok((official?.eventsToday ?? 0) <= pd.eventsToday, `MLB ${today}: the list never shows more games than the day count`);
  }
  assert.ok(compared >= 18, "anti-vacuity");
});
