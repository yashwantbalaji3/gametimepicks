/* Settled MLB game pages — the rule (audit 2026-10-28 F02). Pure: synthetic rows + the committed graded record. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { mlbSettledGames, outcomeWord } = await import("./settled-games.ts");

const row = (o) => ({
  schemaVersion: 1, gamePk: 1, date: "2026-10-27", matchup: "MIL @ TB", firstPitchUtc: "2026-10-28T00:00:00Z",
  forecastGeneratedAt: "2026-10-27T20:50:04.000Z", forecastSource: "snapshot:x", actual: { homeRuns: 4, awayRuns: 3, winner: "home" },
  market: "moneyline", pick: "MIL (away)", line: null, modelProbability: 0.649, outcome: "LOSS", gradedAt: "2026-10-28T09:00:00Z", ...o,
});
const W = { sinceDate: "2026-09-28", today: "2026-10-28" };

test("one settled game per gamePk, with the record's final and every graded call, in market order", () => {
  const g = mlbSettledGames([row({ market: "total", pick: "UNDER 7", line: 7, modelProbability: 0.486, outcome: "PUSH" }), row({})], W);
  assert.equal(g.length, 1);
  assert.equal(g[0].slug, "mil-vs-tb-2026-10-27");
  assert.deepEqual(g[0].final, { away: 3, home: 4 });
  assert.deepEqual(g[0].calls.map((c) => [c.market, c.pick, c.modelProbability, c.outcome]), [["moneyline", "MIL (away)", 0.649, "LOSS"], ["total", "UNDER 7", 0.486, "PUSH"]]);
});

test("window: today's and future games get no settled page; games before the window neither", () => {
  assert.equal(mlbSettledGames([row({ date: "2026-10-28" })], W).length, 0, "today is the live report's day");
  assert.equal(mlbSettledGames([row({ date: "2026-09-27" })], W).length, 0, "older links keep the tombstone");
  assert.equal(mlbSettledGames([row({ date: "2026-09-28" })], W).length, 1);
});

test("never guesses: a forecast frozen at/after first pitch, or rows that disagree, get no page", () => {
  assert.equal(mlbSettledGames([row({ forecastGeneratedAt: "2026-10-28T00:00:00Z" })], W).length, 0, "not a pregame forecast");
  assert.equal(mlbSettledGames([row({}), row({ market: "total", actual: { homeRuns: 5, awayRuns: 3 } })], W).length, 0, "two finals for one game");
  assert.equal(mlbSettledGames([row({ matchup: "Milwaukee @ Tampa" })], W).length, 0, "unparseable matchup");
});

test("a doubleheader's twins get the live page's gamePk-suffixed slugs (same rule as lib/mlb/public-game-slug)", () => {
  const g = mlbSettledGames([row({ gamePk: 11, firstPitchUtc: "2026-10-27T17:00:00Z", forecastGeneratedAt: "2026-10-27T15:00:00Z" }), row({ gamePk: 12 })], W);
  assert.deepEqual(g.map((x) => x.slug), ["mil-vs-tb-2026-10-27-11", "mil-vs-tb-2026-10-27-12"]);
});

test("outcome words; an unknown code is shown as itself, never a guessed word", () => {
  assert.equal(outcomeWord("WIN"), "Right");
  assert.equal(outcomeWord("LOSS"), "Wrong");
  assert.equal(outcomeWord("ODD"), "ODD");
});

test("committed record: the audit's broken link (MIL @ TB, Oct 27) resolves to a settled game with the recorded final", () => {
  const file = path.join(process.cwd(), "public/data/mlb/results/game-predictions-graded.jsonl");
  const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const g = mlbSettledGames(rows, W).find((x) => x.slug === "mil-vs-tb-2026-10-27");
  assert.ok(g, "mil-vs-tb-2026-10-27 is a settled game");
  assert.deepEqual(g.final, { away: 3, home: 4 });
  assert.ok(g.calls.length >= 3 && g.calls.every((c) => Date.parse(g.frozenAt) < Date.parse(g.firstPitchUtc)));
});
