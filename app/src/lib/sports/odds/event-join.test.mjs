/**
 * Odds event-join guards (Program 167 · Release C): identity is joined, never minted.
 * Run: npx tsx --test src/lib/sports/odds/event-join.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { joinOddsEventToSchedule, joinOddsBatch } from "./event-join.mjs";

const SCHEDULE = [
  { canonicalEventId: "nfl-401873272", home: "Cincinnati Bengals", away: "Detroit Lions", startTimeUtc: "2026-08-13T23:00:00Z" },
  { canonicalEventId: "nfl-401873280", home: "New York Giants", away: "New York Jets", startTimeUtc: "2026-08-15T00:00:00Z" },
];

test("aligned join carries canonical id, provider lineage, start delta", () => {
  const r = joinOddsEventToSchedule(
    { providerEventId: "odds-1", home: "Cincinnati Bengals", away: "Detroit Lions", scheduledStartUtc: "2026-08-13T23:00:00Z" },
    SCHEDULE,
  );
  assert.equal(r.state, "JOINED");
  assert.equal(r.canonicalEventId, "nfl-401873272");
  assert.equal(r.orientation, "ALIGNED");
  assert.equal(r.startDeltaMinutes, 0);
});

test("swapped corners join but are REPORTED, never silently flipped", () => {
  const r = joinOddsEventToSchedule(
    { providerEventId: "odds-2", home: "Detroit Lions", away: "Cincinnati Bengals", scheduledStartUtc: "2026-08-13T23:00:00Z" },
    SCHEDULE,
  );
  assert.equal(r.state, "JOINED");
  assert.equal(r.orientation, "SWAPPED");
});

test("no candidate within tolerance → UNMATCHED; never nearest-neighbor", () => {
  const r = joinOddsEventToSchedule(
    { providerEventId: "odds-3", home: "Cincinnati Bengals", away: "Detroit Lions", scheduledStartUtc: "2026-08-14T02:00:00Z" },
    SCHEDULE,
    { startToleranceMinutes: 45 },
  );
  assert.equal(r.state, "UNMATCHED");
});

test("two candidates → AMBIGUOUS with both ids named", () => {
  const doubleheader = [
    ...SCHEDULE,
    { canonicalEventId: "nfl-401873272-g2", home: "Cincinnati Bengals", away: "Detroit Lions", startTimeUtc: "2026-08-13T23:30:00Z" },
  ];
  const r = joinOddsEventToSchedule(
    { providerEventId: "odds-4", home: "Cincinnati Bengals", away: "Detroit Lions", scheduledStartUtc: "2026-08-13T23:10:00Z" },
    doubleheader,
  );
  assert.equal(r.state, "AMBIGUOUS");
  assert.equal(r.candidateIds.length, 2);
});

test("provider id re-joining a different canonical event is a LINEAGE_VIOLATION", () => {
  const r = joinOddsEventToSchedule(
    { providerEventId: "odds-5", home: "Cincinnati Bengals", away: "Detroit Lions", scheduledStartUtc: "2026-08-13T23:00:00Z" },
    SCHEDULE,
    { lineage: { "odds-5": "nfl-SOMETHING-ELSE" } },
  );
  assert.equal(r.state, "LINEAGE_VIOLATION");
  assert.equal(r.previousCanonicalEventId, "nfl-SOMETHING-ELSE");
});

test("batch join: population-exact accounting and in-batch lineage growth", () => {
  const res = joinOddsBatch(
    [
      { providerEventId: "odds-6", home: "Cincinnati Bengals", away: "Detroit Lions", scheduledStartUtc: "2026-08-13T23:00:00Z" },
      { providerEventId: "odds-7", home: "Nowhere FC", away: "Detroit Lions", scheduledStartUtc: "2026-08-13T23:00:00Z" },
    ],
    SCHEDULE,
  );
  assert.equal(res.accounting.input, 2);
  assert.equal(res.accounting.joined + res.accounting.quarantined, 2);
  assert.equal(res.lineage["odds-6"], "nfl-401873272");
});

test("alias normalizer is injectable — sport-specific names resolve through it", () => {
  const alias = (n) => ({ "cincy": "cincinnati bengals", "det lions": "detroit lions" }[String(n).toLowerCase()] ?? String(n).toLowerCase());
  const r = joinOddsEventToSchedule(
    { providerEventId: "odds-8", home: "CINCY", away: "DET LIONS", scheduledStartUtc: "2026-08-13T23:00:00Z" },
    SCHEDULE,
    { normalizeName: alias },
  );
  assert.equal(r.state, "JOINED");
});
