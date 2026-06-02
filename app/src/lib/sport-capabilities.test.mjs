/**
 * Tests for the sport-capability gates (`sport-capabilities.ts`).
 *
 * These enforce the sports-coverage-expansion honesty contract:
 *   - MLB + NBA (modeled) may show projections + official suggested parlays;
 *   - schedule-only + coming-soon sports may NOT show projections/parlays;
 *   - Build Your Own may use modeled sports only;
 *   - mixed-sport is allowed ONLY in Build Your Own, never as an official
 *     Suggested Parlay;
 *   - no unsupported / mixed sport can leak into the official suggested
 *     surface (publicRiskSections);
 *   - capabilities stay in sync with the canonical `sports-coverage.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPORTS_COVERAGE } from "./sports-coverage.ts";
import {
  SPORT_CAPABILITIES,
  MODELED_SPORT_KEYS,
  getSportCapabilities,
  canShowProjections,
  canShowSuggestedParlays,
  canUseInBuildYourOwn,
  canGradeSport,
  isOfficialSuggestedParlayAllowed,
  isBuildYourOwnParlayAllowed,
  sportsOnSlip,
  slipAllowedInOfficialSuggested,
  slipAllowedInBuildYourOwn,
  filterOfficialSuggestedSlips,
  filterBuildYourOwnSlips,
  unsupportedSportsInOfficialSections,
  normalizeSportKey,
} from "./sport-capabilities.ts";

const SCHEDULE_ONLY = ["nhl", "wnba", "ufc", "fifa-world-cup", "ipl", "mls"];
const COMING_SOON = ["epl"];

// --- modeled sports ---------------------------------------------------------
test("exactly NBA + MLB are modeled", () => {
  assert.deepEqual([...MODELED_SPORT_KEYS].sort(), ["mlb", "nba"]);
});

test("MLB + NBA can show projections, suggested parlays, BYO, grading", () => {
  for (const s of ["nba", "mlb"]) {
    assert.equal(canShowProjections(s), true, `${s} projections`);
    assert.equal(canShowSuggestedParlays(s), true, `${s} suggested`);
    assert.equal(canUseInBuildYourOwn(s), true, `${s} byo`);
    assert.equal(canGradeSport(s), true, `${s} grading`);
  }
});

// --- schedule-only sports ---------------------------------------------------
test("schedule-only sports cannot show projections or parlays", () => {
  for (const s of SCHEDULE_ONLY) {
    assert.equal(canShowProjections(s), false, `${s} projections must be false`);
    assert.equal(canShowSuggestedParlays(s), false, `${s} suggested must be false`);
    assert.equal(canUseInBuildYourOwn(s), false, `${s} byo must be false`);
    assert.equal(canGradeSport(s), false, `${s} grading must be false`);
    // ...but they DO have a real schedule.
    assert.equal(getSportCapabilities(s).hasSchedule, true, `${s} schedule`);
    assert.equal(getSportCapabilities(s).status, "schedule_only");
  }
});

// --- coming-soon sports -----------------------------------------------------
test("coming-soon sports cannot show projections, parlays, or schedule", () => {
  for (const s of COMING_SOON) {
    const caps = getSportCapabilities(s);
    assert.equal(caps.hasProjections, false);
    assert.equal(caps.hasSuggestedParlays, false);
    assert.equal(caps.hasBuildYourOwn, false);
    assert.equal(caps.hasGrading, false);
    assert.equal(caps.hasSchedule, false);
    assert.equal(caps.status, "coming_soon");
  }
});

// --- fail-closed unknown sport ---------------------------------------------
test("unknown / unregistered sport has no capabilities (fail closed)", () => {
  for (const s of ["", "tennis", "cricket", "multi", "all", null, undefined]) {
    assert.equal(canShowProjections(s), false);
    assert.equal(canShowSuggestedParlays(s), false);
    assert.equal(canUseInBuildYourOwn(s), false);
    assert.equal(canGradeSport(s), false);
  }
});

test("sport keys are case/whitespace insensitive", () => {
  assert.equal(canShowSuggestedParlays(" NBA "), true);
  assert.equal(canShowProjections("Mlb"), true);
  assert.equal(normalizeSportKey("  NhL "), "nhl");
});

// --- mixed-sport rule -------------------------------------------------------
test("official suggested parlays are single-sport only (no mixed)", () => {
  assert.equal(isOfficialSuggestedParlayAllowed(["nba"]), true);
  assert.equal(isOfficialSuggestedParlayAllowed(["mlb"]), true);
  // mixed NBA+MLB rejected from official suggested
  assert.equal(isOfficialSuggestedParlayAllowed(["nba", "mlb"]), false);
  // duplicate of the same sport is still single-sport → allowed
  assert.equal(isOfficialSuggestedParlayAllowed(["nba", "nba"]), true);
  // unsupported single sport rejected
  assert.equal(isOfficialSuggestedParlayAllowed(["nhl"]), false);
  assert.equal(isOfficialSuggestedParlayAllowed(["epl"]), false);
  // empty rejected
  assert.equal(isOfficialSuggestedParlayAllowed([]), false);
});

test("Build Your Own allows mixed sport, but only across modeled sports", () => {
  // mixed of two modeled sports → allowed ONLY in BYO
  assert.equal(isBuildYourOwnParlayAllowed(["nba", "mlb"]), true);
  assert.equal(isBuildYourOwnParlayAllowed(["nba"]), true);
  // any non-modeled sport on the slip disqualifies it
  assert.equal(isBuildYourOwnParlayAllowed(["nba", "nhl"]), false);
  assert.equal(isBuildYourOwnParlayAllowed(["nhl"]), false);
  assert.equal(isBuildYourOwnParlayAllowed(["mlb", "epl"]), false);
  assert.equal(isBuildYourOwnParlayAllowed([]), false);
});

test("mixed NBA+MLB is BYO-only: allowed in BYO, blocked in official suggested", () => {
  const mixed = ["nba", "mlb"];
  assert.equal(isBuildYourOwnParlayAllowed(mixed), true);
  assert.equal(isOfficialSuggestedParlayAllowed(mixed), false);
});

// --- slip-level helpers -----------------------------------------------------
const nbaSlip = { sport: "nba", legs: [{ sport: "nba" }, { sport: "nba" }] };
const mlbSlip = { sport: "mlb", legs: [{ sport: "mlb" }] };
const mixedSlip = { sport: "multi", legs: [{ sport: "nba" }, { sport: "mlb" }] };
const nhlSlip = { sport: "nhl", legs: [{ sport: "nhl" }] };
const taggedOnlySlip = { sport: "nba", legs: [] }; // no leg metadata

test("sportsOnSlip reads legs, falls back to slip tag", () => {
  assert.deepEqual(sportsOnSlip(nbaSlip), ["nba"]);
  assert.deepEqual(sportsOnSlip(mixedSlip).sort(), ["mlb", "nba"]);
  assert.deepEqual(sportsOnSlip(taggedOnlySlip), ["nba"]);
});

test("slip gates: official suggested vs BYO", () => {
  assert.equal(slipAllowedInOfficialSuggested(nbaSlip), true);
  assert.equal(slipAllowedInOfficialSuggested(mlbSlip), true);
  assert.equal(slipAllowedInOfficialSuggested(mixedSlip), false); // mixed blocked
  assert.equal(slipAllowedInOfficialSuggested(nhlSlip), false); // unsupported blocked

  assert.equal(slipAllowedInBuildYourOwn(nbaSlip), true);
  assert.equal(slipAllowedInBuildYourOwn(mixedSlip), true); // mixed OK in BYO
  assert.equal(slipAllowedInBuildYourOwn(nhlSlip), false); // unsupported never
});

test("filterOfficialSuggestedSlips drops mixed + unsupported, keeps single modeled", () => {
  const kept = filterOfficialSuggestedSlips([nbaSlip, mlbSlip, mixedSlip, nhlSlip]);
  assert.deepEqual(kept, [nbaSlip, mlbSlip]);
});

test("filterBuildYourOwnSlips keeps mixed-of-modeled, drops unsupported", () => {
  const kept = filterBuildYourOwnSlips([nbaSlip, mixedSlip, nhlSlip]);
  assert.deepEqual(kept, [nbaSlip, mixedSlip]);
});

// --- publicRiskSections leak guard -----------------------------------------
test("unsupportedSportsInOfficialSections detects mixed + unsupported leaks", () => {
  // clean official sections: single-sport modeled slips only
  const clean = {
    low: [nbaSlip],
    medium: [mlbSlip],
    high: [],
    longshot: [],
  };
  assert.deepEqual(unsupportedSportsInOfficialSections(clean), []);

  // leaky sections: a mixed slip and an NHL slip slipped in
  const leaky = {
    low: [nbaSlip, mixedSlip],
    medium: [nhlSlip],
  };
  const offenders = unsupportedSportsInOfficialSections(leaky).sort();
  assert.ok(offenders.includes("multi"), "mixed flagged");
  assert.ok(offenders.includes("nhl"), "nhl flagged");

  assert.deepEqual(unsupportedSportsInOfficialSections(null), []);
  assert.deepEqual(unsupportedSportsInOfficialSections(undefined), []);
});

// --- registry sync ----------------------------------------------------------
test("capability table covers every registered sport, in sync with levels", () => {
  assert.equal(SPORT_CAPABILITIES.length, SPORTS_COVERAGE.length);
  for (const sport of SPORTS_COVERAGE) {
    const caps = getSportCapabilities(sport.key);
    if (sport.level === "full") {
      assert.equal(caps.status, "modeled", `${sport.key} should be modeled`);
      assert.equal(caps.hasSuggestedParlays, true);
      assert.equal(caps.hasGrading, true);
    } else {
      // No non-full sport may claim suggested parlays / grading.
      assert.equal(
        caps.hasSuggestedParlays,
        false,
        `${sport.key} (${sport.level}) must not have suggested parlays`,
      );
      assert.equal(
        caps.hasGrading,
        false,
        `${sport.key} (${sport.level}) must not have grading`,
      );
      assert.equal(
        caps.hasBuildYourOwn,
        false,
        `${sport.key} (${sport.level}) must not be in BYO`,
      );
    }
  }
});

test("only modeled sports pass canShowSuggestedParlays across the whole registry", () => {
  for (const sport of SPORTS_COVERAGE) {
    const expected = sport.level === "full";
    assert.equal(
      canShowSuggestedParlays(sport.key),
      expected,
      `${sport.key} suggested gate`,
    );
  }
});
