/**
 * Guards for the cron-punctuality core.
 *
 * The load-bearing property is the REFUSAL, not the measurement: an hourly workflow must report no
 * delay rather than a flattering one. That refusal is what separates this module from the analysis
 * it replaced, which made hourly jobs look punctual by taking the distance to the nearest slot.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PUNCTUALITY_BANDS,
  attributeRuns,
  attributionHorizonMs,
  classifyDelay,
  MAX_ATTRIBUTION_MS,
  median,
  rollUp,
  summariseWorkflow,
} from "./cron-punctuality.mjs";

const MIN = 60_000;
const at = (iso) => Date.parse(iso);

test("classifyDelay separates a late run from an absent one", () => {
  assert.equal(classifyDelay(null), "MISSED");
  assert.equal(classifyDelay(0), "ON_TIME");
  assert.equal(classifyDelay(PUNCTUALITY_BANDS.ON_TIME_MAX_MIN), "ON_TIME");
  assert.equal(classifyDelay(PUNCTUALITY_BANDS.ON_TIME_MAX_MIN + 1), "DEGRADED");
  assert.equal(classifyDelay(PUNCTUALITY_BANDS.DEGRADED_MAX_MIN + 1), "SEVERE");
  // The whole point: MISSED and SEVERE are different words for different facts.
  assert.notEqual(classifyDelay(null), classifyDelay(600));
});

test("the pre-drift baseline is ON_TIME and the observed drift is SEVERE", () => {
  // Aug 22–26 observed: 19–41 min after the slot. That was always the cost of GitHub's scheduler
  // and must not be a finding, or the instrument cries wolf from the day it ships.
  for (const d of [19, 29, 41]) assert.equal(classifyDelay(d), "ON_TIME");
  // Sep 07–10 observed on the once-daily band: 197–313 min.
  for (const d of [197, 221, 288, 313]) assert.equal(classifyDelay(d), "SEVERE");
});

test("attributionHorizonMs is the smallest gap, and Infinity when no gap exists", () => {
  assert.equal(attributionHorizonMs([0, 60 * MIN, 180 * MIN]), 60 * MIN);
  assert.equal(attributionHorizonMs([]), Infinity);
  // A single slot places NO upper bound on attribution. Returning 0 here would silently mark every
  // such workflow unmeasurable, which is the opposite of the truth.
  assert.equal(attributionHorizonMs([at("2026-09-10T13:30:00Z")]), Infinity);
});

test("a run four hours after a daily slot is that slot's run, late — not a miss", () => {
  const slots = [at("2026-09-09T13:30:00Z"), at("2026-09-10T13:30:00Z")];
  const runs = [at("2026-09-09T17:11:00Z")];
  const pairs = attributeRuns(slots, runs, { nowMs: at("2026-09-10T23:00:00Z") });
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].delayMin, 221);
  assert.equal(pairs[0].state, "SEVERE");
  // cron-slots reports exactly this case as MISSED, because 221 min exceeds its ±2h tolerance.
  // Here it is served-and-late, which is the distinction the whole module exists to draw.
  assert.equal(pairs[1].state, "MISSED");
});

test("a run is never credited to two slots", () => {
  const slots = [at("2026-09-09T13:30:00Z"), at("2026-09-10T13:30:00Z")];
  const runs = [at("2026-09-10T14:00:00Z")];
  const pairs = attributeRuns(slots, runs, { nowMs: at("2026-09-11T20:00:00Z") });
  const served = pairs.filter((p) => p.runMs !== null);
  assert.equal(served.length, 1, "one run may serve exactly one slot");
  assert.equal(pairs[0].state, "MISSED");
  assert.equal(served[0].delayMin, 30);
});

test("a run BEFORE its slot never serves it", () => {
  const slots = [at("2026-09-10T13:30:00Z")];
  const runs = [at("2026-09-10T13:29:00Z")];
  const pairs = attributeRuns(slots, runs, { nowMs: at("2026-09-11T20:00:00Z"), horizonMs: 24 * 60 * MIN });
  assert.equal(pairs[0].state, "MISSED", "an early run is a different event, not this slot's");
});

test("slots too recent to judge are excluded rather than reported missed", () => {
  const slots = [at("2026-09-10T13:30:00Z")];
  // Ten minutes past the slot, with a 24h horizon: the run may still be coming.
  const pairs = attributeRuns(slots, [], { nowMs: at("2026-09-10T13:40:00Z"), horizonMs: 24 * 60 * MIN });
  assert.equal(pairs.length, 0, "a slot whose horizon has not elapsed has not been missed");
});

test("an hourly workflow REFUSES to report a delay", () => {
  // 22:05 could be the 22:00 slot 5 min late or the 21:00 slot 65 min late. Nothing in the run list
  // decides it, so the honest output is no number.
  const slots = [];
  for (let h = 12; h <= 22; h += 1) slots.push(at(`2026-09-09T${String(h).padStart(2, "0")}:00:00Z`));
  const runs = slots.map((s) => s + 5 * MIN);
  const row = summariseWorkflow({
    workflow: "publication-watchdog.yml",
    crons: ["0 12-22 * * *"],
    slots,
    runMs: runs,
    nowMs: at("2026-09-10T20:00:00Z"),
  });
  assert.equal(row.attributable, false);
  assert.equal(row.medianDelayMinutes, null, "no flattering 5-minute median");
  assert.equal(row.maxDelayMinutes, null);
  assert.deepEqual(row.samples, []);
  assert.equal(row.state, "NOT_ATTRIBUTABLE");
});

test("a once-daily workflow IS attributable and reports the real median", () => {
  const slots = [
    at("2026-09-07T13:30:00Z"),
    at("2026-09-08T13:30:00Z"),
    at("2026-09-09T13:30:00Z"),
  ];
  const runs = [
    at("2026-09-07T18:18:00Z"), // 288
    at("2026-09-08T17:18:00Z"), // 228
    at("2026-09-09T17:11:00Z"), // 221
  ];
  const row = summariseWorkflow({
    workflow: "morning-projections.yml",
    crons: ["30 13 * * *"],
    slots,
    runMs: runs,
    nowMs: at("2026-09-10T12:00:00Z"),
  });
  assert.equal(row.attributable, true);
  assert.equal(row.servedSlots, 3);
  assert.equal(row.missedSlots, 0);
  assert.equal(row.medianDelayMinutes, 228);
  assert.equal(row.maxDelayMinutes, 288);
  assert.equal(row.state, "SEVERE");
});

test("median takes an observed value, never an interpolated one", () => {
  assert.equal(median([]), null);
  assert.equal(median([10, 20]), 10, "even length must not invent 15");
  assert.equal(median([5, 1, 3]), 3);
});

test("rollUp judges on measurable rows and on the median, not the worst", () => {
  const rows = [
    { workflow: "a", attributable: true, medianDelayMinutes: 221, missedSlots: 0 },
    { workflow: "b", attributable: true, medianDelayMinutes: 249, missedSlots: 1 },
    { workflow: "c", attributable: false, medianDelayMinutes: null, missedSlots: 0 },
  ];
  const r = rollUp(rows);
  assert.equal(r.measurableWorkflows, 2);
  assert.equal(r.unmeasurableWorkflows, 1);
  assert.equal(r.fleetMedianDelayMinutes, 221);
  assert.equal(r.worstWorkflow, "b");
  assert.equal(r.missedTotal, 1);
  assert.equal(r.state, "SEVERE");
});

test("rollUp is UNKNOWN — never green — when nothing could be measured", () => {
  const r = rollUp([{ workflow: "a", attributable: false, medianDelayMinutes: null, missedSlots: 0 }]);
  assert.equal(r.fleetMedianDelayMinutes, null);
  assert.equal(r.state, "UNKNOWN", "an instrument that measured nothing must not report health");
});

/* MUTATION PROBES — a guard that passes against a broken core is worth nothing, and this repo has
   shipped several. Each probe asserts the test above would actually catch the break. */
test("probe: widening the horizon to swallow the drift would break attribution", () => {
  // If someone 'fixed' the alarm by treating any run within 8h as on time, this must fail.
  const slots = [at("2026-09-09T13:30:00Z")];
  const runs = [at("2026-09-09T17:11:00Z")];
  const pairs = attributeRuns(slots, runs, { nowMs: at("2026-09-10T23:00:00Z"), horizonMs: 8 * 60 * MIN });
  assert.equal(pairs[0].delayMin, 221, "the delay is a measurement; a wider horizon must not shrink it");
  assert.equal(pairs[0].state, "SEVERE", "and must not reclassify it");
});

test("probe: raising ON_TIME_MAX_MIN past the observed drift would silence the finding", () => {
  // Pin the band. Moving it to 240 would make every SEVERE row above read ON_TIME — the exact shape
  // of renegotiating a bar after seeing the result.
  assert.equal(PUNCTUALITY_BANDS.ON_TIME_MAX_MIN, 60);
  assert.equal(PUNCTUALITY_BANDS.DEGRADED_MAX_MIN, 120);
  assert.ok(
    PUNCTUALITY_BANDS.DEGRADED_MAX_MIN < 197,
    "the bands must sit BELOW the observed drift or the instrument cannot report it",
  );
});

test("today's slot is judgeable today — the horizon cap, not the 24h gap", () => {
  // Regression: judging on a daily job's natural 24h gap meant TODAY was never judgeable, so the
  // board could only ever describe yesterday — an instrument permanently a day behind the outage
  // it watches. The cap is what makes the newest row real.
  const slots = [at("2026-09-09T13:30:00Z"), at("2026-09-10T13:30:00Z")];
  const pairs = attributeRuns(slots, [at("2026-09-09T17:11:00Z")], { nowMs: at("2026-09-10T23:00:00Z") });
  assert.equal(pairs.length, 2, "both slots judged, including today's");
  assert.equal(pairs[1].state, "MISSED");
});

test("attribution and judgement share ONE horizon", () => {
  // If judgement were tighter than attribution, this slot would be MISSED at 3h and then also be
  // served by the 4h run — two answers for one slot.
  const slots = [at("2026-09-10T13:30:00Z"), at("2026-09-11T13:30:00Z")];
  const late = at("2026-09-10T17:30:00Z"); // 4h
  const judgedEarly = attributeRuns(slots, [], { nowMs: at("2026-09-10T16:30:00Z") });
  assert.equal(judgedEarly.length, 0, "at 3h the slot is not yet declared missed");
  const judgedAfter = attributeRuns(slots, [late], { nowMs: at("2026-09-10T22:00:00Z") });
  assert.equal(judgedAfter[0].delayMin, 240, "and when the run lands it is served-and-late");
  assert.equal(judgedAfter[0].state, "SEVERE");
});

test("MAX_ATTRIBUTION_MS sits above the worst observed drift", () => {
  // 313 min was the worst measured on 2026-09-10. A cap below it would reclassify the very drift
  // this module was built to name as a missing run.
  assert.ok(MAX_ATTRIBUTION_MS / 60000 > 313, "a late run must stay late, not become missed");
});

test("an unattributable workflow reports COVERAGE, never a miss count", () => {
  // Regression, measured on the real fleet: reporting slot-level misses at this cadence produced
  // 221 "missed" slots that were pure arithmetic — every run happened, none within a 30-minute
  // horizon of its slot. "We cannot tell" must never be written down as "none were missed".
  const slots = [];
  for (let i = 0; i < 20; i += 1) slots.push(at("2026-09-09T00:00:00Z") + i * 30 * MIN);
  const runs = slots.map((s) => s + 4 * 60 * MIN); // every run fired, all four hours late
  const row = summariseWorkflow({
    workflow: "publication-watchdog.yml",
    crons: ["0,30 * * * *"],
    slots,
    runMs: runs,
    nowMs: at("2026-09-10T20:00:00Z"),
  });
  assert.equal(row.attributable, false);
  assert.equal(row.missedSlots, null, "not 0 — the honest answer is that we cannot tell");
  assert.equal(row.servedSlots, null);
  assert.equal(row.observedRuns, 20);
  assert.equal(row.coverageRatio, 1, "20 runs owed, 20 produced");
  assert.equal(row.state, "NOT_ATTRIBUTABLE", "full coverage is not an alarm, whatever the pairing");
});

test("a real outage is still caught at an unattributable cadence", () => {
  const slots = [];
  for (let i = 0; i < 20; i += 1) slots.push(at("2026-09-09T00:00:00Z") + i * 30 * MIN);
  const row = summariseWorkflow({
    workflow: "publication-watchdog.yml",
    crons: ["0,30 * * * *"],
    slots,
    runMs: [slots[0] + MIN, slots[1] + MIN], // owed 20, produced 2
    nowMs: at("2026-09-10T20:00:00Z"),
  });
  assert.equal(row.coverageRatio, 0.1);
  assert.equal(row.state, "UNDER_COVERED", "a window-level shortfall stays decidable");
});

test("rollUp never sums an unknown miss count as zero", () => {
  const r = rollUp([
    { workflow: "a", attributable: true, medianDelayMinutes: 200, missedSlots: 2, state: "SEVERE" },
    { workflow: "b", attributable: false, medianDelayMinutes: null, missedSlots: null, state: "NOT_ATTRIBUTABLE" },
    { workflow: "c", attributable: false, medianDelayMinutes: null, missedSlots: null, state: "UNDER_COVERED" },
  ]);
  assert.equal(r.missedTotal, 2, "only the row that could be judged contributes");
  assert.deepEqual(r.underCoveredWorkflows, ["c"], "and a shortfall is named rather than summed away");
});
