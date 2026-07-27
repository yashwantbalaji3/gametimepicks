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
import { canUseInBuildYourOwn } from "./sport-capabilities.ts";

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

test("sport scope = BYO-eligible sports (+ Mixed only when ≥2); never an ineligible sport", () => {
  const opts = buildSportScopeOptions();
  const keys = opts.map((o) => o.key);
  const singles = opts.filter((o) => !o.mixed);

  // Every offered single-sport scope must actually be Build-Your-Own eligible.
  assert.ok(singles.length > 0, "at least one sport must be selectable");
  for (const o of singles) {
    assert.equal(canUseInBuildYourOwn(o.key), true, `${o.key} is offered but is not BYO-eligible`);
    assert.equal(o.label, o.key.toUpperCase());
  }

  // No ineligible sport may ever be selectable — including NBA while it is HISTORICAL_ONLY.
  for (const blocked of ["nhl", "wnba", "ufc", "fifa-world-cup", "ipl", "mls", "epl"]) {
    assert.ok(!keys.includes(blocked), `${blocked} must not be a build sport scope`);
  }
  for (const key of keys) {
    if (key === "mixed") continue;
    assert.ok(canUseInBuildYourOwn(key), `${key} must not be offered while ineligible`);
  }

  // The Mixed scope exists IFF a cross-sport build is actually possible.
  const mixed = opts.find((o) => o.key === "mixed");
  if (singles.length >= 2) {
    assert.ok(mixed, "≥2 eligible sports must offer a Mixed scope");
    assert.equal(mixed.mixed, true);
    assert.match(mixed.label, /Mixed/);
  } else {
    assert.equal(mixed, undefined, "a Mixed scope must not be offered when only one sport is eligible");
  }
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
