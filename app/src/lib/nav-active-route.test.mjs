/**
 * Tests for the mobile bottom-nav active-route resolver.
 *
 * Run: npx tsx --test app/src/lib/nav-active-route.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  MOBILE_NAV_ITEMS,
  resolveMobileNavBucket,
} from "./nav-active-route.ts";

// P196: the surfaces DERIVE their destinations from src/lib/navigation.ts, so a reachability check
// must read the canonical list too — the href no longer appears literally in the surface file. The
// assertion is unchanged; it now looks where the answer actually lives.
test("IA restructure: SIMULATE-first primary spine (Simulate/Today/Results/Bank Builder); explore cluster demoted; no routes removed", () => {
  // P194: every nav item now carries a `group` so the thirteen destinations render as four clusters.
  // These assertions match on href+label and stay group-agnostic — they are about WHICH destinations
  // lead the spine, not about the shape of the object that describes them.
  // UX-001 phase 2: the sport hubs' entries live in lib/sports/catalog.ts, which the registry's Sports group derives from.
  const nav = fs.readFileSync("src/components/nav.tsx", "utf8") + fs.readFileSync("src/lib/navigation.ts", "utf8") + fs.readFileSync("src/lib/sports/catalog.ts", "utf8");
  // P243 · E: the destination is named "Simulations" (the charter's five primaries); the old
  // "Game Lab"/"Games" labels stay gone.
  assert.match(nav, /\{ href: "\/simulate", label: "Simulations"/, "Simulations is a nav item");
  assert.ok(!/label: "Games"/.test(nav) && !/label: "Game Lab"/.test(nav), "the old 'Games'/'Game Lab' primary label is gone");
  const dividerIdx = nav.indexOf("beforeDivider: true");
  const idx = (s) => nav.indexOf(s);
  // P196: order is no longer a hand-picked lead sequence — the spine is grouped by the question a
  // reader is asking, and `beforeDivider` is computed at the group boundary. What survives is the
  // real invariant: the simulate-first destinations lead the NOW cluster, never a paper product.
  /* 2026-11-09 five-slot nav: "/" is Today and /today is "Tonight's slate"; both stay in the Now cluster. */
  for (const [href, label] of [["/today", "Tonight's slate"], ["/simulate", "Simulations"]]) {
    const decl = nav.slice(nav.indexOf(`href: "${href}"`));
    const body = decl.slice(0, decl.indexOf("},"));
    assert.match(body, new RegExp(`label: "${label}"`), `${label} keeps its label`);
    assert.match(body, /group: "now"/, `${label} leads the Now cluster`);
  }

  // SECONDARY: `/bank-builder` opens the group (it carries the divider flag); the sport hubs + daily track
  // record follow it. Strategy-lab + sport surfaces are de-emphasized relative to the daily spine.
  /*
   * Matched on the FIELD, not on field ORDER. P185 added `shortLabel` between `label` and `group`
   * and this regex broke — it was asserting the shape of the declaration rather than the invariant,
   * which is that /bank-builder is a PRODUCT and therefore never leads the spine. That is what it
   * checks now, so the next field to arrive does not fail it either.
   */
  const bankDecl = nav.slice(nav.indexOf('href: "/bank-builder"'));
  assert.match(bankDecl.slice(0, bankDecl.indexOf("},")), /group: "products"/,
    "/bank-builder opens the Products cluster — a paper product never leads the spine");
  for (const href of ["/mlb", "/mr-dub"]) {
    const i = idx(`href: "${href}"`);
    assert.ok(i > dividerIdx, `${href} is SECONDARY (de-emphasized, after the divider)`);
  }
  // /games ("Game Reports") carries the divider (first secondary) — demoted below the whole primary spine.
  // Sprint 012 (R1): `/games` is a REDIRECT ALIAS to /simulate — it must not occupy its own nav slot.
  assert.ok(!nav.includes(String.raw`href: "/games"`), "/games (a redirect alias) is not a nav entry");
  // The current active spine is still reachable.
  // Program 143: /picks retired to a redirect — no longer a nav destination.
  for (const href of ["/mlb", "/bank-builder", "/mr-dub", "/moonshot", "/results", "/learn", "/simulate"]) {
    assert.ok(nav.includes(`href: "${href}"`), `${href} still in the nav`);
  }
  // WORLD CUP CLOSEOUT: the completed 2026 World Cup is NOT an active nav item — neither the "/world-cup"
  // hub nor "/world-cup-specials" appears in the primary nav (archive only, reached from results/methodology).
  assert.ok(!nav.includes('href: "/world-cup"'), "World Cup is NOT in the active nav");
  assert.ok(!nav.includes('href: "/world-cup-specials"'), "Soccer Specials is NOT in the active nav");
});

test("MOBILE_NAV_ITEMS is the FIVE primary destinations in canonical order (2026-11-09: Today · Sports · Products · Results · Ask)", () => {
  // The five primaries are the SAME set on every surface (charter E's invariant, kept). Founder mandate 2026-11-09
  // replaced Home / Sports / Live / Simulations / Results with Today / Sports / Products / Results / Ask; Live,
  // Simulations, Tonight's slate, Picks and every product stay in the footer sitemap, and the products are one tap
  // from /products.
  assert.equal(MOBILE_NAV_ITEMS.length, 5);
  assert.deepEqual(
    MOBILE_NAV_ITEMS.map((i) => i.bucket),
    ["today", "sports", "products", "results", "ask"],
  );
  assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.href === "/diamond-specials"), "no Diamond Specials nav item");
  assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.href === "/homer-nukes"), "no retired Homer Nukes nav item");
});

test("Homer Nukes (a live product since its 2026-08-17 revival) lights Products; removed /diamond-specials maps to no bucket", () => {
  assert.equal(resolveMobileNavBucket("/homer-nukes"), "products", "a product page lights the Products primary");
  assert.equal(resolveMobileNavBucket("/diamond-specials"), null, "removed route → no bucket");
});

test("MOBILE_NAV_ITEMS labels are the UNIFIED five-primary set, matching every other surface", () => {
  const byHref = Object.fromEntries(
    MOBILE_NAV_ITEMS.map((i) => [i.href, i.label]),
  );
  // Label unification: mobile matches the desktop nav / command rail / footer labels exactly.
  assert.equal(byHref["/"], "Today");
  assert.equal(byHref["/sports"], "Sports");
  assert.equal(byHref["/products"], "Products");
  assert.equal(byHref["/results"], "Results");
  assert.equal(byHref["/ask"], "Ask");
  // 2026-11-09: Live, Simulations and Parlay Lab left the bar — the homepage carries Live, every game links its
  // simulation, /products links Parlay Lab, and the footer sitemap keeps all three.
  assert.equal(byHref["/simulate"], undefined);
  assert.equal(byHref["/live"], undefined);
  assert.equal(byHref["/build"], undefined);
  assert.equal(byHref["/today"], undefined);
  assert.equal(byHref["/markets"], undefined);
  // Retired routes and products stay off the bar (the products live on the rail/footer).
  assert.equal(byHref["/picks"], undefined, "no retired route in the mobile spine");
  assert.equal(byHref["/bank-builder"], undefined, "products lost their slots to the five primary");
  assert.equal(byHref["/moonshot"], undefined);
  assert.equal(byHref["/mr-dub"], undefined);
  assert.equal(byHref["/homer-nukes"], undefined, "Homer Nukes retired — no nav tab");
  // The thumb-width shortLabels stay prefix-or-subset of the real label (WCAG 2.5.3).
  const short = Object.fromEntries(MOBILE_NAV_ITEMS.map((i) => [i.href, i.shortLabel]));
  assert.equal(short["/ask"], "Ask");
  for (const i of MOBILE_NAV_ITEMS) {
    assert.ok(i.label.includes(i.shortLabel), `${i.href}: shortLabel "${i.shortLabel}" must appear within "${i.label}"`);
  }
});

test("2026-11-09: every paper product lights the Products primary (Bank Builder, Moonshot, Mr. Dub, Picks, Homer Nukes)", () => {
  // The bar now carries a Products slot, so a product page has a real place to point; /about still lights nothing.
  for (const p of ["/bank-builder", "/bank-builder/", "/bank-builder/ledger", "/moonshot", "/moonshot/ladder", "/mr-dub", "/markets", "/markets/", "/homer-nukes/board", "/products"]) {
    assert.equal(resolveMobileNavBucket(p), "products", `${p} → products`);
  }
  assert.equal(resolveMobileNavBucket("/about"), null);
});

test("2026-11-09: '/' and '/today' both light Today (the homepage is today; /today is tonight's full slate)", () => {
  assert.equal(resolveMobileNavBucket("/"), "today");
  assert.equal(resolveMobileNavBucket("/today"), "today");
  assert.equal(resolveMobileNavBucket("/today/"), "today");
  assert.equal(resolveMobileNavBucket(""), null); // empty is treated as null input
});

test("retired /picks + legacy /parlays + /parlay-lab aliases and /build all light Products (2026-11-09; Parlay Lab is a product)", () => {
  // Mid-redirect these must light a REAL bar item; Parlay Lab (/build) is reached through the Products primary.
  for (const p of ["/picks", "/picks/", "/picks/low", "/parlays", "/parlay-lab", "/parlay-lab/builder", "/build", "/build/", "/build/custom"]) {
    assert.equal(resolveMobileNavBucket(p), "products", `${p} → products`);
  }
});

test("results returned to the bar with the six-primary swap (P201) — every record surface highlights it", () => {
  assert.equal(resolveMobileNavBucket("/results"), "results");
  assert.equal(resolveMobileNavBucket("/results/nba"), "results");
  assert.equal(resolveMobileNavBucket("/results/parlay-lab"), "results");
});

test("every league surface maps to the Sports slot; cross-sport game surfaces light Today (2026-11-09)", () => {
  // The bar item that promises "enter a league" highlights when the reader is inside one; the cross-sport game
  // surfaces (simulation lobby, Live, legacy aliases) light Today now that Simulations and Live left the bar.
  assert.equal(resolveMobileNavBucket("/games"), "today");
  assert.equal(resolveMobileNavBucket("/simulate"), "today");
  assert.equal(resolveMobileNavBucket("/live"), "today");
  assert.equal(resolveMobileNavBucket("/projections"), "sports");
  assert.equal(resolveMobileNavBucket("/nba"), "sports");
  assert.equal(resolveMobileNavBucket("/nba/board/2026-05-27"), "sports");
  assert.equal(resolveMobileNavBucket("/mlb"), "sports");
  assert.equal(resolveMobileNavBucket("/ufc"), "sports");
  assert.equal(resolveMobileNavBucket("/epl"), "sports");
  assert.equal(resolveMobileNavBucket("/nfl"), "sports");
});

test("schedule-only + directory + archive surfaces map to the Sports slot", () => {
  assert.equal(resolveMobileNavBucket("/sports"), "sports");
  assert.equal(resolveMobileNavBucket("/events"), "today");
  assert.equal(resolveMobileNavBucket("/events/"), "today");
  assert.equal(resolveMobileNavBucket("/nhl"), "sports");
  assert.equal(resolveMobileNavBucket("/ipl"), "sports");
  assert.equal(resolveMobileNavBucket("/world-cup"), "sports");
  assert.equal(resolveMobileNavBucket("/world-cup/groups"), "sports");
});

test("non-bucketed routes return null (no false highlight)", () => {
  assert.equal(resolveMobileNavBucket("/about"), null);
  assert.equal(resolveMobileNavBucket("/responsible-use"), null);
  assert.equal(resolveMobileNavBucket("/trends"), null);
});

test("invalid input returns null defensively", () => {
  assert.equal(resolveMobileNavBucket(null), null);
  assert.equal(resolveMobileNavBucket(undefined), null);
  // @ts-expect-error testing runtime defense
  assert.equal(resolveMobileNavBucket(42), null);
});

test("no banned copy in any nav item label", () => {
  const banned = [
    /\block\b/i,
    /\bguaranteed\b/i,
    /\bfree money\b/i,
    /\brisk[\s-]?free\b/i,
    /\bcan(?:'|’)?t miss\b/i,
    /\beasy (win|money)\b/i,
    /\bno[\s-]?brainer\b/i,
    /\bsure thing\b/i,
    /\bsharp money\b/i,
  ];
  for (const item of MOBILE_NAV_ITEMS) {
    for (const pattern of banned) {
      assert.ok(
        !pattern.test(item.label),
        `nav label "${item.label}" must not match banned pattern ${pattern}`,
      );
    }
  }
});
