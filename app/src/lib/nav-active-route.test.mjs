/**
 * Tests for the primary-nav active-route resolver (v1 five-page architecture).
 *
 * Run: npx tsx --test app/src/lib/nav-active-route.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  MOBILE_NAV_ITEMS,
  resolveMobileNavBucket,
} from "./nav-active-route.ts";

test("the spine is exactly the five primary destinations, in order", () => {
  assert.equal(MOBILE_NAV_ITEMS.length, 5);
  assert.deepEqual(
    MOBILE_NAV_ITEMS.map((i) => i.bucket),
    ["home", "bank", "picks", "record", "how"],
  );
  assert.deepEqual(
    MOBILE_NAV_ITEMS.map((i) => i.href),
    ["/today", "/bank-builder", "/picks", "/mr-dub", "/methodology"],
  );
});

test("labels are the user-facing v1 names; short labels fit the mobile bar", () => {
  const byHref = Object.fromEntries(MOBILE_NAV_ITEMS.map((i) => [i.href, i.label]));
  assert.equal(byHref["/today"], "Home");
  assert.equal(byHref["/bank-builder"], "Bank Builder");
  assert.equal(byHref["/picks"], "Today's Picks");
  assert.equal(byHref["/mr-dub"], "Track Record");
  assert.equal(byHref["/methodology"], "How It Works");
  assert.deepEqual(MOBILE_NAV_ITEMS.map((i) => i.short), ["Home", "Bank", "Picks", "Record", "How"]);
});

test("home: / and /today resolve to home", () => {
  assert.equal(resolveMobileNavBucket("/"), "home");
  assert.equal(resolveMobileNavBucket("/today"), "home");
  assert.equal(resolveMobileNavBucket(""), null);
});

test("bank: /bank-builder and descendants resolve to bank", () => {
  assert.equal(resolveMobileNavBucket("/bank-builder"), "bank");
  assert.equal(resolveMobileNavBucket("/bank-builder/ledger"), "bank");
});

test("Today's Picks folds the daily-play surfaces, build, game context, and the secondary lanes", () => {
  for (const p of [
    "/picks", "/picks/low", "/parlays", "/parlay-lab", "/parlay-lab/builder", "/build",
    "/games", "/sports", "/events", "/board", "/projections", "/trends",
    "/world-cup", "/world-cup/groups", "/world-cup-specials", "/mlb", "/nba", "/nhl", "/ipl", "/ufc",
    "/moonshot", "/homer-nukes",
  ]) {
    assert.equal(resolveMobileNavBucket(p), "picks", `${p} → Today's Picks`);
  }
});

test("Track Record folds the settled-history / results surfaces", () => {
  assert.equal(resolveMobileNavBucket("/mr-dub"), "record");
  assert.equal(resolveMobileNavBucket("/mr-dub/ledger"), "record");
  assert.equal(resolveMobileNavBucket("/results"), "record");
  assert.equal(resolveMobileNavBucket("/results/nba"), "record");
});

test("How It Works folds methodology / about / learn / responsible-use", () => {
  assert.equal(resolveMobileNavBucket("/methodology"), "how");
  assert.equal(resolveMobileNavBucket("/about"), "how");
  assert.equal(resolveMobileNavBucket("/learn"), "how");
  assert.equal(resolveMobileNavBucket("/responsible-use"), "how");
});

test("unknown routes return null (no false highlight)", () => {
  assert.equal(resolveMobileNavBucket("/totally-unknown"), null);
  assert.equal(resolveMobileNavBucket(null), null);
  assert.equal(resolveMobileNavBucket(undefined), null);
  // @ts-expect-error testing runtime defense
  assert.equal(resolveMobileNavBucket(42), null);
});

test("no banned copy in any nav item label", () => {
  const banned = [/\block\b/i, /\bguaranteed\b/i, /\bfree money\b/i, /\brisk[\s-]?free\b/i, /\bsure thing\b/i, /\bsharp money\b/i];
  for (const item of MOBILE_NAV_ITEMS) {
    for (const pattern of banned) {
      assert.ok(!pattern.test(item.label) && !pattern.test(item.short), `nav label "${item.label}" must not match ${pattern}`);
    }
  }
});
