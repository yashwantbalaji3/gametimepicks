/**
 * Tests for the Build a Parlay config (PR 3 — Build a Parlay redesign).
 * Locks the build-type switch, honest status chips, and modeled-only sport
 * scope (no schedule-only / coming-soon sport ever selectable).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILD_TYPES,
  BUILD_STATUS_CHIPS,
  buildSportScopeOptions,
} from "./build-a-parlay-config.ts";

const BANNED = [
  "lock", "guaranteed", "free money", "risk-free", "can't miss", "cant miss",
  "easy win", "easy money", "no-brainer", "no brainer", "sure thing",
  "sharp money", "safe", "safety",
];

test("build types expose exactly Quick Generate and Manual Build", () => {
  assert.deepEqual(BUILD_TYPES.map((b) => b.key), ["quick", "manual"]);
  assert.equal(BUILD_TYPES.find((b) => b.key === "quick").label, "Quick Generate");
  assert.equal(BUILD_TYPES.find((b) => b.key === "manual").label, "Manual Build");
});

test("status chips state custom / modeled-only / not tracked", () => {
  assert.ok(BUILD_STATUS_CHIPS.includes("Custom"));
  assert.ok(BUILD_STATUS_CHIPS.includes("Modeled sports only"));
  assert.ok(BUILD_STATUS_CHIPS.includes("Not officially tracked"));
});

test("sport scope = modeled sports + Mixed; no schedule-only/coming-soon", () => {
  const opts = buildSportScopeOptions();
  const keys = opts.map((o) => o.key);
  // exactly the modeled sports (nba, mlb) plus a mixed scope
  assert.ok(keys.includes("nba"), "NBA selectable");
  assert.ok(keys.includes("mlb"), "MLB selectable");
  assert.ok(keys.includes("mixed"), "Mixed selectable");
  // schedule-only / coming-soon must NOT be selectable
  for (const blocked of ["nhl", "wnba", "ufc", "fifa-world-cup", "ipl", "mls", "epl"]) {
    assert.ok(!keys.includes(blocked), `${blocked} must not be a build sport scope`);
  }
  // mixed is flagged + labeled as cross-sport, others single-sport
  const mixed = opts.find((o) => o.key === "mixed");
  assert.equal(mixed.mixed, true);
  assert.match(mixed.label, /Mixed/);
  assert.ok(opts.filter((o) => !o.mixed).every((o) => /^(NBA|MLB)$/.test(o.label)));
});

test("no banned betting copy in build config strings", () => {
  const blob = [
    ...BUILD_TYPES.flatMap((b) => [b.label, b.sub]),
    ...BUILD_STATUS_CHIPS,
    ...buildSportScopeOptions().map((o) => o.label),
  ].join(" ").toLowerCase();
  for (const w of BANNED) {
    assert.ok(!blob.includes(w), `build config must not contain "${w}"`);
  }
});
