/**
 * UX-001 phase 2 · ONE SPORT CATALOG. Every surface that lists sports reads lib/sports/catalog.ts, so no menu can be
 * missing a hub again (Ligue 1 had a public page and no link; the chooser had no NBA).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { SPORTS, COMPETITIONS, competitionFor } from "./catalog.ts";
import { NAV_DESTINATIONS } from "../navigation.ts";
import { soccerLeaguePages } from "./soccer/leagues.mjs";

const read = (rel) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

test("🔴 the founder's sport names and order, competitions inside them", () => {
  assert.deepEqual(SPORTS.map((s) => s.label), ["Football", "Basketball", "Baseball", "Soccer", "MMA"]);
  assert.deepEqual(Object.fromEntries(SPORTS.map((s) => [s.label, s.competitions.map((c) => c.label)])), {
    Football: ["NFL"], Basketball: ["NBA"], Baseball: ["MLB"], Soccer: ["Premier League", "Ligue 1"], MMA: ["UFC"],
  });
});

test("🔴 a soccer competition is listed only through the publishing gate — never a planned, held or rejected league", () => {
  const listed = SPORTS.find((s) => s.key === "soccer").competitions.slice(1).map((c) => c.key);
  assert.deepEqual(listed, soccerLeaguePages().map((l) => l.key));
  for (const c of COMPETITIONS) assert.ok(fs.existsSync(path.join(process.cwd(), "src/app", c.href.slice(1).replace(/^soccer\/.+$/, "soccer/[league]"), "page.tsx")), `${c.href} has a page`);
});

test("🔴 the navigation registry's Sports group IS the catalog, in order", () => {
  const sports = NAV_DESTINATIONS.filter((d) => d.group === "sports" && d.surfaces.includes("rail"));
  assert.deepEqual(sports.map((d) => d.href), COMPETITIONS.map((c) => c.href));
  for (const d of sports) {
    const c = competitionFor(COMPETITIONS.find((x) => x.href === d.href).key);
    assert.equal(d.desc, `${c.sport.label} hub`, `${d.href} is described by its sport`);
    assert.ok(d.surfaces.includes("footer"), `${d.href} is in the footer sitemap`);
  }
});

test("🔴 no coverage note promises a forecast the hub does not publish, or a season/liveness the list cannot keep", () => {
  assert.match(competitionFor("nba").note, /no forecast/);
  for (const c of COMPETITIONS) assert.doesNotMatch(c.note, /\blive\b|\bin season\b|\btoday\b/i, c.key);
  // Ligue 1 passed a preregistered backtest but has too few matches to grade forward: neither "validated" nor "not validated".
  assert.equal(competitionFor("ligue-1").note, "model-only forecasts · backtest only");
});

test("🔴 every hub mounts the shared switcher with its own catalog key", () => {
  const mounts = { "src/app/nfl/page.tsx": "nfl", "src/app/nba/page.tsx": "nba", "src/app/mlb/page.tsx": "mlb", "src/app/epl/page.tsx": "epl", "src/app/ufc/page.tsx": "ufc" };
  for (const [file, key] of Object.entries(mounts)) {
    assert.ok(competitionFor(key), key);
    assert.match(read(file), new RegExp(`<SportSwitcher current="${key}" />`), file);
  }
  assert.match(read("src/components/soccer/league-forecast-page.tsx"), /<SportSwitcher current=\{leagueKey\} \/>/);
  const sw = read("src/components/sports/sport-switcher.tsx");
  assert.doesNotMatch(sw, /"use client"|usePathname/, "server-rendered from the hub's key — nothing can differ at hydration");
  assert.doesNotMatch(sw, /overflow-x|overflowX/, "wraps instead of scrolling sideways");
});
