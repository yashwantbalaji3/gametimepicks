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
  filterOfficialSuggestedSections,
  isMixedSportSlip,
  unsupportedSportsInOfficialSections,
  unsupportedSportsInBuildYourOwn,
  getLegSport,
  canUseLegInBuildYourOwn,
  filterBuildYourOwnLegs,
  normalizeSportKey,
} from "./sport-capabilities.ts";

// fifa-world-cup is intentionally NOT here: the 2026 World Cup is complete and removed from active sports
// coverage (archive only). It is no longer a schedule-only active sport.
const SCHEDULE_ONLY = ["nhl", "wnba", "ufc", "ipl", "mls"];
// No sport is at the "projections" coverage level right now — World Cup model projections
// are under methodology review (held from public), so World Cup is schedule-only publicly.
const PROJECTIONS_ONLY = [];
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

// --- projections-only sports (World Cup: team-level model projections, but no
//     graded parlay pipeline → NOT in the generic optimizer / BYO / grading) ---
test("projections-only sports show projections but not suggested/BYO/grading", () => {
  for (const s of PROJECTIONS_ONLY) {
    const caps = getSportCapabilities(s);
    assert.equal(caps.status, "projections_only", `${s} status`);
    assert.equal(canShowProjections(s), true, `${s} projections must be true`);
    assert.equal(caps.hasSchedule, true, `${s} schedule`);
    // Still fail-closed for the generic NBA/MLB suggested/BYO/grading machinery —
    // World Cup's own suggested cards render via a separate surface.
    assert.equal(canShowSuggestedParlays(s), false, `${s} official-suggested must be false`);
    assert.equal(canUseInBuildYourOwn(s), false, `${s} byo must be false`);
    assert.equal(canGradeSport(s), false, `${s} grading must be false`);
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
test("official suggested parlays allow modeled single AND mixed sports", () => {
  assert.equal(isOfficialSuggestedParlayAllowed(["nba"]), true);
  assert.equal(isOfficialSuggestedParlayAllowed(["mlb"]), true);
  // mixed NBA+MLB (both modeled) is now ALLOWED as official suggested (Mixed section)
  assert.equal(isOfficialSuggestedParlayAllowed(["nba", "mlb"]), true);
  assert.equal(isOfficialSuggestedParlayAllowed(["nba", "nba"]), true);
  // a mixed slip carrying ANY non-modeled sport is still rejected
  assert.equal(isOfficialSuggestedParlayAllowed(["nba", "nhl"]), false);
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

test("mixed NBA+MLB (modeled) is allowed in BOTH official suggested and BYO", () => {
  const mixed = ["nba", "mlb"];
  assert.equal(isBuildYourOwnParlayAllowed(mixed), true);
  assert.equal(isOfficialSuggestedParlayAllowed(mixed), true); // Mixed section
  // mixed with a non-modeled sport is allowed in neither
  assert.equal(isBuildYourOwnParlayAllowed(["nba", "nhl"]), false);
  assert.equal(isOfficialSuggestedParlayAllowed(["nba", "nhl"]), false);
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
  assert.equal(slipAllowedInOfficialSuggested(mixedSlip), true); // mixed-of-modeled now allowed
  assert.equal(slipAllowedInOfficialSuggested(nhlSlip), false); // unsupported blocked

  assert.equal(slipAllowedInBuildYourOwn(nbaSlip), true);
  assert.equal(slipAllowedInBuildYourOwn(mixedSlip), true); // mixed OK in BYO
  assert.equal(slipAllowedInBuildYourOwn(nhlSlip), false); // unsupported never
});

test("filterOfficialSuggestedSlips keeps modeled single + mixed, drops unsupported", () => {
  const kept = filterOfficialSuggestedSlips([nbaSlip, mlbSlip, mixedSlip, nhlSlip]);
  assert.deepEqual(kept, [nbaSlip, mlbSlip, mixedSlip]); // mixed-of-modeled kept, nhl dropped
});

test("filterBuildYourOwnSlips keeps mixed-of-modeled, drops unsupported", () => {
  const kept = filterBuildYourOwnSlips([nbaSlip, mixedSlip, nhlSlip]);
  assert.deepEqual(kept, [nbaSlip, mixedSlip]);
});

// --- publicRiskSections leak guard -----------------------------------------
test("unsupportedSportsInOfficialSections detects only non-modeled leaks (mixed-of-modeled OK)", () => {
  // clean official sections: modeled single AND mixed-of-modeled slips are fine
  const clean = {
    low: [nbaSlip, mixedSlip],
    medium: [mlbSlip],
    high: [],
    longshot: [],
  };
  assert.deepEqual(unsupportedSportsInOfficialSections(clean), []);

  // leaky sections: only the NHL (non-modeled) slip is an offender now
  const leaky = {
    low: [nbaSlip, mixedSlip],
    medium: [nhlSlip],
  };
  const offenders = unsupportedSportsInOfficialSections(leaky).sort();
  assert.ok(!offenders.includes("multi"), "mixed-of-modeled NOT flagged");
  assert.ok(offenders.includes("nhl"), "nhl flagged");

  assert.deepEqual(unsupportedSportsInOfficialSections(null), []);
  assert.deepEqual(unsupportedSportsInOfficialSections(undefined), []);
});

test("isMixedSportSlip flags cross-sport slips only", () => {
  assert.equal(isMixedSportSlip(nbaSlip), false);
  assert.equal(isMixedSportSlip(mlbSlip), false);
  assert.equal(isMixedSportSlip(mixedSlip), true);
  assert.equal(isMixedSportSlip(nhlSlip), false);
});

// --- Build Your Own leg-level gating (PR C) ---------------------------------
test("getLegSport reads leg sport, falls back to slip sport, else ''", () => {
  assert.equal(getLegSport({ sport: "NBA" }), "nba");
  assert.equal(getLegSport({ sport: null }, "mlb"), "mlb");
  assert.equal(getLegSport({}, null), "");
  assert.equal(getLegSport(null), "");
});

test("canUseLegInBuildYourOwn allows modeled legs, blocks the rest", () => {
  assert.equal(canUseLegInBuildYourOwn({ sport: "nba" }), true);
  assert.equal(canUseLegInBuildYourOwn({ sport: "mlb" }), true);
  assert.equal(canUseLegInBuildYourOwn({ sport: "nhl" }), false);
  assert.equal(canUseLegInBuildYourOwn({ sport: "wnba" }), false);
  assert.equal(canUseLegInBuildYourOwn({ sport: "epl" }), false);
  assert.equal(canUseLegInBuildYourOwn({ sport: "cricket" }), false); // unknown
  assert.equal(canUseLegInBuildYourOwn({ sport: "" }), false); // missing
  assert.equal(canUseLegInBuildYourOwn({}), false); // missing
  assert.equal(canUseLegInBuildYourOwn(null), false);
});

test("filterBuildYourOwnLegs keeps only modeled legs (the candidate-pool gate)", () => {
  const legs = [
    { sport: "nba", playerName: "A" },
    { sport: "mlb", playerName: "B" },
    { sport: "nhl", playerName: "C" }, // schedule-only
    { sport: "wnba", playerName: "D" }, // schedule-only
    { sport: "epl", playerName: "E" }, // coming-soon
    { sport: "", playerName: "F" }, // missing
    { playerName: "G" }, // missing
  ];
  const kept = filterBuildYourOwnLegs(legs);
  assert.deepEqual(kept.map((l) => l.playerName), ["A", "B"]);
});

test("Build Your Own allows mixed NBA+MLB but rejects any non-modeled leg", () => {
  // A mixed modeled slip is allowed (slip-level), and every modeled leg passes
  assert.equal(isBuildYourOwnParlayAllowed(["nba", "mlb"]), true);
  assert.equal(filterBuildYourOwnLegs([{ sport: "nba" }, { sport: "mlb" }]).length, 2);
  // A would-be mixed slip with a WNBA / NHL leg loses that leg entirely
  assert.equal(filterBuildYourOwnLegs([{ sport: "nba" }, { sport: "wnba" }]).length, 1);
  assert.equal(filterBuildYourOwnLegs([{ sport: "mlb" }, { sport: "nhl" }]).length, 1);
});

test("unsupportedSportsInBuildYourOwn flags non-modeled, ignores mixed-of-modeled", () => {
  assert.deepEqual(unsupportedSportsInBuildYourOwn([nbaSlip, mlbSlip, mixedSlip]), []);
  assert.deepEqual(unsupportedSportsInBuildYourOwn([nhlSlip]).sort(), ["nhl"]);
  const withWnba = { sport: "multi", legs: [{ sport: "nba" }, { sport: "wnba" }] };
  assert.deepEqual(unsupportedSportsInBuildYourOwn([withWnba]).sort(), ["wnba"]);
  assert.deepEqual(unsupportedSportsInBuildYourOwn(null), []);
});

// --- filterOfficialSuggestedSections (publicRiskSections "all"-bucket leak) --
test("filterOfficialSuggestedSections keeps mixed-of-modeled, drops only non-modeled", () => {
  // Mirrors publicRiskSections where the per-sport buckets include an "all"
  // union bucket that, on a mixed slate, carries mixed slips.
  const sections = {
    low: [nbaSlip, mlbSlip, mixedSlip], // 'all'-style union with a mixed slip
    medium: [mixedSlip, nhlSlip], // mixed-of-modeled + unsupported
    high: [mlbSlip],
    longshot: [],
  };
  const out = filterOfficialSuggestedSections(sections);
  assert.deepEqual(out.low, [nbaSlip, mlbSlip, mixedSlip]); // mixed-of-modeled kept
  assert.deepEqual(out.medium, [mixedSlip]); // nhl dropped, mixed kept
  assert.deepEqual(out.high, [mlbSlip]);
  assert.deepEqual(out.longshot, []);
  // section keys preserved
  assert.deepEqual(Object.keys(out).sort(), ["high", "longshot", "low", "medium"]);
  // and the result has NO non-modeled leak
  assert.deepEqual(unsupportedSportsInOfficialSections(out), []);
});

test("filterOfficialSuggestedSections handles null/undefined", () => {
  assert.deepEqual(filterOfficialSuggestedSections(null), {});
  assert.deepEqual(filterOfficialSuggestedSections(undefined), {});
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
