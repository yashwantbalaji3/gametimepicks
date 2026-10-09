/**
 * UX-001 phase 2 · ONE ACTIVE-ROUTE RESOLVER. The top nav, the desktop rail, the phone bar and the Menu sheet each kept
 * their own matcher and disagreed (/simulate/* lit Simulations in one and nothing in another; /board lit MLB on desktop
 * and Simulations on a phone; the sheet used a bare prefix rule). Every surface now asks lib/nav-active-route.ts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { activeHref, ownersOf, resolveMobileNavBucket, MOBILE_NAV_ITEMS } from "./nav-active-route.ts";
import { destinationsFor, NAV_DESTINATIONS } from "./navigation.ts";
import { ROUTE_TABLE as ROUTES } from "./audits/route-inventory.mjs";

const rail = destinationsFor("rail").map((d) => d.href);
const top = destinationsFor("top").map((d) => d.href);
const bar = MOBILE_NAV_ITEMS.map((i) => i.href);
const read = (f) => fs.readFileSync(f, "utf8");

test("🔴 every surface asks the shared resolver — no local matcher left", () => {
  for (const f of ["src/components/nav.tsx", "src/components/command-rail.tsx", "src/components/mobile-bottom-nav.tsx"]) {
    const src = read(f);
    assert.match(src, /activeHref\(/, `${f} uses activeHref`);
    assert.doesNotMatch(src, /pathname\.startsWith\(|pathname === "\//, `${f} keeps no hand-written path rule`);
  }
});

test("🔴 one answer per page, each surface lighting the closest destination it carries", () => {
  const cases = [
    // path, rail, top/bar (the five primaries)
    ["/", "/", "/"],
    ["/simulate/nfl-401872981", "/simulate", "/simulate"],
    ["/mlb/board/2026-10-08", "/mlb", "/sports"],
    ["/nfl/game/401872981", "/nfl", "/sports"],
    ["/soccer/ligue-1", "/soccer/ligue-1", "/sports"],
    ["/board", "/mlb", "/simulate"],
    ["/projections/x", "/mlb", "/simulate"],
    ["/mlb/parlays", "/build", null],
    ["/parlays", "/build", null],
    ["/results/nba", "/results", "/results"],
    ["/results/model-audit", "/learn", "/results"],
    ["/methodology", "/methodology", null],
    ["/responsible-use", "/learn", null],
    ["/today", "/today", null],
    ["/live/nfl", "/live", "/live"],
    ["/bank-builder/ledger", "/bank-builder", null],
    ["/about", "/about", null],
    ["/world-cup/groups", "/sports", "/sports"],
    ["/trends", null, null],
  ];
  for (const [p, r, primary] of cases) {
    assert.equal(activeHref(p, rail), r, `rail on ${p}`);
    assert.equal(activeHref(p, top), primary, `top nav on ${p}`);
    assert.equal(activeHref(p, bar), primary, `phone bar on ${p}`);
    assert.equal(activeHref(`${p}/`.replace("//", "/"), rail), r, `trailing slash on ${p}`);
  }
});

test("🔴 Home owns '/' only, and the bar bucket follows the same chain", () => {
  for (const p of ["/about", "/nfl", "/xyz"]) assert.ok(!ownersOf(p).includes("/"), `${p} never lights Home`);
  assert.equal(resolveMobileNavBucket("/nfl/game/1"), "sports");
  assert.equal(resolveMobileNavBucket("/simulate/x"), "games");
  assert.equal(resolveMobileNavBucket(""), null);
});

test("🔴 a retired alias lights where its redirect lands (route inventory), on the surfaces that carry it", () => {
  const destinations = new Set(NAV_DESTINATIONS.map((d) => d.href));
  // /events and /projections keep the phone bar's P201 game-surface rule (pinned in nav-active-route.test.mjs); the
  // rest follow the redirect table.
  const pinnedElsewhere = new Set(["/events", "/trends", "/nhl", "/ipl", "/world-cup", "/nba", "/nba/results"]);
  let checked = 0;
  for (const [alias, r] of Object.entries(ROUTES)) {
    if (r.classification !== "redirect" || pinnedElsewhere.has(alias)) continue;
    const target = (r.redirectTo ?? "").replace(/#.*$/, "").replace(/\/$/, "") || "/";
    const landing = activeHref(target, rail);
    if (!landing || !destinations.has(landing)) continue;
    assert.equal(activeHref(alias, rail), landing, `${alias} → ${target}: lights ${landing} mid-redirect`);
    checked += 1;
  }
  assert.ok(checked >= 8, `checked ${checked} aliases`);
});

test("🔴 the tablet band (768–1023px) has the five primaries AND a Menu with search", () => {
  const nav = read("src/components/nav.tsx");
  assert.match(nav, /className="md:hidden px-4/, "the phone header row stops where the bottom bar stops");
  assert.match(nav, /className="hidden md:flex/, "the primaries row starts at md");
  assert.match(nav, /createPortal\(<MenuSheet[\s\S]{0,120}?withSearch \/>, document\.body\)/,
    "the header opens the shared Menu sheet, with search, portaled out of the blurred header (its containing-block trap)");
  assert.match(read("src/components/mobile-bottom-nav.tsx"), /className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden"/,
    "the sheet can open anywhere below the rail");
  assert.match(read("src/components/mobile-bottom-nav.tsx"), /className="fixed inset-x-0 bottom-0 z-40 md:hidden"/, "the bar stays phone-only");
});
