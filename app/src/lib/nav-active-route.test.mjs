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

test("IA restructure: SIMULATE-first primary spine (Simulate/Today/Results/Bank Builder); explore cluster demoted; no routes removed", () => {
  const nav = fs.readFileSync("src/components/nav.tsx", "utf8");
  // Simulate leads the primary nav (the game-simulation lobby); the old "Game Lab" primary label is gone.
  assert.match(nav, /\{ href: "\/simulate", label: "Simulate" \}/, "Simulate is a nav item");
  assert.ok(!/label: "Games"/.test(nav) && !/label: "Game Lab"/.test(nav), "the old 'Games'/'Game Lab' primary label is gone");
  const dividerIdx = nav.indexOf("beforeDivider: true");
  const idx = (s) => nav.indexOf(s);
  // PRIMARY (before the divider): the 4-item simulate-first spine (+ Home = brand mark).
  for (const [href, label] of [["/simulate", "Simulate"], ["/today", "Today's Picks"], ["/results", "Results"], ["/bank-builder", "Bank Builder"]]) {
    const i = idx(`href: "${href}", label: "${label}"`);
    assert.ok(i > 0 && i < dividerIdx, `${label} is PRIMARY (before the divider)`);
  }
  // SECONDARY (after the divider): the sport hubs + daily track record sit after it.
  for (const href of ["/mlb", "/world-cup", "/mr-dub"]) {
    const i = idx(`href: "${href}"`);
    assert.ok(i > dividerIdx, `${href} is SECONDARY (de-emphasized, after the divider)`);
  }
  // /games ("Game Reports") carries the divider (first secondary) — demoted below the whole primary spine.
  assert.ok(idx('href: "/games"') > idx('href: "/bank-builder"'), "/games is demoted below the primary spine");
  // NO routes removed — everything still reachable.
  for (const href of ["/games", "/mlb", "/world-cup", "/bank-builder", "/mr-dub", "/moonshot", "/world-cup-specials", "/picks", "/results", "/learn", "/simulate"]) {
    assert.ok(nav.includes(`href: "${href}"`), `${href} still in the nav`);
  }
});

test("MOBILE_NAV_ITEMS has 7 items in the product-spine order (Homer Nukes retired; Diamond Specials removed)", () => {
  assert.equal(MOBILE_NAV_ITEMS.length, 7);
  assert.deepEqual(
    MOBILE_NAV_ITEMS.map((i) => i.bucket),
    ["home", "games", "picks", "lab", "bank", "moonshot", "mrdub"],
  );
  assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.href === "/diamond-specials"), "no Diamond Specials nav item");
  assert.ok(!MOBILE_NAV_ITEMS.some((i) => i.href === "/homer-nukes"), "no retired Homer Nukes nav item");
});

test("homer resolves to its own bucket; diamond-specials no longer maps anywhere", () => {
  assert.equal(resolveMobileNavBucket("/homer-nukes"), "homer");
  assert.equal(resolveMobileNavBucket("/diamond-specials"), null, "removed route → no bucket");
});

test("MOBILE_NAV_ITEMS labels are the product spine (Today/Parlay Lab/Build/Bank/Moonshot/Homer Nukes)", () => {
  const byHref = Object.fromEntries(
    MOBILE_NAV_ITEMS.map((i) => [i.href, i.label]),
  );
  assert.equal(byHref["/today"], "Today");
  // The cross-sport bucket now leads with the simulate-first lobby (/simulate).
  assert.equal(byHref["/simulate"], "Simulate");
  // Picks tab renamed to Parlay Lab (route stays /picks for back-compat).
  assert.equal(byHref["/picks"], "Parlay Lab");
  assert.equal(byHref["/build"], "Build");
  assert.equal(byHref["/bank-builder"], "Bank");
  assert.equal(byHref["/moonshot"], "Moonshot");
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

test("homer: /homer-nukes and descendants resolve to their own homer bucket", () => {
  assert.equal(resolveMobileNavBucket("/homer-nukes"), "homer");
  assert.equal(resolveMobileNavBucket("/homer-nukes/"), "homer");
  assert.equal(resolveMobileNavBucket("/homer-nukes/board"), "homer");
});

test("home (Today): '/', '/today' resolve to home", () => {
  assert.equal(resolveMobileNavBucket("/"), "home");
  assert.equal(resolveMobileNavBucket("/today"), "home");
  assert.equal(resolveMobileNavBucket(""), null); // empty is treated as null input
});

test("picks (Parlay Lab): /picks + legacy /parlays + /parlay-lab aliases all highlight Parlay Lab", () => {
  assert.equal(resolveMobileNavBucket("/picks"), "picks");
  assert.equal(resolveMobileNavBucket("/picks/"), "picks");
  assert.equal(resolveMobileNavBucket("/picks/low"), "picks");
  // /parlays + /parlay-lab redirect to the canonical Parlay Lab → same bucket.
  assert.equal(resolveMobileNavBucket("/parlays"), "picks");
  assert.equal(resolveMobileNavBucket("/parlay-lab"), "picks");
  assert.equal(resolveMobileNavBucket("/parlay-lab/builder"), "picks");
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
