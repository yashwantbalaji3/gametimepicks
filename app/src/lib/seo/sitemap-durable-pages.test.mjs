/**
 * sitemap.xml lists only pages the export builds (Batch 1 · #10).
 *
 *  SD1  every durable game URL is in its route's OWN generateStaticParams (imported from the page, not re-derived)
 *  SD2  every static URL is a source page that is not pruned, not a family template, not a redirect stub, not noindex
 *  SD3  <lastmod> only on durable pages, always a YYYY-MM-DD event date — never build time
 *  SD4  the families the sitemap must carry are present: settled MLB + archived NFL game pages, /results/nba
 *  SD5  /nba/simulation (internal, pruned while gated, noindex when on) is never listed
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import * as sitemapModule from "../../app/sitemap.ts";
import * as gamesPage from "../../app/games/[sport]/[gameId]/page.tsx";
import * as nflGamePage from "../../app/nfl/game/[eventId]/page.tsx";
import * as ufcBoutPage from "../../app/ufc/bout/[boutId]/page.tsx";
import { ROUTE_TABLE } from "../audits/route-inventory.mjs";
import { durablePages } from "./sitemap-durable-pages.ts";

// tsx loads a .ts default export through CJS interop; unwrap it either way.
const unwrap = (m, k) => (typeof m[k] === "function" ? m[k] : m.default?.[k]);
const sitemap = typeof sitemapModule.default === "function" ? sitemapModule.default : sitemapModule.default.default;

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const entries = sitemap();
const pathOf = (u) => u.replace(/^https:\/\/[^/]+/, "");
const paths = entries.map((e) => pathOf(e.url));

const exported = new Set([
  ...unwrap(gamesPage, "generateStaticParams")().map((p) => `/games/${p.sport}/${p.gameId}/`),
  ...unwrap(nflGamePage, "generateStaticParams")().map((p) => `/nfl/game/${p.eventId}/`),
  ...unwrap(ufcBoutPage, "generateStaticParams")().map((p) => `/ufc/bout/${p.boutId}/`),
]);
const DYNAMIC = /^\/(games\/[^/]+\/[^/]+|nfl\/game\/[^/]+|ufc\/bout\/[^/]+)\/$/;

test("SD1 every durable game URL in the sitemap is in its page's own generateStaticParams", () => {
  const dynamic = paths.filter((p) => DYNAMIC.test(p));
  assert.ok(dynamic.length > 0, "the sitemap lists durable game pages");
  for (const p of dynamic) assert.ok(exported.has(p), `${p} is listed but its page's generateStaticParams does not build it`);
  for (const d of durablePages()) assert.ok(paths.includes(d.path), `${d.path} (a durable page) reaches the sitemap`);
});

test("SD2 every other URL is a built, indexable, non-pruned source route", () => {
  const prune = fs.readFileSync(path.join(APP, "scripts/prune-internal-routes.mjs"), "utf8");
  for (const p of paths.filter((x) => !DYNAMIC.test(x))) {
    assert.ok(!p.includes("[") && !p.includes("?"), `${p}: no template or query URL`);
    assert.ok(!/^\/(ops|preview|launch|dev)\//.test(p), `${p}: never a pruned internal route`);
    const route = p === "/" ? "/" : p.replace(/\/$/, "");
    const row = ROUTE_TABLE[route];
    if (row) {
      assert.equal(row.classification, "public", `${p}: listed routes are public (not ${row.classification})`);
      assert.notEqual(row.indexable, false, `${p}: a noindex route is never listed`);
    }
    // research / compare / matchup / soccer-league pages come from their own registries (their tests pin them); a
    // static route row must have its page in source
    if (row && !row.family) assert.ok(fs.existsSync(path.join(APP, "src/app", route === "/" ? "" : route.slice(1), "page.tsx")), `${p}: source page exists`);
  }
  assert.match(prune, /INTERNAL_ROUTES/, "prune script still names its internal routes");
});

test("SD3 lastmod: durable pages only, a YYYY-MM-DD event date, never build time", () => {
  const withLastmod = entries.filter((e) => e.lastModified !== undefined);
  assert.ok(withLastmod.length > 0, "durable pages carry lastmod");
  for (const e of withLastmod) {
    assert.ok(DYNAMIC.test(pathOf(e.url)), `${e.url}: only durable game pages carry lastmod`);
    assert.match(String(e.lastModified), /^\d{4}-\d{2}-\d{2}$/, `${e.url}: lastmod is a data date, not a timestamp`);
  }
  // deterministic: a second call yields the same entries
  assert.deepEqual(sitemap(), entries, "the sitemap is a pure function of committed data and the build's ET date");
  const src = fs.readFileSync(path.join(APP, "src/lib/seo/sitemap-durable-pages.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(src, /new Date\(\)|Date\.now\(\)/, "no wall-clock read for lastmod");
});

test("SD4 settled MLB and archived NFL game pages and /results/nba are listed", () => {
  assert.ok(paths.some((p) => p.startsWith("/nfl/game/")), "archived NFL game pages are listed");
  assert.ok(paths.some((p) => p.startsWith("/ufc/bout/")), "settled UFC bout pages are listed");
  assert.ok(paths.includes("/results/nba/"), "/results/nba (the NBA Official Record) is listed");
  // MLB settled pages exist only inside the expired-link window; when the window holds graded games they are listed
  const mlb = durablePages().filter((d) => d.path.startsWith("/games/mlb/"));
  for (const d of mlb) assert.ok(paths.includes(d.path), `${d.path} listed`);
  assert.equal(new Set(paths).size, paths.length, "no URL is listed twice");
});

test("SD5 /nba/simulation pages are never listed", () => {
  assert.ok(!paths.some((p) => p.startsWith("/nba/simulation")), "the Theater family is internal and noindex");
});
