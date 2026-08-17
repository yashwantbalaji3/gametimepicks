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
    assert.match(nav, new RegExp(`href: "${href}", label: "${label}", group: "now"`),
      `${label} leads the Now cluster`);
  }

  // SECONDARY: `/bank-builder` opens the group (it carries the divider flag); the sport hubs + daily track
  // record follow it. Strategy-lab + sport surfaces are de-emphasized relative to the daily spine.
  assert.match(nav, /href: "\/bank-builder", label: "Bank Builder", group: "products"/,
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

test("MOBILE_NAV_ITEMS has 6 items in the product-spine order (Picks Lab retired into Build)", () => {
  // Program 143: the "picks" slot is gone — Suggested Cards lives inside Build, so the spine is
  // one item shorter rather than carrying a slot whose destination is a redirect.
  assert.equal(MOBILE_NAV_ITEMS.length, 6);
  assert.deepEqual(
    MOBILE_NAV_ITEMS.map((i) => i.bucket),
    ["home", "games", "lab", "bank", "moonshot", "mrdub"],
  );
  assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.href === "/diamond-specials"), "no Diamond Specials nav item");
  assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.href === "/homer-nukes"), "no retired Homer Nukes nav item");
});

test("retired /homer-nukes + removed /diamond-specials both map to no bucket", () => {
  assert.equal(resolveMobileNavBucket("/homer-nukes"), null, "retired Homer Nukes → no bucket (dead bucket removed)");
  assert.equal(resolveMobileNavBucket("/diamond-specials"), null, "removed route → no bucket");
});

test("MOBILE_NAV_ITEMS labels are the UNIFIED product spine (Today/Picks Lab/Build/Bank Builder/Moonshot/Mr. Dub's Portfolio)", () => {
  const byHref = Object.fromEntries(
    MOBILE_NAV_ITEMS.map((i) => [i.href, i.label]),
  );
  // Label unification: mobile matches the desktop nav / command rail / footer labels exactly.
  assert.equal(byHref["/today"], "Today");
  // The cross-sport bucket leads with the simulate-first lobby (/simulate).
  assert.equal(byHref["/simulate"], "Simulate");
  // Picks Lab is retired (Program 143); /picks redirects to /build#suggested-cards and carries
  // no mobile slot. Build owns the job.
  assert.equal(byHref["/picks"], undefined, "no retired route in the mobile spine");
  assert.equal(byHref["/build"], "Build");
  assert.equal(byHref["/bank-builder"], "Bank Builder");
  // /moonshot surfaces as "Moonshot"; /mr-dub as "Mr. Dub's Portfolio" (Program 139 founder rename).
  assert.equal(byHref["/moonshot"], "Moonshot");
  assert.equal(byHref["/mr-dub"], "Mr. Dub's Portfolio");
  assert.equal(byHref["/homer-nukes"], undefined, "Homer Nukes retired — no nav tab");
});

test("bank: /bank-builder and descendants resolve to bank (Moonshot/Homer are their own buckets now)", () => {
  assert.equal(resolveMobileNavBucket("/bank-builder"), "bank");
  assert.equal(resolveMobileNavBucket("/bank-builder/"), "bank");
  assert.equal(resolveMobileNavBucket("/bank-builder/ledger"), "bank");
});

test("moonshot: /moonshot and descendants resolve to their own moonshot bucket", () => {
  assert.equal(resolveMobileNavBucket("/moonshot"), "moonshot");
  assert.equal(resolveMobileNavBucket("/moonshot/"), "moonshot");
  assert.equal(resolveMobileNavBucket("/moonshot/ladder"), "moonshot");
});

test("retired homer: /homer-nukes and descendants map to no bucket (dead bucket removed)", () => {
  assert.equal(resolveMobileNavBucket("/homer-nukes"), null);
  assert.equal(resolveMobileNavBucket("/homer-nukes/"), null);
  assert.equal(resolveMobileNavBucket("/homer-nukes/board"), null);
});

test("home (Today): '/', '/today' resolve to home", () => {
  assert.equal(resolveMobileNavBucket("/"), "home");
  assert.equal(resolveMobileNavBucket("/today"), "home");
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

test("results no longer has a bottom-nav slot (lives in top nav)", () => {
  assert.equal(resolveMobileNavBucket("/results"), null);
  assert.equal(resolveMobileNavBucket("/results/nba"), null);
});

test("every sport hub/board maps to sports (uniform tabbed sports)", () => {
  assert.equal(resolveMobileNavBucket("/games"), "games");
  assert.equal(resolveMobileNavBucket("/nba"), "games");
  assert.equal(resolveMobileNavBucket("/nba/board/2026-05-27"), "games");
  assert.equal(resolveMobileNavBucket("/mlb"), "games");
  assert.equal(resolveMobileNavBucket("/ufc"), "games");
  assert.equal(resolveMobileNavBucket("/projections"), "games");
});

test("schedule-only + directory surfaces map to games", () => {
  assert.equal(resolveMobileNavBucket("/sports"), "games");
  assert.equal(resolveMobileNavBucket("/events"), "games");
  assert.equal(resolveMobileNavBucket("/events/"), "games");
  assert.equal(resolveMobileNavBucket("/nhl"), "games");
  assert.equal(resolveMobileNavBucket("/ipl"), "games");
  assert.equal(resolveMobileNavBucket("/world-cup"), "games");
  assert.equal(resolveMobileNavBucket("/world-cup/groups"), "games");
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
