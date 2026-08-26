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
  const nav = fs.readFileSync("src/components/nav.tsx", "utf8") + fs.readFileSync("src/lib/navigation.ts", "utf8");
  // Simulate leads the primary nav (the game-simulation lobby); the old "Game Lab" primary label is gone.
  assert.match(nav, /\{ href: "\/simulate", label: "Simulate"/, "Simulate is a nav item");
  assert.ok(!/label: "Games"/.test(nav) && !/label: "Game Lab"/.test(nav), "the old 'Games'/'Game Lab' primary label is gone");
  const dividerIdx = nav.indexOf("beforeDivider: true");
  const idx = (s) => nav.indexOf(s);
  // P196: order is no longer a hand-picked lead sequence — the spine is grouped by the question a
  // reader is asking, and `beforeDivider` is computed at the group boundary. What survives is the
  // real invariant: the simulate-first destinations lead the NOW cluster, never a paper product.
  for (const [href, label] of [["/today", "Today"], ["/simulate", "Simulate"]]) {
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

test("MOBILE_NAV_ITEMS is the FIVE thumb destinations in canonical order (P208 charter 3B)", () => {
  // P208: the bar carries Home / Today / Simulate / Picks / Parlay; Results and Sports live in the
  // labelled Menu sheet the component adds as the sixth slot — the sheet derives from the same
  // canonical list (rail minus bar), so losing a bar slot removed no destination.
  assert.equal(MOBILE_NAV_ITEMS.length, 5);
  assert.deepEqual(
    MOBILE_NAV_ITEMS.map((i) => i.bucket),
    ["home", "today", "games", "markets", "lab"],
  );
  assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.href === "/diamond-specials"), "no Diamond Specials nav item");
  assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.href === "/homer-nukes"), "no retired Homer Nukes nav item");
});

test("retired /homer-nukes + removed /diamond-specials both map to no bucket", () => {
  assert.equal(resolveMobileNavBucket("/homer-nukes"), null, "retired Homer Nukes → no bucket (dead bucket removed)");
  assert.equal(resolveMobileNavBucket("/diamond-specials"), null, "removed route → no bucket");
});

test("MOBILE_NAV_ITEMS labels are the UNIFIED six-primary set, matching every other surface", () => {
  const byHref = Object.fromEntries(
    MOBILE_NAV_ITEMS.map((i) => [i.href, i.label]),
  );
  // Label unification: mobile matches the desktop nav / command rail / footer labels exactly.
  assert.equal(byHref["/"], "Home");
  assert.equal(byHref["/today"], "Today");
  assert.equal(byHref["/simulate"], "Simulate");
  assert.equal(byHref["/markets"], "Picks");
  assert.equal(byHref["/build"], "Parlay Center");
  // P208: Results + Sports moved to the labelled Menu sheet — off the bar, still one tap away.
  assert.equal(byHref["/sports"], undefined);
  assert.equal(byHref["/results"], undefined);
  // Retired routes and products stay off the bar (the products live on the rail/footer).
  assert.equal(byHref["/picks"], undefined, "no retired route in the mobile spine");
  assert.equal(byHref["/bank-builder"], undefined, "products lost their slots to the six primary");
  assert.equal(byHref["/moonshot"], undefined);
  assert.equal(byHref["/mr-dub"], undefined);
  assert.equal(byHref["/homer-nukes"], undefined, "Homer Nukes retired — no nav tab");
  // The thumb-width shortLabels stay prefix-or-subset of the real label (WCAG 2.5.3).
  const short = Object.fromEntries(MOBILE_NAV_ITEMS.map((i) => [i.href, i.shortLabel]));
  assert.equal(short["/markets"], "Picks");
  assert.equal(short["/build"], "Parlay");
});

test("products highlight nothing: Bank Builder / Moonshot / Mr. Dub lost their slots to the six primary (P201)", () => {
  // No bar item carries these buckets any more, and a highlight pointing at a slot that does not
  // exist is a false claim about where the reader is. Null, like /about — silent over misleading.
  for (const p of ["/bank-builder", "/bank-builder/", "/bank-builder/ledger", "/moonshot", "/moonshot/ladder", "/mr-dub"]) {
    assert.equal(resolveMobileNavBucket(p), null, `${p} → no bucket`);
  }
});

test("markets: /markets and descendants resolve to the Picks slot (P201, relabelled P208)", () => {
  assert.equal(resolveMobileNavBucket("/markets"), "markets");
  assert.equal(resolveMobileNavBucket("/markets/"), "markets");
});

test("retired homer: /homer-nukes and descendants map to no bucket (dead bucket removed)", () => {
  assert.equal(resolveMobileNavBucket("/homer-nukes"), null);
  assert.equal(resolveMobileNavBucket("/homer-nukes/"), null);
  assert.equal(resolveMobileNavBucket("/homer-nukes/board"), null);
});

test("home vs today (P208): '/' resolves to Home's slot, '/today' to its own", () => {
  assert.equal(resolveMobileNavBucket("/"), "home");
  assert.equal(resolveMobileNavBucket("/today"), "today");
  assert.equal(resolveMobileNavBucket("/today/"), "today");
  assert.equal(resolveMobileNavBucket(""), null); // empty is treated as null input
});

test("retired /picks + legacy /parlays + /parlay-lab aliases all highlight Build (lab)", () => {
  // Mid-redirect these must light a REAL nav item; the "picks" bucket has none since Program 143.
  assert.equal(resolveMobileNavBucket("/picks"), "lab");
  assert.equal(resolveMobileNavBucket("/picks/"), "lab");
  assert.equal(resolveMobileNavBucket("/picks/low"), "lab");
  // /parlays + /parlay-lab redirect to the canonical Parlay Lab → same bucket.
  assert.equal(resolveMobileNavBucket("/parlays"), "lab");
  assert.equal(resolveMobileNavBucket("/parlay-lab"), "lab");
  assert.equal(resolveMobileNavBucket("/parlay-lab/builder"), "lab");
});

test("lab (Build): /build only (the custom paper-card builder)", () => {
  assert.equal(resolveMobileNavBucket("/build"), "lab");
  assert.equal(resolveMobileNavBucket("/build/"), "lab");
});

test("results returned to the bar with the six-primary swap (P201) — every record surface highlights it", () => {
  assert.equal(resolveMobileNavBucket("/results"), "results");
  assert.equal(resolveMobileNavBucket("/results/nba"), "results");
  assert.equal(resolveMobileNavBucket("/results/parlay-lab"), "results");
});

test("every league surface maps to the Sports slot; game surfaces keep Simulate (P201 split)", () => {
  // The bar item that promises "enter a league" highlights when the reader is inside one; the
  // cross-sport game surfaces (lobby, reports, legacy aliases) stay with Simulate.
  assert.equal(resolveMobileNavBucket("/games"), "games");
  assert.equal(resolveMobileNavBucket("/projections"), "games");
  assert.equal(resolveMobileNavBucket("/nba"), "sports");
  assert.equal(resolveMobileNavBucket("/nba/board/2026-05-27"), "sports");
  assert.equal(resolveMobileNavBucket("/mlb"), "sports");
  assert.equal(resolveMobileNavBucket("/ufc"), "sports");
  assert.equal(resolveMobileNavBucket("/epl"), "sports");
  assert.equal(resolveMobileNavBucket("/nfl"), "sports");
});

test("schedule-only + directory + archive surfaces map to the Sports slot", () => {
  assert.equal(resolveMobileNavBucket("/sports"), "sports");
  assert.equal(resolveMobileNavBucket("/events"), "games");
  assert.equal(resolveMobileNavBucket("/events/"), "games");
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
