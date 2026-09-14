import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOpenfootball, finalScore, clubKey, localToUtcIso, seasonOfDate } from "./openfootball.mjs";

test("every score shape seen upstream: {ft}, a bare array, an empty object, and none", () => {
  assert.deepEqual(finalScore({ score: { ht: [0, 1], ft: [2, 1] } }), [2, 1]);
  assert.deepEqual(finalScore({ score: [0, 0] }), [0, 0], "2025-26 files write a bare array");
  assert.equal(finalScore({ score: {} }), null, "an abandoned match has no result");
  assert.equal(finalScore({}), null, "a future fixture has no result");
  assert.equal(finalScore({ score: { ft: [1] } }), null);
});

test("local kickoff to UTC through the league's zone, summer and winter; a blank time is 15:00 local", () => {
  assert.equal(localToUtcIso("2023-08-11", "20:00", "Europe/London"), "2023-08-11T19:00:00.000Z", "BST");
  assert.equal(localToUtcIso("2023-12-26", "15:00", "Europe/London"), "2023-12-26T15:00:00.000Z", "GMT");
  assert.equal(localToUtcIso("2026-09-06", "20:45", "Europe/Paris"), "2026-09-06T18:45:00.000Z", "CEST");
  assert.equal(localToUtcIso("2026-01-10", "", "Europe/Paris"), "2026-01-10T14:00:00.000Z", "blank time → 15:00 CET");
  assert.equal(localToUtcIso("10/01/2026", "15:00", "Europe/Paris"), null);
});

test("club keys join one club's season-to-season spellings and keep different clubs apart", () => {
  assert.equal(clubKey("Aston Villa"), clubKey("Aston Villa FC"));
  assert.equal(clubKey("Manchester City"), clubKey("Manchester City FC"));
  assert.equal(clubKey("Brighton & Hove Albion FC"), clubKey("Brighton and Hove Albion"));
  assert.equal(clubKey("1. FC Köln"), "koln");
  assert.notEqual(clubKey("Paris FC"), clubKey("Paris Saint-Germain FC"));
  assert.notEqual(clubKey("Real Madrid CF"), clubKey("Club Atlético de Madrid"));
  assert.notEqual(clubKey("Manchester United FC"), clubKey("Manchester City FC"));
});

test("a season file parses to sorted result rows with no market, skipping matches without a result", () => {
  const { rows, skipped } = parseOpenfootball({ matches: [
    { date: "2026-09-06", time: "17:00", team1: "Arsenal FC", team2: "Chelsea FC", score: { ft: [2, 1] } },
    { date: "2026-08-15", time: "15:00", team1: "Leeds United FC", team2: "Everton FC", score: [1, 1] },
    { date: "2026-09-20", time: "15:00", team1: "Fulham FC", team2: "Hull City AFC" },
  ] }, { season: "2026-27", timeZone: "Europe/London" });
  assert.equal(rows.length, 2);
  assert.deepEqual(skipped, { noScore: 1, badDate: 0 });
  assert.equal(rows[0].homeSource, "Leeds United FC");
  assert.equal(rows[0].result, "D");
  assert.equal(rows[1].result, "H");
  assert.equal(rows[1].market, null, "openfootball carries no prices");
});

test("season labels roll over in July", () => {
  assert.equal(seasonOfDate("2026-09-06"), "2026-27");
  assert.equal(seasonOfDate("2027-05-20"), "2026-27");
  assert.equal(seasonOfDate("2026-06-30"), "2025-26");
});
