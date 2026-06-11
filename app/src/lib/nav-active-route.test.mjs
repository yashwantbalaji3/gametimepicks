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

test("MOBILE_NAV_ITEMS has 5 items in the product-spine order", () => {
  assert.equal(MOBILE_NAV_ITEMS.length, 5);
  assert.deepEqual(
    MOBILE_NAV_ITEMS.map((i) => i.bucket),
    ["home", "games", "picks", "lab", "bank"],
  );
});

test("MOBILE_NAV_ITEMS labels are the product spine (Today/Picks/Build/Sports/Bank)", () => {
  const byHref = Object.fromEntries(
    MOBILE_NAV_ITEMS.map((i) => [i.href, i.label]),
  );
  assert.equal(byHref["/today"], "Today");
  assert.equal(byHref["/games"], "Games");
  assert.equal(byHref["/picks"], "Picks");
  assert.equal(byHref["/build"], "Build");
  assert.equal(byHref["/bank-builder"], "Bank");
});

test("bank: /bank-builder and descendants resolve to bank", () => {
  assert.equal(resolveMobileNavBucket("/bank-builder"), "bank");
  assert.equal(resolveMobileNavBucket("/bank-builder/"), "bank");
  assert.equal(resolveMobileNavBucket("/bank-builder/ledger"), "bank");
});

test("home (Today): '/', '/today' resolve to home", () => {
  assert.equal(resolveMobileNavBucket("/"), "home");
  assert.equal(resolveMobileNavBucket("/today"), "home");
  assert.equal(resolveMobileNavBucket(""), null); // empty is treated as null input
});

test("picks: /picks and descendants", () => {
  assert.equal(resolveMobileNavBucket("/picks"), "picks");
  assert.equal(resolveMobileNavBucket("/picks/"), "picks");
  assert.equal(resolveMobileNavBucket("/picks/low"), "picks");
});

test("lab (Build): /build + legacy /parlay-lab alias", () => {
  assert.equal(resolveMobileNavBucket("/build"), "lab");
  assert.equal(resolveMobileNavBucket("/build/"), "lab");
  assert.equal(resolveMobileNavBucket("/parlay-lab"), "lab");
  assert.equal(resolveMobileNavBucket("/parlay-lab/builder"), "lab");
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
