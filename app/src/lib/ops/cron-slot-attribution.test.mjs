/**
 * SLOT ATTRIBUTION — late is not absent, and one run is not three runs (2026-09-25).
 *
 * The watchdog reported 26 missed slots across five sports and every one I checked had a successful
 * run behind it. Measured cause: nfl-event-window's scheduled delivery over 14 days was min 1h40m,
 * median 2h52m, max 4h55m late (n=40, not one punctual run), against a ±2h symmetric membership
 * window. Three defects — a tolerance narrower than the delay, INDEPENDENT membership so one run
 * could satisfy several slots, and a symmetric window so a run BEFORE a slot could claim it.
 *
 * These tests pin the repaired rule with the delays actually observed here, so a future tolerance
 * change that reintroduces the conflation fails rather than going quiet.
 *
 * Run: npx tsx --test src/lib/ops/cron-slot-attribution.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { expectedSlots, missedSlots, slotAttribution } from "./cron-slots.mjs";
import { attributeRuns } from "./cron-punctuality.mjs";

const ms = (iso) => Date.parse(iso);
const MIN = 60_000;

test("a delayed-but-successful run is NOT missed — at every delay this fleet actually produces", () => {
  const slot = ms("2026-09-22T13:00:00Z");
  const now = ms("2026-09-23T12:00:00Z");
  /* The real distribution: min 1h40m, median 2h52m, max 4h55m. Every one of these was reported
     MISSED by the ±2h rule, and every one of them is a run that happened. */
  for (const delayMin of [100, 172, 271, 295, 313]) {
    assert.deepEqual(missedSlots([slot], [slot + delayMin * MIN], { nowMs: now }), [],
      `a run ${delayMin} minutes late is late, not absent`);
  }
});

test("ONE RUN CANNOT SATISFY MULTIPLE SLOTS", () => {
  /*
   * ⚠ MY FIRST VERSION OF THIS TEST WAS VACUOUS and a mutation probe caught it: I placed one run
   * against two slots 8h apart, and it was the HORIZON that excluded the earlier slot, not the
   * consumption rule. Deleting the `used` set left the test green. The rule needs a run that is
   * genuinely eligible for several slots at once, which happens exactly when a horizon is widened
   * past the schedule's own gap — the obvious "fix" someone reaches for when a dense workflow
   * starts reporting false misses, and the one that would silently turn one run into three.
   */
  const T = ms("2026-09-22T13:00:00Z");
  const slots = [T, T + 60 * MIN, T + 120 * MIN];
  /* ⚠ AND THE RUN MUST LAND AFTER **ALL** THE SLOTS. My second attempt put it at T+30m, where the
     backwards guard (a run before its slot is not that slot's run) excluded it from the later two —
     so the probe stayed green again for a second wrong reason. At T+3h it is genuinely eligible for
     all three, and only the consumption rule stops it being counted three times. */
  const pairs = attributeRuns(slots, [T + 180 * MIN], { nowMs: T + 48 * 60 * MIN, horizonMs: 6 * 60 * MIN });
  const served = pairs.filter((p) => p.runMs !== null);
  assert.equal(served.length, 1, "one run serves exactly one slot, however wide the horizon");
  assert.equal(served[0].slotMs, T, "and it serves the earliest slot it could belong to");
  assert.deepEqual(pairs.filter((p) => p.runMs === null).map((p) => p.slotMs), [T + 60 * MIN, T + 120 * MIN],
    "the slots that got nothing are named, not silently credited to the same run");

  /* And a run must never be credited BACKWARDS to a slot it cannot have served. */
  const b = ms("2026-09-22T21:00:00Z");
  const before = slotAttribution([b], [b - 10 * MIN], { nowMs: ms("2026-09-23T12:00:00Z") });
  assert.deepEqual(before.missed, [b], "a run before its slot is not that slot's run");
});

test("a genuinely missed slot IS detected — the whole point of keeping the alarm", () => {
  const slots = [ms("2026-09-20T13:00:00Z"), ms("2026-09-21T13:00:00Z"), ms("2026-09-22T13:00:00Z")];
  const now = ms("2026-09-23T12:00:00Z");
  /* Two ran (both late, as this fleet does); the middle day never fired at all. */
  const runs = [slots[0] + 190 * MIN, slots[2] + 240 * MIN];
  const r = slotAttribution(slots, runs, { nowMs: now });
  assert.equal(r.attributable, true);
  assert.deepEqual(r.missed, [slots[1]], "the day nothing fired is named");
  assert.equal(r.servedSlots, 2);
});

test("a slot still inside its horizon is not yet judgeable — no permanent false finding", () => {
  const slot = ms("2026-09-25T13:00:00Z");
  const now = slot + 3 * 60 * MIN; // 3h late, still plausibly coming on this fleet
  assert.deepEqual(missedSlots([slot], [], { nowMs: now }), [],
    "a run that may still arrive has not been missed");
  /* But once the horizon has genuinely elapsed it must be reported. */
  assert.deepEqual(missedSlots([slot], [], { nowMs: slot + 9 * 60 * MIN }), [slot],
    "past the attribution horizon, nothing arrived and that is a miss");
});

test("a schedule too dense to attribute REFUSES rather than inventing misses", () => {
  /*
   * ⚠ This is the false-alarm engine. With slots 30 minutes apart and runs hours late, no run lands
   * within any slot's gap, so a naive rule marks every slot missed while every run happened. The
   * honest answer is that a slot-level verdict is unavailable at this cadence — reported as
   * attributable:false with a window-level coverage ratio, never as zero misses.
   */
  const base = ms("2026-09-22T13:00:00Z");
  const slots = expectedSlots(["0,30 13 * * *"], base - MIN, base + 60 * MIN);
  assert.ok(slots.length >= 2, "fixture must produce a dense schedule");
  const runs = slots.map((s) => s + 200 * MIN);
  const r = slotAttribution(slots, runs, { nowMs: base + 24 * 60 * MIN });
  assert.equal(r.attributable, false, "30-minute spacing cannot separate a late run from an absent one");
  assert.deepEqual(r.missed, [], "a refusal reports no misses...");
  assert.equal(r.servedSlots, null, "...and says so, rather than claiming they were served");
  assert.ok(r.coverageRatio >= 1, "coverage is the answer that IS available at this cadence");
});
