/**
 * Scorecard calculator proofs (Program 128-133 §17: "make the math testable").
 *
 * The point of these is that a completion percentage must be a consequence of the checklist, not
 * a number someone liked. Every rule that could be used to flatter the score is pinned here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS_CREDIT,
  creditFor,
  completion,
  confidence,
  companyRollup,
  assertLaunchState,
} from "./scorecard.mjs";

test("status credits match the specified scale exactly", () => {
  assert.equal(STATUS_CREDIT.DONE_PRODUCTION_PROVEN, 1.0);
  assert.equal(STATUS_CREDIT.DONE_VALIDATED, 0.9);
  assert.equal(STATUS_CREDIT.DONE_STAGING_ONLY, 0.75);
  assert.equal(STATUS_CREDIT.IN_PROGRESS, 0.5);
  assert.equal(STATUS_CREDIT.DESIGNED_ONLY, 0.25);
  assert.equal(STATUS_CREDIT.BLOCKED_EXTERNAL, 0.0);
  assert.equal(STATUS_CREDIT.NOT_STARTED, 0.0);
  assert.equal(STATUS_CREDIT.NOT_APPLICABLE, null);
  assert.throws(() => creditFor("MOSTLY_FINE"), /unknown status/);
});

test("completion is the weighted mean of credits", () => {
  // 2×1.00 + 3×0.50 = 3.5 over weight 5 → 70%
  const r = completion([
    { item: "a", weight: 2, status: "DONE_PRODUCTION_PROVEN" },
    { item: "b", weight: 3, status: "IN_PROGRESS" },
  ]);
  assert.equal(r.pct, 70);
  assert.equal(r.applicable, 2);
});

test("NOT_APPLICABLE is EXCLUDED, never scored as zero", () => {
  const withNA = completion([
    { item: "a", weight: 5, status: "DONE_PRODUCTION_PROVEN" },
    { item: "b", weight: 5, status: "NOT_APPLICABLE" },
  ]);
  assert.equal(withNA.pct, 100, "an inapplicable item must not drag the score down");
  assert.equal(withNA.applicable, 1);

  // Contrast: NOT_STARTED at the same weight genuinely halves it.
  const withNotStarted = completion([
    { item: "a", weight: 5, status: "DONE_PRODUCTION_PROVEN" },
    { item: "b", weight: 5, status: "NOT_STARTED" },
  ]);
  assert.equal(withNotStarted.pct, 50);
});

test("BLOCKED_EXTERNAL scores zero — a blocker is not an excuse", () => {
  const r = completion([
    { item: "a", weight: 1, status: "DONE_PRODUCTION_PROVEN" },
    { item: "b", weight: 1, status: "BLOCKED_EXTERNAL" },
  ]);
  assert.equal(r.pct, 50, "external blockers must reduce completion, not be excluded like N/A");
});

test("weights outside 1..5 are rejected", () => {
  assert.throws(() => completion([{ item: "a", weight: 0, status: "DONE_VALIDATED" }]), /weight must be an integer/);
  assert.throws(() => completion([{ item: "a", weight: 6, status: "DONE_VALIDATED" }]), /weight must be an integer/);
  assert.throws(() => completion([{ item: "a", weight: 2.5, status: "DONE_VALIDATED" }]), /weight must be an integer/);
});

test("MUTATION · company weights that do not sum to 100 are refused", () => {
  const good = [
    { name: "A", pct: 80, companyWeight: 60 },
    { name: "B", pct: 60, companyWeight: 40 },
  ];
  assert.equal(companyRollup(good).pct, 72);

  const bad = good.map((d, i) => (i === 0 ? { ...d, companyWeight: 61 } : d));
  assert.notEqual(bad[0].companyWeight, good[0].companyWeight, "mutation must actually apply");
  assert.throws(() => companyRollup(bad), /must sum to 100/);
});

test("confidence is the share of WEIGHT backed by current evidence", () => {
  const items = [
    { item: "a", weight: 4, status: "DONE_PRODUCTION_PROVEN", evidenceFresh: true },
    { item: "b", weight: 1, status: "DONE_VALIDATED", evidenceFresh: false },
  ];
  assert.equal(confidence(items).level, "HIGH"); // 4/5 = 80%
  const mostlyStale = [
    { item: "a", weight: 1, status: "DONE_VALIDATED", evidenceFresh: true },
    { item: "b", weight: 4, status: "DONE_VALIDATED", evidenceFresh: false },
  ];
  assert.equal(confidence(mostlyStale).level, "LOW"); // 20%
});

test("confidence weights by importance, not item count", () => {
  // One heavy fresh item outweighs several light stale ones — otherwise trivia inflates trust.
  const items = [
    { item: "heavy", weight: 5, status: "DONE_PRODUCTION_PROVEN", evidenceFresh: true },
    { item: "l1", weight: 1, status: "DONE_VALIDATED", evidenceFresh: false },
  ];
  assert.equal(confidence(items).freshShare, 83);
});

test("an all-inapplicable checklist scores null, not 100", () => {
  const r = completion([{ item: "a", weight: 3, status: "NOT_APPLICABLE" }]);
  assert.equal(r.pct, null, "no applicable work must not read as complete");
});

test("launch states are a closed set", () => {
  assert.equal(assertLaunchState("LIVE_PARTIAL"), "LIVE_PARTIAL");
  assert.throws(() => assertLaunchState("ALMOST_LIVE"), /unknown launch state/);
});
