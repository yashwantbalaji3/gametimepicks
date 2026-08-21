/**
 * The anchor rule, including the incident that produced it.
 *
 * Run: npx tsx --test src/lib/sports/nfl/slate-anchor.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveSlateAnchor, etDay } from "./slate-anchor.mjs";

/** The real 2026-08-21 shape: index frozen a day behind, schedule refreshed past it. */
const STALE_INDEX = { nextKickoffUtc: "2026-08-21T00:00Z" };   // ET 2026-08-20 — every game finished
const SCHEDULE = [
  { dateUtc: "2026-08-21T23:00Z", shortName: "NYJ @ PIT" },     // ET 2026-08-21
  { dateUtc: "2026-08-21T23:30Z", shortName: "CAR @ JAX" },
  { dateUtc: "2026-08-22T01:00Z", shortName: "GB @ DEN" },      // ET 2026-08-21, late window
  { dateUtc: "2026-08-22T16:00Z", shortName: "WSH @ DET" },     // ET 2026-08-22
];

test("THE INCIDENT · a stale anchor no scheduled game corroborates is not the slate", () => {
  const out = deriveSlateAnchor(STALE_INDEX, SCHEDULE);
  assert.equal(out.source, "SCHEDULE", "the schedule takes over when it cannot corroborate the index");
  assert.equal(out.slateDay, etDay("2026-08-21T23:00Z"), "the earliest genuinely scheduled game anchors instead");
  // The whole point: the selected day must contain games. An empty slate day was the bug.
  assert.ok(SCHEDULE.some((r) => etDay(r.dateUtc) === out.slateDay));
});

test("a FRESH index is trusted — the fallback must not quietly take over a working pipeline", () => {
  const out = deriveSlateAnchor({ nextKickoffUtc: "2026-08-22T16:00Z" }, SCHEDULE);
  assert.equal(out.source, "INDEX", "corroborated means the index still owns the answer");
  assert.equal(out.slateDay, etDay("2026-08-22T16:00Z"));
});

test("corroboration is by ET DAY, not by exact instant", () => {
  // The index anchors the 23:00 opener; the schedule's earliest row for that day is a different
  // kickoff entirely. Same day, so the index is corroborated — requiring an exact match would send
  // a perfectly fresh index down the fallback every time a game was added or re-timed.
  const out = deriveSlateAnchor({ nextKickoffUtc: "2026-08-21T23:30Z" }, SCHEDULE);
  assert.equal(out.source, "INDEX");
});

test("a late-night kickoff belongs to the ET day it starts in, not the UTC one", () => {
  // 2026-08-22T01:00Z is 21:00 ET on 2026-08-21 — the same slate as the 23:00Z opener, and the
  // reason this rule works in ET at all. A UTC day would split one evening across two slates.
  assert.equal(etDay("2026-08-22T01:00Z"), etDay("2026-08-21T23:00Z"));
});

test("an ABSENT index falls back rather than rendering nothing", () => {
  assert.equal(deriveSlateAnchor(null, SCHEDULE).source, "SCHEDULE");
  assert.equal(deriveSlateAnchor({}, SCHEDULE).source, "SCHEDULE");
});

test("an empty schedule is NONE — never a confident day built from no games", () => {
  const out = deriveSlateAnchor(null, []);
  assert.equal(out.source, "NONE");
  assert.equal(out.slateDay, null);
  assert.equal(out.anchorUtc, null);
});

test("an index with nothing to corroborate it is named as such, never dressed up as INDEX", () => {
  // Schedule unreadable or empty while the index still carries an anchor. The day is returned so the
  // page has something to say, but the state is distinguishable — a caller must be able to tell a
  // corroborated slate from an uncorroborated guess, which is exactly what the outage destroyed.
  const out = deriveSlateAnchor(STALE_INDEX, []);
  assert.equal(out.source, "INDEX_UNCORROBORATED");
  assert.equal(out.slateDay, etDay("2026-08-21T00:00Z"));
});

test("the rule takes NO view of the current time", () => {
  // /nfl is statically exported. A build-time clock would rot exactly like the anchor it replaces,
  // so the same inputs must always give the same answer no matter when the build runs.
  const a = deriveSlateAnchor(STALE_INDEX, SCHEDULE);
  const b = deriveSlateAnchor(STALE_INDEX, SCHEDULE);
  assert.deepEqual(a, b);
});
