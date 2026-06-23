/**
 * Tests for the mobile bottom-nav active-route resolver.
 *
 * Run: npx tsx --test app/src/lib/nav-active-route.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MOBILE_NAV_ITEMS,
  resolveMobileNavBucket,
} from "./nav-active-route.ts";

test("MOBILE_NAV_ITEMS has 8 items in the product-spine order (Homer Nukes added as a first-class product tab)", () => {
  assert.equal(MOBILE_NAV_ITEMS.length, 8);
  assert.deepEqual(
    MOBILE_NAV_ITEMS.map((i) => i.bucket),
    ["home", "games", "picks", "lab", "bank", "moonshot", "homer", "mrdub"],
  );
});

test("MOBILE_NAV_ITEMS labels are the product spine (Today/Parlay Lab/Build/Bank/Moonshot/Homer Nukes)", () => {
  const byHref = Object.fromEntries(
    MOBILE_NAV_ITEMS.map((i) => [i.href, i.label]),
  );
  assert.equal(byHref["/today"], "Today");
  assert.equal(byHref["/games"], "Games");
  // Picks tab renamed to Parlay Lab (route stays /picks for back-compat).
  assert.equal(byHref["/picks"], "Parlay Lab");
  assert.equal(byHref["/build"], "Build");
  assert.equal(byHref["/bank-builder"], "Bank");
  assert.equal(byHref["/moonshot"], "Moonshot");
  assert.equal(byHref["/homer-nukes"], "Homer Nukes");
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
