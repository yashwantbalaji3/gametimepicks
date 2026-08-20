/**
 * Guards for the sport-generic learning loop.
 *
 * The defect: model-learning-audit.mjs and update-selection-learning.mjs had NO sport concept and
 * read public/data/mlb literals, so no other sport's settled results could ever reach the loop that
 * makes its model better.
 *
 * The regression risk in fixing it is that MLB starts reading something else. The first test pins
 * the exact literals the audit used before the refactor, so a drift fails here rather than silently
 * auditing different data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { sportLearningPaths, LEARNING_SPORTS } from "./learning-paths.mjs";

const APP = process.cwd();

test("MLB resolves to EXACTLY the literals the audit hardcoded before this refactor", () => {
  const p = sportLearningPaths("mlb", APP);
  assert.equal(p.calDir, path.join(APP, "public/data/mlb/results/calibration"));
  assert.equal(p.boards, path.join(APP, "public/data/mlb/boards"));
  assert.equal(p.ledger, path.join(APP, "public/data/mlb/results/settled_leans.jsonl"));
  assert.equal(p.ready, true, "MLB is the sport that already works — its inputs must all exist");
});

test("an unknown sport is REFUSED, never quietly defaulted to MLB", () => {
  // Defaulting would let a run report success while auditing a different sport entirely.
  for (const bad of ["", null, undefined, "cricket", "MLB2"]) {
    assert.throws(() => sportLearningPaths(bad, APP), /unknown sport/, `${JSON.stringify(bad)} must be refused`);
  }
});

test("sport keys are case-insensitive but never fuzzy", () => {
  assert.equal(sportLearningPaths("UFC", APP).sport, "ufc");
  assert.throws(() => sportLearningPaths("ufc ", APP), /unknown sport/, "whitespace is not a near-match to accept");
});

test("every known sport resolves, and reports what it is MISSING rather than pretending", () => {
  for (const s of LEARNING_SPORTS) {
    const p = sportLearningPaths(s, APP);
    assert.equal(typeof p.ready, "boolean");
    assert.ok(Array.isArray(p.missing));
    // `ready` must be exactly "nothing missing" — never a default that lets an empty sport look live.
    assert.equal(p.ready, p.missing.length === 0, `${s}: ready must mean nothing is missing`);
    if (!p.ready) assert.ok(p.missing.length > 0, `${s}: a not-ready sport must name what it lacks`);
  }
});

test("the not-yet-producing sports are honestly reported as not ready", () => {
  // This is a FACT about today, and it is the point: UFC/NFL/EPL cannot feed the loop yet. When one
  // starts producing, this flips and that is the signal the sport joined the learning loop.
  const notReady = LEARNING_SPORTS.filter((s) => !sportLearningPaths(s, APP).ready);
  assert.ok(notReady.includes("epl"), "EPL has no settled corpus yet — it must not read as ready");
  assert.ok(!notReady.includes("mlb"), "MLB must be ready");
});
