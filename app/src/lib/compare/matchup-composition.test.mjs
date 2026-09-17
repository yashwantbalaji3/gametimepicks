/**
 * MATCHUP EXPLORER — forecast join, discovery and sitemap composition (v1.4 · §27–§28 §102 §119 · unit, build-time readers).
 *
 *  MF1  a matchup forecast link exists only for an exact-id forecast the owner publishes: NFL → the /nfl/game report
 *       rule; MLB → a detail whose prediction is not "unavailable" (the pause gate has already run). Listed NFL players
 *       each carry a PUBLISHED-family range in that exact report. Non-vacuous on both sides.
 *  MF2  the matchup CTA helper resolves only registry games (no dead CTA); unknown ids → null
 *  MF3  sitemap: compare shells (never a query URL, never the blocked EPL shell) + indexable matchups only
 *
 * Run: npx tsx --test src/lib/compare/matchup-composition.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { matchupEntries, matchupHref } from "./compare-store.ts";
import { matchupForecast } from "./matchup-forecast.ts";
import { detailByMatchId } from "../game-detail.ts";
import { nflPageIds } from "../my/read-model.ts";
import * as sitemapModule from "../../app/sitemap.ts";

const sitemap = typeof sitemapModule.default === "function" ? sitemapModule.default : sitemapModule.default.default;
const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const DATA = path.join(APP, "public/data");

test("MF1 forecast links only for exact-id forecasts the owner publishes; players only with PUBLISHED ranges", () => {
  const pages = nflPageIds();
  let nflWith = 0, nflWithout = 0, players = 0;
  for (const e of matchupEntries("NFL")) {
    const f = matchupForecast("NFL", e.gameId);
    assert.equal(!!f, pages.has(e.gameId), `NFL ${e.gameId}`);
    if (!f) { nflWithout += 1; continue; }
    nflWith += 1;
    assert.equal(f.href, `/nfl/game/${e.gameId}/`);
    const boardFile = path.join(DATA, `nfl/player-board/${e.gameId}.json`);
    const board = fs.existsSync(boardFile) ? JSON.parse(fs.readFileSync(boardFile, "utf8")) : null;
    const published = new Set(Object.entries(board?.families ?? {}).filter(([, fam]) => fam?.state === "PUBLISHED").map(([k]) => k));
    for (const p of f.players) {
      players += 1;
      const row = (board?.players ?? []).find((x) => x.playerId === p.id);
      assert.ok(row, `${p.id} is on the ${e.gameId} board`);
      assert.ok([...published].some((k) => typeof row.markets?.[k]?.median === "number"), `${p.id} has a PUBLISHED range in ${e.gameId}`);
    }
  }
  assert.ok(nflWith > 0 && nflWithout > 0, `non-vacuous NFL: ${nflWith} with, ${nflWithout} without`);
  let mlbWith = 0, mlbWithout = 0;
  for (const e of matchupEntries("MLB")) {
    const f = matchupForecast("MLB", e.gameId);
    const d = detailByMatchId("mlb", e.gameId);
    assert.equal(!!f, !!(d?.prediction && d.prediction.status !== "unavailable"), `MLB ${e.gameId}: link ⇔ an available prediction`);
    if (f) mlbWith += 1; else mlbWithout += 1;
  }
  assert.ok(mlbWith > 0 && mlbWithout > 0, `non-vacuous MLB: ${mlbWith} with, ${mlbWithout} without (players listed: ${players})`);
});

test("MF2 matchup CTAs resolve only registry games", () => {
  const e = matchupEntries("NFL")[0];
  assert.equal(matchupHref("NFL", e.gameId), `/matchups/nfl/${e.gameId}/`);
  assert.equal(matchupHref("NFL", "0"), null);
  assert.equal(matchupHref("MLB", e.gameId), null, "an NFL id is not an MLB game");
  assert.equal(matchupHref("NFL", null), null);
  assert.equal(matchupHref("NFL", Number(e.gameId)), `/matchups/nfl/${e.gameId}/`, "numeric id is the same exact id");
});

test("MF3 sitemap lists compare shells and indexable matchups only — never a query state", () => {
  const urls = sitemap().map((x) => x.url.replace(/^https:\/\/[^/]+/, ""));
  assert.ok(!urls.some((u) => u.includes("?")), "no query URL");
  assert.deepEqual(urls.filter((u) => u.startsWith("/compare/")).sort(), ["/compare/", "/compare/players/epl/", "/compare/players/mlb/", "/compare/players/nfl/", "/compare/teams/mlb/", "/compare/teams/nfl/"]);
  const listed = new Set(urls.filter((u) => u.startsWith("/matchups/")));
  const all = [...matchupEntries("NFL"), ...matchupEntries("MLB")];
  for (const m of all) assert.equal(listed.has(m.path), m.indexable, m.path);
  assert.equal(listed.size, all.filter((m) => m.indexable).length);
});
