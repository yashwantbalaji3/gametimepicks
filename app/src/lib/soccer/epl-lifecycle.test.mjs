/**
 * Fixture lifecycle — every state has a rule, and the absence of a rule is itself a rule.
 *
 * Run: npx tsx --test src/lib/soccer/epl-lifecycle.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  isGradeable,
  isTerminalWithoutResult,
  mapFixtureLifecycle,
  readLifecycle,
  readLifecycleFromStatus,
} from "./epl-lifecycle.ts";

test("SCHEDULED does not settle, and that is not a failure", () => {
  const r = readLifecycle("SCHEDULED");
  assert.equal(r.disposition, "NO_SETTLEMENT");
  assert.equal(isGradeable("SCHEDULED"), false);
});

test("FINAL_FT is the only state that grades", () => {
  assert.equal(readLifecycle("FINAL_FT").disposition, "GRADE");
  const all = ["SCHEDULED", "FINAL_FT", "POSTPONED", "ABANDONED", "REPLAYED", "FINAL_AET", "FINAL_PEN", "UNKNOWN"];
  assert.deepEqual(all.filter(isGradeable), ["FINAL_FT"]);
});

test("POSTPONED voids every market and never rolls over", () => {
  const r = readLifecycle("POSTPONED");
  assert.equal(r.disposition, "VOID_ALL");
  assert.equal(isTerminalWithoutResult("POSTPONED"), true);
  assert.match(r.reason, /new event identity/);
});

test("ABANDONED voids every market absent an official completed result", () => {
  const r = readLifecycle("ABANDONED");
  assert.equal(r.disposition, "VOID_ALL");
  assert.equal(isTerminalWithoutResult("ABANDONED"), true);
  assert.match(r.reason, /not completed/);
});

test("REPLAYED settles under its own identity, not the fixture it replaces", () => {
  const r = readLifecycle("REPLAYED");
  assert.equal(r.disposition, "NEW_IDENTITY_REQUIRED");
  assert.equal(isGradeable("REPLAYED"), false);
});

test("extra time and penalties are unreachable in league play, so they alarm rather than grade", () => {
  for (const state of ["FINAL_AET", "FINAL_PEN"]) {
    const r = readLifecycle(state);
    assert.equal(r.disposition, "PEND_AND_ALARM", state);
    assert.equal(isGradeable(state), false);
  }
});

test("an unrecognised status fails closed to UNKNOWN and alarms", () => {
  for (const raw of ["", null, undefined, "WTF", "half time", "extra time break", "🙃"]) {
    assert.equal(mapFixtureLifecycle(raw), "UNKNOWN", JSON.stringify(raw));
  }
  const r = readLifecycle("UNKNOWN");
  assert.equal(r.disposition, "PEND_AND_ALARM");
  assert.match(r.reason, /fail closed/);
});

test("a state outside the union is treated as UNKNOWN rather than crashing or grading", () => {
  const r = readLifecycle("SOMETHING_NEW");
  assert.equal(r.state, "UNKNOWN");
  assert.equal(r.disposition, "PEND_AND_ALARM");
});

test("provider status strings map conservatively", () => {
  for (const [raw, state] of [
    ["FT", "FINAL_FT"],
    ["Match Finished", "FINAL_FT"],
    ["full time", "FINAL_FT"],
    ["PST", "POSTPONED"],
    ["Match Postponed", "POSTPONED"],
    ["ABD", "ABANDONED"],
    ["suspended", "ABANDONED"],
    ["NS", "SCHEDULED"],
    ["Not Started", "SCHEDULED"],
    ["replayed", "REPLAYED"],
    ["AET", "FINAL_AET"],
    ["PEN", "FINAL_PEN"],
  ]) {
    assert.equal(mapFixtureLifecycle(raw), state, raw);
  }
});

test("every state carries a reason a human can check", () => {
  for (const state of ["SCHEDULED", "FINAL_FT", "POSTPONED", "ABANDONED", "REPLAYED", "FINAL_AET", "FINAL_PEN", "UNKNOWN"]) {
    const r = readLifecycle(state);
    assert.ok(r.reason.length > 20, `${state} needs a real reason, got "${r.reason}"`);
  }
  assert.equal(readLifecycleFromStatus("PST").state, "POSTPONED");
});
