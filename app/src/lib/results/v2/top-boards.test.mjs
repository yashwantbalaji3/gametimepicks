/**
 * Results V2 · B-4b — the frozen board, read back: shown as frozen, overlaid only with the settlement owner's
 * word, pending never a miss, recent form from earlier regular-season games the player PLAYED, with its true
 * denominator, and the day's own game never leaking into its own "recent form".
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

globalThis.React = React;
const REPO_APP = process.cwd();
const { topBoardsFor, topBoardDates, sportsWithoutBoards } = await import("./top-boards.ts");
const { default: TopBoards } = await import("../../../components/results/top-boards.tsx");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gtp-top-boards-read-"));
const w = (rel, obj) => { const p = path.join(tmp, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj)); };
const row = (rank, name, eventId, extra = {}) => ({ rank, forecastId: `${eventId}:${name}:f`, playerId: `nfl-athlete-${name}`, name, teamId: null, team: "AAA", opponent: "BBB", providerEventId: eventId, kickoffUtc: "2031-10-05T17:00Z", line: null, pricingState: "NOT_PROBED", projection: { median: 80, p10: 30, p90: 130 }, ...extra });
w("public/data/results/top-boards/2031-10-05.json", {
  schemaVersion: 1, date: "2031-10-05", publishedAt: "2031-10-05T12:00:00Z", firstKickoffUtc: "2031-10-05T17:00Z",
  boards: [
    { sport: "nfl", propFamily: "player_rush_yds", label: "Rushing yards", metric: "median", model: "m", rows: [
      row(1, "A", "900", { line: 70.5, pricingState: undefined, market: { line: 70.5 } }), row(2, "B", "900"), row(3, "C", "901"), row(4, "D", "900"),
    ] },
    { sport: "nfl", propFamily: "anytime_td", label: "Anytime touchdown", metric: "probability", model: "m", rows: [row(1, "E", "900", { projection: { probability: 0.612 } })] },
  ],
  ineligible: [{ sport: "nfl", propFamily: "player_pass_yds", label: "Passing yards", state: "ESTIMATE", reason: "bar" }],
});
const game = (id, kickoffUtc, players, touchdowns = []) => ({ providerEventId: id, kickoffUtc, state: "FINAL", players, touchdowns });
const rp = (name, actual, outcome) => ({ name, team: "AAA", prop: "player_rush_yds", actual, outcome });
w("public/data/nfl/reconciliation/2-05.json", { games: [game("900", "2031-10-05T17:00Z", [rp("A", 88, "HIT"), rp("B", 0, "VOID")], [{ name: "E", team: "AAA", outcome: "SCORED" }])] });
w("public/data/nfl/reconciliation/2-04.json", { games: [
  game("800", "2031-09-28T17:00Z", [rp("A", 60, "HIT")], [{ name: "E", team: "AAA", outcome: "DID_NOT_SCORE" }]),
  game("700", "2031-09-21T17:00Z", [rp("A", 95, "MISS")], [{ name: "E", team: "AAA", outcome: "SCORED" }]),
  game("600", "2031-09-14T17:00Z", [rp("A", 0, "VOID")], [{ name: "E", team: "AAA", outcome: "VOID" }]),
  game("500", "2031-09-07T17:00Z", [rp("A", 40, "HIT")]),
  game("400", "2031-09-01T17:00Z", [rp("A", 10, "HIT")]),
] });
w("public/data/nfl/reconciliation/1-02.json", { games: [game("300", "2031-08-20T17:00Z", [rp("A", 200, "HIT"), rp("C", 150, "HIT")])] });

process.chdir(tmp);
const day = topBoardsFor("2031-10-05");
const html = renderToStaticMarkup(React.createElement(TopBoards, { day, without: sportsWithoutBoards(), dayLabel: "Sunday, October 5, 2031" }));
const empty = renderToStaticMarkup(React.createElement(TopBoards, { day: topBoardsFor("2031-10-06"), without: sportsWithoutBoards(), dayLabel: "Monday, October 6, 2031" }));
process.chdir(REPO_APP);
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const rush = () => day.boards.find((b) => b.propFamily === "player_rush_yds").rows;

test("🔴 the board is read back exactly as frozen — order, projection, line — never re-ranked", () => {
  assert.deepEqual(rush().map((r) => [r.rank, r.name]), [[1, "A"], [2, "B"], [3, "C"], [4, "D"]]);
  assert.equal(rush()[0].line, 70.5);
  assert.equal(day.publishedAt, "2031-10-05T12:00:00Z");
});

test("🔴 results are the owner's word; pending and ungraded are never misses", () => {
  const [a, b, c, d] = rush();
  assert.deepEqual(a.result, { state: "INSIDE", actual: 88 });
  assert.equal(b.result.state, "VOID", "did not play → void");
  assert.equal(c.result.state, "PENDING", "game not final");
  assert.equal(d.result.state, "NOT_GRADED", "final game, no graded row → said, never a loss");
  assert.equal(day.boards.find((x) => x.propFamily === "anytime_td").rows[0].result.state, "SCORED");
});

test("🔴 recent form: earlier REGULAR-SEASON games he PLAYED, newest first, at most three, true denominator — never the day's own game", () => {
  const a = rush()[0];
  assert.deepEqual(a.form, { values: [60, 95, 40], played: 3, aboveLine: 1 }, "VOID 09-14 skipped, preseason 200 and the day's own 88 excluded");
  const e = day.boards.find((x) => x.propFamily === "anytime_td").rows[0];
  assert.deepEqual(e.form, { scored: 1, played: 2 }, "a VOID game is not a game played");
  assert.equal(rush()[2].form, null, "only a PRESEASON game on our boards → null (regular season only), never 0-of-0");
});

test("render: frozen stamp, the owner's words, recent form labelled as the player's history, the no-board sports stated", () => {
  assert.match(html, /Published Sun, Oct 5, 8:00 AM ET/);
  assert.match(html, /Inside the range · 88/);
  assert.match(html, /Not final yet/);
  assert.match(html, /Not in the graded record/);
  assert.match(html, /Last 3 games on our boards: 60 · 95 · 40 yds — above 70\.5 in 1 of 3/);
  assert.match(html, /Scored in 1 of his last 2 games on our boards/);
  assert.match(html, /61\.2% to score/);
  assert.match(html, /no book line captured/);
  assert.match(html, /Passing yards \(estimate only\)/);
  assert.match(html, /MLB:<\/strong> no qualifying board/);
  assert.match(html, /href="\/nfl\/game\/900\/"/);
  assert.doesNotMatch(html, /GameTimePicks went|our record/i, "a player's form is never presented as the site's record");
});

test("a day with no frozen board says so; board dates list only real day files", () => {
  assert.match(empty, /No qualifying board was frozen for Monday, October 6, 2031/);
  process.chdir(tmp);
  try { assert.deepEqual(topBoardDates(), ["2031-10-05"]); } finally { process.chdir(REPO_APP); }
});

test("source guard: the read side never ranks or grades", () => {
  const s = fs.readFileSync(path.join(REPO_APP, "src/lib/results/v2/top-boards.ts"), "utf8");
  assert.doesNotMatch(s, /rankFamily|\.sort\(\(a, b\) => b\.(value|median|probability)/, "no re-ranking");
  assert.doesNotMatch(s, /actual >=|actual >|>= r\.low|<= r\.high/, "no re-grading against the range");
});
