/**
 * Tests for the public-parlay-era helper used to reset public parlay
 * tracking starting 2026-05-27.
 *
 * Run: npx tsx --test app/src/lib/public-parlay-era.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PUBLIC_PARLAY_RESULTS_START_DATE,
  isInPublicParlayEra,
  filterDatesToPublicEra,
  aggregateBuckets,
  emptyPublicParlayBucket,
} from "./public-parlay-era.ts";

test("era constant is 2026-05-27", () => {
  assert.equal(PUBLIC_PARLAY_RESULTS_START_DATE, "2026-05-27");
});

test("isInPublicParlayEra: pre-era 2026-05-25 → false", () => {
  assert.equal(isInPublicParlayEra("2026-05-25"), false);
});

test("isInPublicParlayEra: pre-era 2026-05-26 → false", () => {
  assert.equal(isInPublicParlayEra("2026-05-26"), false);
});

test("isInPublicParlayEra: era start 2026-05-27 → true (inclusive)", () => {
  assert.equal(isInPublicParlayEra("2026-05-27"), true);
});

test("isInPublicParlayEra: post-era 2026-05-28 → true", () => {
  assert.equal(isInPublicParlayEra("2026-05-28"), true);
});

test("isInPublicParlayEra: post-era 2027-01-01 → true", () => {
  assert.equal(isInPublicParlayEra("2027-01-01"), true);
});

test("isInPublicParlayEra: null → false (defensive)", () => {
  assert.equal(isInPublicParlayEra(null), false);
});

test("isInPublicParlayEra: undefined → false (defensive)", () => {
  assert.equal(isInPublicParlayEra(undefined), false);
});

test("isInPublicParlayEra: malformed → false", () => {
  assert.equal(isInPublicParlayEra("not-a-date"), false);
  assert.equal(isInPublicParlayEra("2026-5-27"), false);
  assert.equal(isInPublicParlayEra(""), false);
});

test("filterDatesToPublicEra: mixed list keeps only post-era", () => {
  const input = ["2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28"];
  assert.deepEqual(filterDatesToPublicEra(input), [
    "2026-05-27",
    "2026-05-28",
  ]);
});

test("filterDatesToPublicEra: all pre-era → empty", () => {
  assert.deepEqual(
    filterDatesToPublicEra(["2026-05-25", "2026-05-26"]),
    [],
  );
});

test("filterDatesToPublicEra: empty input → empty", () => {
  assert.deepEqual(filterDatesToPublicEra([]), []);
});

test("aggregateBuckets: empty rows → all zeros + null hit rate", () => {
  assert.deepEqual(aggregateBuckets([]), {
    wins: 0,
    losses: 0,
    pushes: 0,
    pending: 0,
    decisive: 0,
    hitRate: null,
  });
});

test("aggregateBuckets: one row with decisive slips → computed hit rate", () => {
  const out = aggregateBuckets([
    {
      wins: 3,
      losses: 7,
      pushes: 1,
      pending: 2,
      decisive: 10,
      hitRate: 0.3,
    },
  ]);
  assert.equal(out.wins, 3);
  assert.equal(out.losses, 7);
  assert.equal(out.pushes, 1);
  assert.equal(out.pending, 2);
  assert.equal(out.decisive, 10);
  assert.equal(out.hitRate, 0.3);
});

test("aggregateBuckets: multiple rows summed; pushes/pending excluded from hit rate", () => {
  const out = aggregateBuckets([
    { wins: 2, losses: 8, pushes: 0, pending: 0, decisive: 10, hitRate: 0.2 },
    { wins: 4, losses: 6, pushes: 1, pending: 3, decisive: 10, hitRate: 0.4 },
  ]);
  assert.equal(out.wins, 6);
  assert.equal(out.losses, 14);
  assert.equal(out.pushes, 1);
  assert.equal(out.pending, 3);
  assert.equal(out.decisive, 20);
  assert.equal(out.hitRate, 6 / 20);
});

test("aggregateBuckets: rows with pending only → null hit rate (not 0%)", () => {
  // Important: 0 decisive must yield null, never 0/0 = NaN or 0%.
  const out = aggregateBuckets([
    { wins: 0, losses: 0, pushes: 0, pending: 5, decisive: 0, hitRate: null },
  ]);
  assert.equal(out.decisive, 0);
  assert.equal(out.hitRate, null);
  assert.equal(out.pending, 5);
});

test("emptyPublicParlayBucket: shape ready for UI render", () => {
  const e = emptyPublicParlayBucket();
  assert.equal(e.wins, 0);
  assert.equal(e.losses, 0);
  assert.equal(e.pushes, 0);
  assert.equal(e.pending, 0);
  assert.equal(e.decisive, 0);
  assert.equal(e.hitRate, null);
});
