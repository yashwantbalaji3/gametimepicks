/**
 * UFC validation backfill-status schema + honesty. The internal backfill tracker must validate, must NOT
 * have fetched paid odds by default, must NOT lower the threshold, and must NOT flip publicPicksVisible.
 * It is INTERNAL — never web-served (no public copy).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "..");
const artifactPath = path.join(root, "data", "internal", "ufc", "backfill-status.json");

test("1 · backfill-status artifact exists and validates", () => {
  assert.ok(fs.existsSync(artifactPath), "internal backfill-status.json exists");
  const s = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  for (const k of ["completedCardsIndexed", "resultsFetched", "oddsFetched", "gradedRows", "threshold"]) {
    assert.equal(typeof s[k], "number", `${k} is a number`);
  }
  assert.equal(typeof s.paidOddsNeeded, "boolean", "paidOddsNeeded is a boolean");
  assert.ok(Array.isArray(s.guardrails) && s.guardrails.length > 0, "guardrails documented");
});

test("2 · no paid odds fetched by default; threshold not lowered; picks not unlocked", () => {
  const s = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  assert.equal(s.oddsFetched, 0, "no paid historical odds fetched");
  assert.equal(s.paidOddsNeeded, true, "paid odds still needed");
  assert.equal(s.threshold, 150, "threshold stays 150 (never lowered)");
  assert.equal(s.moneylineValidated, false, "model not validated");
  assert.equal(s.publicPicksVisible, false, "public picks not unlocked");
  assert.ok(s.gradedRows < s.threshold, "graded rows below threshold");
});

test("3 · the backfill tracker is INTERNAL — no public copy is web-served", () => {
  const publicCopy = path.join(process.cwd(), "public", "data", "ufc", "backfill-status.json");
  assert.ok(!fs.existsSync(publicCopy), "no public backfill-status.json (internal-only)");
});
