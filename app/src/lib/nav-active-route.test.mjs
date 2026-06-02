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

test("MOBILE_NAV_ITEMS has 5 items in the documented order", () => {
  assert.equal(MOBILE_NAV_ITEMS.length, 5);
  assert.deepEqual(
    MOBILE_NAV_ITEMS.map((i) => i.bucket),
    ["home", "picks", "lab", "results", "sports"],
  );
});

test("MOBILE_NAV_ITEMS labels match the mobile top-nav names", () => {
  // Regression guard for the nav-consistency fix: the bottom nav must
  // not relabel a destination. The same href must read the same in both
  // navs.
  const byHref = Object.fromEntries(
    MOBILE_NAV_ITEMS.map((i) => [i.href, i.label]),
  );
  assert.equal(byHref["/"], "Home");
  assert.equal(byHref["/projections"], "Projections");
  assert.equal(byHref["/parlay-lab"], "Parlay Lab");
  assert.equal(byHref["/results"], "Results");
  assert.equal(byHref["/events"], "Sports");
});

test("home: '/' and '' resolve to home", () => {
  assert.equal(resolveMobileNavBucket("/"), "home");
  assert.equal(resolveMobileNavBucket(""), null); // empty is treated as null input
});

test("picks: /projections and descendants", () => {
  assert.equal(resolveMobileNavBucket("/projections"), "picks");
  assert.equal(resolveMobileNavBucket("/projections/"), "picks");
  assert.equal(resolveMobileNavBucket("/projections/2026-05-27"), "picks");
});

test("lab: /parlay-lab and descendants", () => {
  assert.equal(resolveMobileNavBucket("/parlay-lab"), "lab");
  assert.equal(resolveMobileNavBucket("/parlay-lab/"), "lab");
  assert.equal(resolveMobileNavBucket("/parlay-lab/builder"), "lab");
});

test("results: /results and every nested results route", () => {
  assert.equal(resolveMobileNavBucket("/results"), "results");
  assert.equal(resolveMobileNavBucket("/results/"), "results");
  assert.equal(resolveMobileNavBucket("/results/nba"), "results");
  assert.equal(resolveMobileNavBucket("/results/mlb"), "results");
  assert.equal(resolveMobileNavBucket("/results/date/2026-05-27"), "results");
  assert.equal(resolveMobileNavBucket("/results/parlays"), "results");
});

test("NBA + MLB boards map to picks (real projections)", () => {
  assert.equal(resolveMobileNavBucket("/nba"), "picks");
  assert.equal(resolveMobileNavBucket("/nba/board/2026-05-27"), "picks");
  assert.equal(resolveMobileNavBucket("/mlb"), "picks");
});

test("schedule-only surfaces map to sports", () => {
  assert.equal(resolveMobileNavBucket("/events"), "sports");
  assert.equal(resolveMobileNavBucket("/events/"), "sports");
  assert.equal(resolveMobileNavBucket("/nhl"), "sports");
  assert.equal(resolveMobileNavBucket("/nhl/"), "sports");
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
