/**
 * Soccer V2 · C-3 — ONE registry-driven /soccer/[league] page. It generates exactly the competitions that may
 * publish, the search index and the capability registry read the same list, and no second static page lingers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SOCCER_LEAGUES, soccerLeaguePages } from "./leagues.mjs";

const APP = process.cwd();
const src = (p) => fs.readFileSync(path.join(APP, p), "utf8");

test("🔴 the shared page generates exactly the leagues that may publish — today Ligue 1 — and never a rejected one", () => {
  assert.deepEqual(soccerLeaguePages().map((l) => l.key), ["ligue-1"]);
  for (const l of SOCCER_LEAGUES.filter((x) => !["LIVE", "ACCEPTED_V1"].includes(x.stage))) {
    assert.ok(!soccerLeaguePages().some((p) => p.key === l.key), `${l.key} (${l.stage}) never gets a page`);
  }
  const page = src("src/app/soccer/[league]/page.tsx");
  assert.match(page, /soccerLeaguePages\(\)\.map\(\(l\) => \(\{ league: l\.key \}\)\)/);
  assert.match(page, /export const dynamicParams = false;/, "an unknown league is a 404, never an empty shell");
  assert.ok(!fs.existsSync(path.join(APP, "src/app/soccer/ligue-1/page.tsx")), "no second, static Ligue 1 page");
});

test("search and capability read the same registry list — no parallel league lists", () => {
  const idx = src("scripts/build-search-index.mjs");
  assert.match(idx, /for \(const lg of soccerLeaguePages\(\)\.map\(\(l\) => l\.key\)\)/);
  assert.doesNotMatch(idx, /for \(const lg of \["ligue-1"\]\)/);
  const cap = src("src/lib/sport-capability-registry.ts");
  for (const l of soccerLeaguePages()) assert.match(cap, new RegExp(`key: "${l.key}"`), `${l.key} has a capability row (unknown → DISABLED otherwise)`);
});

test("LIVE · the built export has the page, rendered by the shared route (skips without an export)", (t) => {
  const out = path.join(APP, "out");
  if (!fs.existsSync(path.join(out, "index.html"))) { t.skip("no export in this run"); return; }
  for (const l of soccerLeaguePages()) {
    const html = fs.readFileSync(path.join(out, "soccer", l.key, "index.html"), "utf8");
    assert.match(html, new RegExp(`<title>${l.name} match forecasts · GameTime Picks</title>`));
  }
});
