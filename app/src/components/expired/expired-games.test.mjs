/**
 * Expired game links (founder P1 2026-10-26; release owner: no archive of past simulation pages). An expired NBA Game
 * Simulation, MLB game report or UFC bout URL lands on the tombstone plus the game's recorded final, how the published
 * forecast did, and the results link — from committed public records only, never a guessed score; every other 404 is
 * unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { EXPIRED_GAMES_MAX_DAYS, RESULTS_LINK, expiredGameFor, mlbExpiredIndex, nbaExpiredFacts, ufcExpiredIndex } from "./expired-games.mjs";

const APP = process.cwd();

test("MLB: one entry per <away>-vs-<home>-<date> slug with the final and every graded pick; a shared slug is dropped, old rows excluded", () => {
  const row = (pk, date, m, market, pick, p, outcome) => ({ gamePk: pk, date, matchup: m, actual: { awayRuns: 4, homeRuns: 5 }, market, pick, modelProbability: p, outcome });
  const idx = mlbExpiredIndex([
    row(1, "2026-10-24", "TB @ MIL", "moneyline", "MIL (home)", 0.502, "WIN"),
    row(1, "2026-10-24", "TB @ MIL", "total", "OVER 6.5", 0.646, "WIN"),
    row(2, "2026-10-20", "NYY @ BOS", "moneyline", "BOS (home)", 0.6, "LOSS"),
    row(3, "2026-10-20", "NYY @ BOS", "moneyline", "NYY (away)", 0.55, "WIN"), // doubleheader: same slug, two games
    row(4, "2026-08-01", "SEA @ HOU", "moneyline", "HOU (home)", 0.5, "WIN"),
  ], { sinceDate: "2026-09-26" });
  assert.deepEqual(Object.keys(idx), ["tb-vs-mil-2026-10-24"]);
  assert.deepEqual(idx["tb-vs-mil-2026-10-24"], ["2026-10-24", "TB @ MIL", 4, 5, [["moneyline", "MIL (home)", 0.502, "WIN"], ["total", "OVER 6.5", 0.646, "WIN"]]]);
});

test("UFC: joined by the ESPN bout id and BOTH fighter names on the card date (UTC or ET); no graded row → no forecast claim", () => {
  const rows = [
    { providerBoutId: "401897388", cardName: "Card A", eventDateUtc: "2026-10-18T02:00Z", red: { name: "Mike Malott" }, blue: { name: "Joaquin Buckley" }, redWinner: true, blueWinner: false },
    { providerBoutId: "401897389", cardName: "Card A", eventDateUtc: "2026-10-17T22:00Z", red: { name: "A One" }, blue: { name: "B Two" }, redWinner: false, blueWinner: false },
  ];
  const picks = [{ eventId: "2026-10-17:joaquin buckley|mike malott", market: "Fight winner", predicted: "Mike Malott", modelProbability: 0.5335, hit: true }];
  const idx = ufcExpiredIndex(rows, picks, { sinceDate: "2026-09-20" });
  assert.deepEqual(idx["401897388"], ["2026-10-18", "Card A", "Mike Malott", "Joaquin Buckley", "Mike Malott", "Mike Malott", 0.5335, true], "a late card joins on its ET date");
  assert.deepEqual(idx["401897389"], ["2026-10-17", "Card A", "A One", "B Two", null, null, null, null], "no winner recorded, no graded pick: nothing invented");
});

test("NBA facts: the recorded final and the frozen Elo side, only for games the existing map names and the finals record holds", () => {
  const facts = nbaExpiredFacts({ "401909095": ["2026-10-23", "NY @ BOS"], "401909999": ["2026-10-23", "A @ B"] },
    [{ providerEventId: "401909095", ftAway: 103, ftHome: 107, winnerSide: "home", statusRaw: "STATUS_FINAL" }],
    [{ date: "2026-10-23", games: [{ providerEventId: "401909095", away: { abbr: "NY" }, home: { abbr: "BOS" }, elo: { state: "FAVOURED", favoured: "NY" } }] }]);
  assert.deepEqual(facts, { "401909095": [103, 107, "home", "away"] });
});

test("paths: MLB report and UFC bout URLs only; every other missing path keeps the plain 404", () => {
  const idx = { mlb: { "tb-vs-mil-2026-10-24": ["2026-10-24", "TB @ MIL", 4, 5, []] }, ufc: { "401897388": ["2026-10-17", "Card", "R", "B", "R", "R", 0.5, true] } };
  assert.equal(expiredGameFor("/games/mlb/tb-vs-mil-2026-10-24/", idx).kind, "KNOWN");
  assert.deepEqual(expiredGameFor("/games/mlb/nyy-vs-bos-2026-10-01/", idx), { sport: "mlb", kind: "UNKNOWN", key: "nyy-vs-bos-2026-10-01", resultsHref: RESULTS_LINK.mlb });
  assert.equal(expiredGameFor("/ufc/bout/401897388", idx).winner, "R");
  assert.equal(expiredGameFor("/ufc/bout/401000000/", idx).kind, "UNKNOWN");
  for (const p of ["/", "/mlb/", "/games/mlb/", "/games/mlb/not-a-slug/", "/ufc/bout/", "/ufc/bout/abc/", "/nba/simulation/401909095/", "/games/nba/x-vs-y-2026-10-24/", "/epl/match/x/"]) {
    assert.equal(expiredGameFor(p, idx), null, p);
  }
});

test("REAL DATA: the committed records resolve real expired links; the index stays small", async () => {
  const { expiredGamesIndex } = await import("./expired-games-index.ts");
  const idx = expiredGamesIndex("2026-10-26");
  const g = expiredGameFor("/games/mlb/tb-vs-mil-2026-10-24/", idx);
  assert.equal(g?.kind, "KNOWN");
  assert.deepEqual([g.awayRuns, g.homeRuns], [4, 5], "the 2026-10-24 World Series final as graded");
  assert.ok(Object.keys(idx.ufc).length > 0 && Object.values(idx.ufc).some((b) => b[5] != null), "some recent bout carries a graded pick");
  assert.ok(JSON.stringify(idx).length < 40_000, `index bytes ${JSON.stringify(idx).length} (${EXPIRED_GAMES_MAX_DAYS}-day window)`);
});

test("SOURCE PIN · the 404 page renders both notices from committed public records, and nothing private", () => {
  const src = fs.readFileSync(path.join(APP, "src/app/not-found.tsx"), "utf8");
  assert.match(src, /<ExpiredSimulationNotice map=\{expired\} facts=\{nbaFacts\} \/>/);
  assert.match(src, /<ExpiredGameNotice index=\{expiredGames\} \/>/);
  for (const f of ["src/components/expired/expired-games.mjs", "src/components/expired/expired-games-index.ts", "src/components/expired/expired-game-notice.tsx"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(APP, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, ""), /data\/internal|simulation-theater|possession/, f);
  }
});
