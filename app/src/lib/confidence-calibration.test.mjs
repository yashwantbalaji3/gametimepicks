/**
 * Unit tests for the dynamic confidence calibration classifier.
 *
 * Pure-function tests over hand-crafted audit-shaped fixtures. Runs
 * via `node --import tsx` (see test runner below) so it can stay
 * close to the implementation without spinning up the full Next
 * build.
 *
 * Run:
 *   node --test app/src/lib/confidence-calibration.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// Use a relative path to the TS module — node:test handles .ts under
// experimental TS support since 22.6. If your local node is older,
// run via:
//   npx tsx --test app/src/lib/confidence-calibration.test.mjs
import {
  classifyTier,
  CALIBRATION_RULES,
} from "./confidence-calibration.ts";

const ROW = (label, wins, losses) => ({
  label,
  wins,
  losses,
  decisive: wins + losses,
  hitRate: wins / Math.max(1, wins + losses),
});

test("thin sample → thin", () => {
  const table = {
    High: ROW("High", 30, 25), // n=55 below the 60 floor
    Medium: ROW("Medium", 50, 40),
    Low: ROW("Low", 80, 70),
  };
  assert.equal(classifyTier("High", table), "thin");
});

test("MLB-style inversion → inverted", () => {
  // High at 48.3% on 315; Medium 52% on 102; Low 51.4% on 327. Both
  // rivals beat High by ≥ 1.5pp.
  const table = {
    High: ROW("High", 152, 163),
    Medium: ROW("Medium", 53, 49),
    Low: ROW("Low", 168, 159),
  };
  assert.equal(classifyTier("High", table), "inverted");
});

test("NBA-style High → watch (not inverted)", () => {
  // High 53.9% beats Low 51.7% but trails Medium 59.5%. Single rival
  // can't trigger inversion.
  const table = {
    High: ROW("High", 255, 218),
    Medium: ROW("Medium", 47, 32),
    Low: ROW("Low", 61, 57),
  };
  assert.equal(classifyTier("High", table), "watch");
});

test("clearly strong tier → strong", () => {
  // 65% on 200 — well above the 57% / 100-row floor.
  const table = {
    High: ROW("High", 130, 70),
    Medium: ROW("Medium", 50, 40),
    Low: ROW("Low", 50, 50),
  };
  assert.equal(classifyTier("High", table), "strong");
});

test("missing tier → unknown", () => {
  const table = {
    High: ROW("High", 100, 80),
  };
  assert.equal(classifyTier("Medium", table), "unknown");
});

test("single thin rival cannot trigger inversion", () => {
  // Medium is thin (40 decisive). Even though it has a higher
  // hit rate than High, it can't flip High to inverted alone.
  const table = {
    High: ROW("High", 100, 100),
    Medium: ROW("Medium", 25, 15), // n=40 thin
    Low: ROW("Low", 60, 60),
  };
  assert.equal(classifyTier("High", table), "watch");
});

test("CALIBRATION_RULES thresholds are honest", () => {
  // We never quietly promote a tier with <100 rows even at a high
  // hit rate. Keeps the helper from overpromising on small samples.
  assert.equal(CALIBRATION_RULES.strongMinSample, 100);
  assert.equal(CALIBRATION_RULES.thinSample, 60);
  assert.equal(CALIBRATION_RULES.strongHitRate, 0.57);
  assert.equal(CALIBRATION_RULES.invertedMarginPp, 1.5);
});
