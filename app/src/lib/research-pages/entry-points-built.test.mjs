/**
 * RESEARCH ENTRY POINTS (2026-10-05) — built-export guards. Post-build phase: reads out/.
 *
 *  EP1 every sport hub and /sports/ link the Research home in one click, and each link's #anchor exists there
 *  EP2 the Research, Compare and Research Lab destinations are served (rail/footer changes left to Stage 8 nav)
 *  EP3 site search reaches Research, Research Lab, Compare (and each shipped Compare builder), Ask and Live
 *
 * Run (after `npm run build`): npx tsx --test src/lib/research-pages/entry-points-built.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { PLAYER_COMPARE_SPORTS, TEAM_COMPARE_SPORTS } from "../compare/contract.mjs";

const APP = process.cwd().endsWith("app") ? process.cwd() : path.join(process.cwd(), "app");
const OUT = path.join(APP, "out");
const htmlOf = (p) => fs.readFileSync(path.join(OUT, p.replace(/^\//, ""), "index.html"), "utf8");
const exists = (p) => fs.existsSync(path.join(OUT, p.replace(/^\//, "").replace(/\/?$/, "/"), "index.html"));
const hrefs = (html) => [...html.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
const research = () => htmlOf("/research/");

test("EP1 every sport hub and /sports/ reach the Research home in one click, landing on a real anchor", () => {
  assert.ok(fs.existsSync(OUT), "run after `npm run build` (post-build phase)");
  const home = research();
  const want = { "/nfl/": "#teams-nfl", "/mlb/": "#teams-mlb", "/epl/": "#teams-epl", "/ufc/": "" };
  for (const [hub, anchor] of Object.entries(want)) {
    const links = hrefs(htmlOf(hub)).filter((h) => /^\/research\/?(#|$)/.test(h));
    assert.ok(links.length > 0, `${hub} has no link to /research/`);
    if (anchor) {
      assert.ok(links.some((h) => h.endsWith(anchor)), `${hub} links /research/${anchor}`);
      assert.match(home, new RegExp(`id="${anchor.slice(1)}"`), `/research/ renders ${anchor}`);
    }
  }
  const sports = hrefs(htmlOf("/sports/"));
  for (const a of ["#teams-nfl", "#teams-mlb", "#teams-epl"]) assert.ok(sports.some((h) => /^\/research\/?#/.test(h) && h.endsWith(a)), `/sports/ links /research/${a}`);
  for (const h of sports.filter((x) => x.startsWith("/compare/"))) assert.ok(exists(h.split("#")[0]), `/sports/ → ${h} resolves`);
});

/*
 * EP2 (nav split out, 2026-10-07): the rail and footer belong to the Stage 8 navigation work (decided nav: Today ·
 * Simulations · Parlays · Results; utilities Search · Ask · My GameTime), so this slice leaves navigation.ts alone.
 * It only checks that the destinations the existing footer already names are still served.
 */
test("EP2 the destinations this slice links to are served", () => {
  for (const h of ["/research/", "/compare/", "/research/lab/"]) assert.ok(exists(h), `${h} is served`);
});

test("EP3 site search reaches the Research tools and every shipped Compare builder, all served", () => {
  const file = path.join(APP, "public/data/search/index.json");
  assert.ok(fs.existsSync(file), "search index built");
  const rows = JSON.parse(fs.readFileSync(file, "utf8")).rows;
  const byHref = new Map(rows.map((r) => [r.h, r]));
  const want = ["/research/", "/research/lab/", "/compare/", "/ask/", "/live/",
    ...TEAM_COMPARE_SPORTS.map((s) => `/compare/teams/${s.toLowerCase()}/`),
    ...PLAYER_COMPARE_SPORTS.map((s) => `/compare/players/${s.toLowerCase()}/`)];
  for (const h of want) {
    assert.ok(byHref.has(h), `search has no entry for ${h}`);
    assert.ok(exists(h), `search entry ${h} is not served by this export`);
  }
  assert.match(byHref.get("/compare/").t, /\bvs\b/, "\"vs\" finds Compare");
});
