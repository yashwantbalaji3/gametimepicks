/**
 * FOUNDER CONDITION 1 (2026-11-09, PR #1297): "/" becomes Today-first and NOTHING a visitor could reach before breaks —
 * no bookmark, link or journey. The frozen lists below are what the site linked on 2026-11-09 before the five-slot nav
 * (main's nav contract, plus every route the UX audit opened: sitemap families and the homepage/hub links). Each must
 * still have a page, every old nav destination must still be on the canonical list (footer at least), and — when an
 * export exists — each static route must still be served.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const { NAV_DESTINATIONS } = await import("./navigation.ts");
const APP = process.cwd();

/** main's nav contract on 2026-11-09 (every surface). */
const PREVIOUS_NAV = [
  "/", "/about", "/ask", "/bank-builder", "/build", "/cage-chaos", "/cards/epl", "/cards/nfl", "/cards/ufc", "/endzone-vault",
  "/following", "/homer-nukes", "/learn", "/live", "/market-guide", "/markets", "/methodology", "/models", "/moonshot", "/mr-dub",
  "/my", "/research", "/research/lab", "/responsible-use", "/results", "/results/model-audit", "/results/nba", "/results/parlay-lab",
  "/results/picks", "/saved", "/simulate", "/sports", "/system-status", "/today",
  "/nfl", "/nba", "/mlb", "/epl", "/ufc", "/soccer/ligue-1",
];
/** Every route the 2026-11-09 audit opened (sitemap families sampled; homepage and hub links). */
const PREVIOUS_ROUTES = [
  "/", "/about", "/account", "/ask", "/bank-builder", "/build", "/build/custom", "/cage-chaos", "/cards/nfl", "/compare",
  "/compare/players/nfl", "/compare/teams/mlb", "/endzone-vault", "/epl", "/following", "/games/mlb/cws-vs-cle-2026-10-10",
  "/homer-nukes", "/learn", "/live", "/market-guide", "/markets", "/matchups/nfl/401872656", "/methodology", "/mlb", "/mlb/board",
  "/mlb/power", "/mlb/results", "/models", "/moonshot", "/mr-dub", "/my", "/nba", "/nba/projections", "/nba/projections/2026-11-08",
  "/nba/simulation/401909940", "/nfl", "/nfl/game/401873037", "/nfl/week/2-09", "/players", "/players/epl/aaron-hickey",
  "/players/nfl/aaron-jones-sr", "/players/ufc/abus-magomedov", "/research", "/research/lab", "/responsible-use", "/results",
  "/results/forecasts", "/results/mlb", "/results/model-audit", "/results/nba", "/results/nfl", "/results/parlay-lab",
  "/results/parlays", "/results/picks", "/results/picks/ligue-1", "/results/picks/nfl", "/saved", "/simulate", "/soccer/ligue-1",
  "/sports", "/system-status", "/teams", "/teams/mlb/arizona-diamondbacks", "/teams/nfl/arizona-cardinals", "/today", "/ufc",
  "/ufc/bout/401928111",
];

/** The page file serving `route`: the literal directory, else a dynamic [segment] sibling at each level. */
function pageFor(route) {
  let dir = path.join(APP, "src", "app");
  for (const seg of route.split("/").filter(Boolean)) {
    const lit = path.join(dir, seg);
    if (fs.existsSync(lit)) { dir = lit; continue; }
    const dyn = fs.existsSync(dir) ? fs.readdirSync(dir).find((n) => /^\[[^\]]+\]$/.test(n)) : null;
    if (!dyn) return null;
    dir = path.join(dir, dyn);
  }
  const f = path.join(dir, "page.tsx");
  return fs.existsSync(f) ? f : null;
}

test("every route linked before the five-slot nav still has a page (bookmarks and links keep working)", () => {
  const missing = [...new Set([...PREVIOUS_NAV, ...PREVIOUS_ROUTES])].filter((r) => !pageFor(r));
  assert.deepEqual(missing, []);
});

test("/today is kept as a real page (not removed, not a 404), and '/' is the Today-first homepage", () => {
  const today = fs.readFileSync(pageFor("/today"), "utf8");
  assert.doesNotMatch(today, /^\s*notFound\(\);/m, "/today does not 404");
  assert.ok(NAV_DESTINATIONS.some((d) => d.href === "/today" && d.surfaces.includes("footer")), "/today stays in the footer sitemap");
  assert.equal(NAV_DESTINATIONS.find((d) => d.href === "/")?.label, "Today");
  assert.match(fs.readFileSync(pageFor("/"), "utf8"), /heading="Today's games"/, "the homepage leads with today's games");
});

test("every previous nav destination is still on the canonical list (reachable from at least the footer)", () => {
  const hrefs = new Set(NAV_DESTINATIONS.map((d) => d.href));
  assert.deepEqual(PREVIOUS_NAV.filter((h) => !hrefs.has(h) && h !== "/account"), []);
});

test("BUILT: every previously linked route is served by the export (skipped without one)", { skip: !fs.existsSync(path.join(APP, "out")) && "no export at app/out" }, () => {
  const out = path.join(APP, "out");
  const missing = PREVIOUS_ROUTES.filter((r) => !/\/(account|my|following|saved)$/.test(r))
    .filter((r) => !fs.existsSync(path.join(out, r === "/" ? "index.html" : `${r.slice(1)}/index.html`)) && !fs.existsSync(path.join(out, `${r.slice(1)}.html`)));
  // a dated or per-event page can roll off the window; a static route never may
  const staticMissing = missing.filter((r) => !/\d{4}-\d{2}-\d{2}|\/\d{6,}|\/2-09$/.test(r));
  assert.deepEqual(staticMissing, [], "static routes served");
});
