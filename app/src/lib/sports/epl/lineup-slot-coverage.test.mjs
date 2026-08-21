/**
 * Lineup-slot coverage — the precondition for a coherent player simulation.
 *
 * Run: npx tsx --test src/lib/sports/epl/lineup-slot-coverage.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { kickoffClusters, lineupSlotCoverage, latestSlotBefore, parseCronSlots } from "./lineup-slot-coverage.mjs";

const APP = process.cwd();
const WORKFLOW = fs.readFileSync(path.join(APP, "..", ".github/workflows/epl-matchweek.yml"), "utf8");
const FIXTURE_DIR = path.join(APP, "public/data/soccer/epl/fixtures");
const capture = JSON.parse(
  fs.readFileSync(path.join(FIXTURE_DIR, fs.readdirSync(FIXTURE_DIR).find((f) => f.startsWith("capture-"))), "utf8"),
);

test("slots are read from the WORKFLOW, never from a second copy of the cadence", () => {
  const slots = parseCronSlots(WORKFLOW);
  assert.ok(slots.length >= 6, `expected the matchweek crons, parsed ${slots.length}`);
  for (const s of slots) {
    assert.ok(Number.isInteger(s.hour) && s.hour >= 0 && s.hour <= 23, `bad hour ${s.hour}`);
    assert.ok(Number.isInteger(s.minute) && s.minute >= 0 && s.minute <= 59, `bad minute ${s.minute}`);
    assert.ok(Number.isInteger(s.dow) && s.dow >= 0 && s.dow <= 6, `bad dow ${s.dow}`);
  }
});

test("fixtures sharing a kickoff instant are ONE cluster, and carry their fixture count", () => {
  const clusters = kickoffClusters(
    [
      { eventId: "a", kickoffIso: "2026-08-22T14:00:00Z" },
      { eventId: "b", kickoffIso: "2026-08-22T14:00:00Z" },
      { eventId: "c", kickoffIso: "2026-08-22T14:00:00Z" },
      { eventId: "d", kickoffIso: "2026-08-22T16:30:00Z" },
    ],
    { fromIso: "2026-08-22T00:00:00Z", toIso: "2026-08-23T00:00:00Z" },
  );
  assert.equal(clusters.length, 2, "one refresh serves every match at the same instant");
  assert.equal(clusters[0].fixtures, 3);
});

test("a slot the EVENING BEFORE an early kickoff still counts — coverage is not assumed same-day", () => {
  // Sunday 23:00 UTC slot (dow 0) against a Monday 00:30 kickoff: a 1.5h lead across a date change.
  // Assuming the slot shares the kickoff's weekday would call this uncovered.
  const kickoff = Date.parse("2026-08-24T00:30:00Z"); // Monday
  const at = latestSlotBefore(kickoff, { hour: 23, minute: 0, dow: 0 }); // Sunday
  assert.equal(new Date(at).toISOString(), "2026-08-23T23:00:00.000Z");
});

test("a slot too EARLY is not coverage — it can never see a lineup that does not exist yet", () => {
  const clusters = kickoffClusters([{ eventId: "x", kickoffIso: "2026-08-22T14:00:00Z" }], { fromIso: "2026-08-22T00:00:00Z", toIso: "2026-08-23T00:00:00Z" });
  const out = lineupSlotCoverage(clusters, [{ hour: 7, minute: 0, dow: 6 }]); // 7h ahead
  assert.equal(out.uncovered.length, 1);
  assert.equal(out.clusters[0].nearestLeadHours, 7, "the lead is reported, not hidden");
  assert.equal(out.clusters[0].covered, false);
});

test("a slot AT kickoff is not coverage — the engine refuses a run at or after the start", () => {
  const clusters = kickoffClusters([{ eventId: "x", kickoffIso: "2026-08-22T14:00:00Z" }], { fromIso: "2026-08-22T00:00:00Z", toIso: "2026-08-23T00:00:00Z" });
  const out = lineupSlotCoverage(clusters, [{ hour: 14, minute: 0, dow: 6 }]);
  assert.equal(out.clusters[0].covered, false, "zero lead is not a lead");
  assert.equal(out.clusters[0].nearestLeadHours, null, "a slot at kickoff is no slot at all, not a 0h one");
});

test("an uncovered cluster reports MATCHES, not clusters — three at 14:00 is three gaps", () => {
  const clusters = kickoffClusters(
    [
      { eventId: "a", kickoffIso: "2026-08-22T14:00:00Z" },
      { eventId: "b", kickoffIso: "2026-08-22T14:00:00Z" },
      { eventId: "c", kickoffIso: "2026-08-22T14:00:00Z" },
    ],
    { fromIso: "2026-08-22T00:00:00Z", toIso: "2026-08-23T00:00:00Z" },
  );
  const out = lineupSlotCoverage(clusters, [{ hour: 7, minute: 0, dow: 6 }]);
  assert.equal(out.totalClusters, 1);
  assert.equal(out.uncoveredFixtures, 3, "one uncovered slot is three matches without a lineup-aware run");
});

/*
 * THE LIVE CHECK. Against the committed season capture and the real workflow, so a schedule change
 * that leaves a cluster unserved fails here rather than being discovered from an empty product.
 */
test("LIVE · every kickoff cluster in the next fortnight has a slot inside the lineup window", () => {
  const slots = parseCronSlots(WORKFLOW);
  // Anchored to the capture's OWN season start rather than to a clock, so the window cannot rot and
  // the test does not quietly change what it covers depending on the day it runs.
  const start = capture.rows.map((r) => Date.parse(r.kickoffIso)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  assert.ok(Number.isFinite(start), "the capture must carry kickoffs");
  const clusters = kickoffClusters(capture.rows, {
    fromIso: new Date(start).toISOString(),
    toIso: new Date(start + 14 * 86_400_000).toISOString(),
  });
  assert.ok(clusters.length >= 6, `expected a real fixture list, got ${clusters.length} cluster(s)`);

  const out = lineupSlotCoverage(clusters, slots);
  const detail = out.uncovered.map((u) => `${u.kickoffIso} (${u.fixtures} match(es), nearest lead ${u.nearestLeadHours}h)`).join("; ");
  assert.equal(out.uncoveredFixtures, 0, `matches with no lineup-time refresh: ${detail}`);
});
