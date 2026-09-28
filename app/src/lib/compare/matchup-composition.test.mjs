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
import { matchupForecast, mlbForecastLink } from "./matchup-forecast.ts";
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
  /* Non-vacuity, WITHOUT depending on the day's data state. The old assertion demanded that some live
     NFL matchup lack a forecast; on a Tuesday after every listed game has a published report that is
     simply false (2026-09-22: 33 with, 0 without) and the guard went red on a correct state. The
     exclusion path is proved by probe instead: an id the owner never published gets no link. */
  assert.ok(nflWith > 0, `non-vacuous NFL (with): ${nflWith} with, ${nflWithout} without`);
  assert.equal(matchupForecast("NFL", "nfl-000000000"), null, "an id the owner never published gets no forecast link (exclusion path exercised by probe)");
  let mlbWith = 0, mlbWithout = 0;
  for (const e of matchupEntries("MLB")) {
    const f = matchupForecast("MLB", e.gameId);
    const d = detailByMatchId("mlb", e.gameId);
    assert.equal(!!f, !!(d?.prediction && d.prediction.status !== "unavailable"), `MLB ${e.gameId}: link ⇔ an available prediction`);
    if (f) mlbWith += 1; else mlbWithout += 1;
  }
  /*
   * The SAME defect the NFL half above was already fixed for, in the opposite direction.
   *
   * This demanded that some MLB matchup HAVE a forecast link and some LACK one. Late on 2026-09-27
   * every listed matchup had an unavailable prediction — 0 with, 156 without — which is a correct
   * state for the hour, and the guard went red on it. A test that requires the day's data to be
   * mixed will eventually meet a day that is not.
   *
   * The contract is the biconditional asserted inside the loop — a link EXACTLY when an available
   * prediction exists — and that is what must be proved non-vacuous: the loop has to have evaluated
   * it over a real set, and the exclusion path is proved by probe rather than by hoping the day
   * supplies one. An all-unavailable slate announces itself instead of failing.
   */
  assert.ok(mlbWith + mlbWithout > 0, "the MLB biconditional must be evaluated over a non-empty set");
  assert.equal(matchupForecast("MLB", "mlb-000000000"), null, "an id the owner never published gets no forecast link");
  /*
   * BOTH directions proved on the pure decision itself, so neither depends on what the slate
   * happens to hold. `mlbForecastLink` is exported for exactly this — its own docstring says the
   * committed slate may hold no unavailable prediction to test with.
   */
  assert.equal(mlbForecastLink({ prediction: { status: "unavailable" } }, "/mlb/game/x/"), null, "an unavailable prediction gets no link");
  assert.equal(mlbForecastLink({ prediction: null }, "/mlb/game/x/"), null, "no prediction, no link");
  assert.equal(mlbForecastLink({ prediction: { status: "ready" } }, null), null, "no page, no link");
  const included = mlbForecastLink({ prediction: { status: "ready" } }, "/mlb/game/x");
  assert.ok(included, "an available prediction with a page DOES get a link — the inclusion path");
  assert.equal(included.href, "/mlb/game/x/", "and the href is normalised with a trailing slash");
  if (mlbWith === 0) {
    console.log(`[MF1] every MLB matchup is currently unavailable (${mlbWithout} listed, players listed: ${players}) — a legitimate state, announced so it is not silent`);
  }
  // The paused/unavailable branch, which the committed slate may not exercise: never a link.
  assert.equal(mlbForecastLink({ prediction: { status: "unavailable" } }, "/games/mlb/x"), null);
  assert.equal(mlbForecastLink({ prediction: null }, "/games/mlb/x"), null);
  assert.equal(mlbForecastLink({ prediction: { status: "available" } }, null), null, "no exported report → no link");
  assert.deepEqual(mlbForecastLink({ prediction: { status: "available" } }, "/games/mlb/x"), { href: "/games/mlb/x/", label: "Open the MLB game report", players: [] });
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
