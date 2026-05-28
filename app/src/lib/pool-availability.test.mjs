/**
 * Tests for the pool availability classifier. Pure mapping from
 * `OptimizerSnapshot.sourcePools` + per-bucket slip counts to a
 * per-sport state. Guards the "honest about missing data" contract.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPoolAvailability,
  hasPoolWithoutSlips,
} from "./pool-availability.ts";

function fakePayload(
  nbaCount,
  mlbCount,
  bucketCounts /* { profile: { nba, mlb, multi, all } } */,
) {
  return {
    date: "2026-05-28",
    generatedAt: "2026-05-28T00:00:00Z",
    totalSlips: 0,
    sourcePools: { nbaCount, mlbCount },
    buckets: Object.fromEntries(
      Object.entries(bucketCounts).map(([profile, counts]) => [
        profile,
        {
          nba: Array.from({ length: counts.nba ?? 0 }, () => ({})),
          mlb: Array.from({ length: counts.mlb ?? 0 }, () => ({})),
          multi: Array.from({ length: counts.multi ?? 0 }, () => ({})),
          all: Array.from({ length: counts.all ?? 0 }, () => ({})),
        },
      ]),
    ),
  };
}

test("null payload → all sports absent", () => {
  const p = classifyPoolAvailability(null);
  assert.deepEqual(p, { nba: "absent", mlb: "absent", multi: "absent" });
  assert.equal(hasPoolWithoutSlips(p), false);
});

test("undefined payload → all sports absent", () => {
  const p = classifyPoolAvailability(undefined);
  assert.deepEqual(p, { nba: "absent", mlb: "absent", multi: "absent" });
});

test("nbaCount=0 and mlbCount=0 → both absent, multi absent", () => {
  const p = classifyPoolAvailability(fakePayload(0, 0, {}));
  assert.equal(p.nba, "absent");
  assert.equal(p.mlb, "absent");
  assert.equal(p.multi, "absent");
});

test("NBA pool loaded but no NBA slips produced → pool-but-no-slips", () => {
  // Live 2026-05-28 case: NBA board exists (91 leans) but all are
  // R1-downgraded to No Play, so zero NBA-only and zero Mixed slips.
  const p = classifyPoolAvailability(
    fakePayload(91, 259, {
      conservative: { mlb: 8, nba: 0, multi: 0, all: 8 },
      balanced:     { mlb: 8, nba: 0, multi: 0, all: 8 },
      aggressive:   { mlb: 8, nba: 0, multi: 0, all: 8 },
      star_power:   { mlb: 8, nba: 0, multi: 0, all: 8 },
    }),
  );
  assert.equal(p.nba, "pool-but-no-slips");
  assert.equal(p.mlb, "present");
  assert.equal(p.multi, "pool-but-no-slips");
  assert.equal(hasPoolWithoutSlips(p), true);
});

test("both pools producing slips → both present, multi present", () => {
  const p = classifyPoolAvailability(
    fakePayload(91, 259, {
      conservative: { mlb: 6, nba: 4, multi: 3, all: 13 },
    }),
  );
  assert.equal(p.nba, "present");
  assert.equal(p.mlb, "present");
  assert.equal(p.multi, "present");
  assert.equal(hasPoolWithoutSlips(p), false);
});

test("NBA absent (board not generated) — not flagged as 'pool-but-no-slips'", () => {
  // We only want the diagnostic banner when the raw pool is loaded but
  // produced nothing — pre-board state stays calm.
  const p = classifyPoolAvailability(
    fakePayload(0, 259, {
      conservative: { mlb: 8, nba: 0, multi: 0, all: 8 },
    }),
  );
  assert.equal(p.nba, "absent");
  assert.equal(p.mlb, "present");
  assert.equal(p.multi, "absent");
  assert.equal(hasPoolWithoutSlips(p), false);
});

test("Mixed-only failure: both pools present but no multi slips → multi pool-but-no-slips", () => {
  // Hypothetical: both NBA and MLB produce single-sport slips, but
  // mixed generation rejects them all (e.g. correlation caps).
  const p = classifyPoolAvailability(
    fakePayload(91, 259, {
      conservative: { mlb: 6, nba: 4, multi: 0, all: 10 },
    }),
  );
  assert.equal(p.nba, "present");
  assert.equal(p.mlb, "present");
  assert.equal(p.multi, "pool-but-no-slips");
  assert.equal(hasPoolWithoutSlips(p), true);
});

test("missing buckets / missing sourcePools handled safely", () => {
  const partial = {
    date: "2026-05-28",
    generatedAt: "2026-05-28T00:00:00Z",
    totalSlips: 0,
    sourcePools: { nbaCount: 0, mlbCount: 0 },
    buckets: {},
  };
  const p = classifyPoolAvailability(partial);
  assert.equal(p.nba, "absent");
  assert.equal(p.mlb, "absent");
});
