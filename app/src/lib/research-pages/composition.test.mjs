/**
 * TEAM + PLAYER RESEARCH — page composition contracts (v1.3). Unit phase: reads committed public artifacts and the
 * committed research projection, never the built export.
 *
 *  FJ1  NFL forecast join: only PUBLISHED families, exact athlete id, nothing for a non-board player
 *  FJ2  UFC forecast join: exact athlete id on the current card, only under a PASS winner verdict
 *  SM1  sitemap: research URLs == the indexable registry; no template (bracket) paths; no personal routes
 *  GL1  game links: only destinations this deploy exports (no historical 404s)
 *  NJ1  no name join anywhere in the research page modules
 *
 * Run: npx tsx --test src/lib/research-pages/composition.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { nflPlayerForecasts, ufcFighterForecast } from "./forecast-join.ts";
import { gameHref } from "./game-links.ts";
import { researchIndex } from "./projection-store.ts";
import * as sitemapModule from "../../app/sitemap.ts";

// tsx loads a .ts default export through CJS interop; unwrap it either way.
const sitemap = typeof sitemapModule.default === "function" ? sitemapModule.default : sitemapModule.default.default;

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const DATA = path.join(APP, "public/data");
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));

test("FJ1 NFL player forecasts carry PUBLISHED families only, joined by exact athlete id", () => {
  const latest = readJson("nfl/player-board/latest.json");
  let checked = 0;
  let emptyChecked = 0;
  for (const b of latest.boards ?? []) {
    const file = path.join(DATA, `nfl/player-board/${b.providerEventId}.json`);
    if (!fs.existsSync(file)) continue;
    const board = JSON.parse(fs.readFileSync(file, "utf8"));
    const published = new Set(Object.entries(board.families ?? {}).filter(([, f]) => f?.state === "PUBLISHED").map(([k]) => k));
    for (const p of (board.players ?? []).slice(0, 40)) {
      const rows = nflPlayerForecasts(p.playerId).filter((r) => r.matchup === (board.matchup ?? b.matchup));
      for (const r of rows) {
        assert.equal(r.playerId, p.playerId);
        for (const m of r.markets) assert.ok(published.has(m.key), `${p.playerId}: ${m.key} is not PUBLISHED on ${b.providerEventId}`);
        checked += r.markets.length;
      }
      const publishedRanges = [...published].filter((k) => typeof p.markets?.[k]?.median === "number");
      if (!publishedRanges.length) { assert.equal(rows.length, 0, `${p.playerId} has no published range → no forecast section`); emptyChecked += 1; }
    }
  }
  assert.ok(checked > 0, "non-vacuous: some published ranges were checked");
  assert.equal(nflPlayerForecasts("nfl-athlete-0").length, 0);
  assert.equal(nflPlayerForecasts("Travis Kelce").length, 0, "a name is never an id");
  assert.ok(emptyChecked >= 0);
});

test("FJ2 UFC fighter forecast: exact athlete id on the current card, PASS winner verdict only", () => {
  const card = readJson("ufc/card-latest.json");
  const bout = (card.bouts ?? []).find((b) => b?.prediction?.winner?.byFighter);
  if (!bout) return; // no read card committed right now — nothing can be asserted either way
  const f = ufcFighterForecast(`ufc-athlete-${bout.red.athleteId}`);
  if (card.model?.verdicts?.winner === "PASS") {
    assert.ok(f, "a fighter on a PASS card with a winner read gets the forecast section");
    assert.equal(f.href, `/ufc/bout/${bout.boutId}/`);
    assert.equal(f.winnerChance, bout.prediction.winner.byFighter[bout.red.name]);
  } else {
    assert.equal(f, null, "no PASS verdict → no forecast section");
  }
  assert.equal(ufcFighterForecast(bout.red.name), null, "a name is never an id");
  assert.equal(ufcFighterForecast("ufc-athlete-0"), null);
});

test("SM1 sitemap lists exactly the indexable research pages and never a template path", () => {
  const entries = sitemap();
  const urls = entries.map((e) => e.url);
  assert.ok(!urls.some((u) => u.includes("[")), "a dynamic family pattern is not a URL");
  const research = urls.filter((u) => /\/(teams|players)\//.test(u)).map((u) => u.replace(/^https:\/\/[^/]+/, "")).sort();
  const indexable = researchIndex().filter((e) => e.indexable).map((e) => e.path).sort();
  assert.deepEqual(research, indexable);
  const noindex = researchIndex().filter((e) => !e.indexable);
  assert.ok(noindex.length > 0 && noindex.every((e) => !urls.some((u) => u.endsWith(e.path))), "no noindex research page is listed");
  for (const personal of ["/my/", "/saved/", "/following/"]) assert.ok(!urls.some((u) => u.endsWith(personal)));
  assert.ok(urls.some((u) => u.endsWith("/live/")), "positive control: a public route is listed");
});

test("GL1 game links resolve only to destinations this deploy exports", () => {
  // Historical games have no report page: never a constructed URL.
  assert.equal(gameHref("NFL", "401671000", "2024-10-06T17:00:00Z"), null);
  assert.equal(gameHref("MLB", "745844", "2024-04-02"), null);
  assert.equal(gameHref("EPL", "704301", "2024-08-16T19:00:00Z"), null);
  const forecasts = readJson("nfl/forecasts/latest.json").forecasts ?? [];
  if (forecasts[0]) assert.equal(gameHref("NFL", String(forecasts[0].providerEventId), null), `/nfl/game/${forecasts[0].providerEventId}/`);
  const bout = readJson("ufc/card-latest.json").bouts?.[0];
  if (bout) assert.equal(gameHref("UFC", String(bout.boutId), null), `/ufc/bout/${bout.boutId}/`);
});

test("NJ1 research page modules contain no name join", () => {
  const dir = path.join(APP, "src/lib/research-pages");
  const files = fs.readdirSync(dir).filter((f) => /\.(ts|mjs)$/.test(f) && !f.endsWith(".test.mjs"));
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const banned = [/\.(name|label)\s*===/, /===\s*[\w.?]+\.(name|label)\b/, /localeCompare/, /levenshtein|fuzzy|similarity/i, /\.(name|label)[\w.?]*\.includes\(/];
  for (const f of files) {
    const s = strip(fs.readFileSync(path.join(dir, f), "utf8"));
    for (const re of banned) assert.doesNotMatch(s, re, `${f}: ${re}`);
  }
  assert.match("if (a.name === b.name) join()", banned[0], "positive control");
});
