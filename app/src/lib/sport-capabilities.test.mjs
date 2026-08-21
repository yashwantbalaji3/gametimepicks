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
import { capabilityState, FULL_MODEL_SPORTS, resultsMode } from "./sport-capability-registry.ts";

// fifa-world-cup is intentionally NOT here: the 2026 World Cup is complete and removed from active sports
// coverage (archive only). It is no longer a schedule-only active sport.
const SCHEDULE_ONLY = ["nhl", "wnba", "ufc", "ipl", "mls"];
/*
 * P188: these two were hand-kept, and EPL moving from "coming-soon" to "projections" broke both —
 * COMING_SOON still named a sport that now publishes per-fixture distributions, and PROJECTIONS_ONLY
 * was empty while a projections sport existed. Both are now DERIVED from the same registry the
 * capabilities themselves derive from, so membership cannot drift from the levels again. The tests
 * below still assert the INVARIANT per level; only the membership stopped being copied by hand.
 */
const atLevel = (level) => SPORTS_COVERAGE.filter((s) => s.level === level).map((s) => s.key);
const PROJECTIONS_ONLY = atLevel("projections");
const COMING_SOON = atLevel("coming-soon");

// --- modeled sports ---------------------------------------------------------
// These assert the INVARIANT rather than the current membership list. "Exactly NBA + MLB"
// was a fact about a moment in time, and a capability change (NBA is HISTORICAL_ONLY, frozen
// since 2026-06-13) turns such a test into a false failure. The invariant — a sport is
// modeled here IFF the capability registry says FULL_MODEL — is what actually must hold, and
// it keeps holding when a sport graduates or is demoted.
test("the modeled set is exactly the registry's FULL_MODEL sports", () => {
  assert.ok(MODELED_SPORT_KEYS.length > 0, "at least one sport must be modeled or no product exists");
  for (const key of MODELED_SPORT_KEYS) {
    assert.equal(
      capabilityState(key),
      "FULL_MODEL",
      `${key} is treated as modeled but the registry calls it ${capabilityState(key)}`,
    );
  }
  // ...and nothing FULL_MODEL is silently missing from it.
  assert.deepEqual(
    [...MODELED_SPORT_KEYS].sort(),
    [...FULL_MODEL_SPORTS].sort(),
    "modeled set and registry FULL_MODEL set must agree in both directions",
  );
});

test("every modeled sport can show projections, suggested parlays, BYO, grading", () => {
  for (const s of MODELED_SPORT_KEYS) {
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
  /*
   * The list is derived, so it is legitimately empty when no sport is coming-soon. Assert the fact
   * that CHANGED — EPL publishes now — so an empty loop cannot quietly become the whole test.
   */
  assert.ok(!COMING_SOON.includes("epl"), "EPL publishes per-fixture forecasts and is no longer coming-soon");
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
  // Derived, not hardcoded: normalization must hold for whatever is modeled today.
  const modeled = MODELED_SPORT_KEYS[0];
  const shouty = ` ${modeled.toUpperCase()} `;
  assert.equal(canShowSuggestedParlays(shouty), true, `${shouty} must normalize to ${modeled}`);
  assert.equal(canShowProjections(shouty), true);
  assert.equal(normalizeSportKey("  NhL "), "nhl");
});

// --- mixed-sport rule -------------------------------------------------------
/**
 * SYNTHETIC sport keys — deliberately not real sports.
 *
 * Mixed-sport mechanics need TWO eligible sports. Tying that to real keys made the suite
 * depend on NBA being modeled, so the moment NBA became HISTORICAL_ONLY the mechanics could
 * no longer be expressed at all. Injecting a fixture predicate separates THE RULE ("every
 * sport on the slip must be eligible") from WHICH SPORTS satisfy it today — the rule stays
 * fully covered no matter how many real sports are currently eligible.
 */
const ALPHA = "fixture_alpha";
const BETA = "fixture_beta";
const BLOCKED = "fixture_blocked";
/** Fixture gate: alpha + beta eligible, everything else (incl. every real sport) not. */
const eligible = (sport) => sport === ALPHA || sport === BETA;

test("official suggested parlays allow an eligible single sport AND mixed eligible sports", () => {
  assert.equal(isOfficialSuggestedParlayAllowed([ALPHA], eligible), true);
  assert.equal(isOfficialSuggestedParlayAllowed([BETA], eligible), true);
  // mixed of two ELIGIBLE sports is allowed as official suggested (labeled "Mixed" section)
  assert.equal(isOfficialSuggestedParlayAllowed([ALPHA, BETA], eligible), true);
  // duplicates collapse to one distinct key
  assert.equal(isOfficialSuggestedParlayAllowed([ALPHA, ALPHA], eligible), true);
  // a mixed slip carrying ANY ineligible sport is rejected
  assert.equal(isOfficialSuggestedParlayAllowed([ALPHA, BLOCKED], eligible), false);
  // ineligible single sport rejected
  assert.equal(isOfficialSuggestedParlayAllowed([BLOCKED], eligible), false);
  // empty rejected
  assert.equal(isOfficialSuggestedParlayAllowed([], eligible), false);

  // Against the REAL gate, genuinely unsupported sports stay rejected. These hold under any
  // capability state, so they never need a fixture.
  assert.equal(isOfficialSuggestedParlayAllowed(["nhl"]), false);
  assert.equal(isOfficialSuggestedParlayAllowed(["epl"]), false);
  assert.equal(isOfficialSuggestedParlayAllowed([]), false);
});

test("Build Your Own allows mixed sport, but only across eligible sports", () => {
  assert.equal(isBuildYourOwnParlayAllowed([ALPHA, BETA], eligible), true);
  assert.equal(isBuildYourOwnParlayAllowed([ALPHA], eligible), true);
  // any ineligible sport on the slip disqualifies it
  assert.equal(isBuildYourOwnParlayAllowed([ALPHA, BLOCKED], eligible), false);
  assert.equal(isBuildYourOwnParlayAllowed([BLOCKED], eligible), false);
  assert.equal(isBuildYourOwnParlayAllowed([], eligible), false);

  // Real gate: unsupported sports never enter BYO.
  assert.equal(isBuildYourOwnParlayAllowed(["nhl"]), false);
  assert.equal(isBuildYourOwnParlayAllowed(["epl"]), false);
});

test("a mixed slip of eligible sports is allowed in BOTH official suggested and BYO", () => {
  const mixed = [ALPHA, BETA];
  assert.equal(isBuildYourOwnParlayAllowed(mixed, eligible), true);
  assert.equal(isOfficialSuggestedParlayAllowed(mixed, eligible), true); // Mixed section
  // mixed with an ineligible sport is allowed in neither
  assert.equal(isBuildYourOwnParlayAllowed([ALPHA, BLOCKED], eligible), false);
  assert.equal(isOfficialSuggestedParlayAllowed([ALPHA, BLOCKED], eligible), false);
});

test("the rule is capability-based, not count-based: one eligible sport still works", () => {
  // The migration's core decision. With exactly ONE eligible sport the rule must keep working
  // for single-sport slips and keep rejecting anything else — no special case, no new branch.
  const onlyAlpha = (s) => s === ALPHA;
  assert.equal(isOfficialSuggestedParlayAllowed([ALPHA], onlyAlpha), true);
  assert.equal(isOfficialSuggestedParlayAllowed([ALPHA, BETA], onlyAlpha), false);
  // ...and a SECOND sport becoming eligible needs no code change — only the predicate differs.
  assert.equal(isOfficialSuggestedParlayAllowed([ALPHA, BETA], eligible), true);
});

// --- slip-level helpers -----------------------------------------------------
// Slip fixtures over the SYNTHETIC keys, so slip mechanics stay expressible regardless of
// how many real sports are eligible. `blockedSlip` stands for any ineligible sport.
const alphaSlip = { sport: ALPHA, legs: [{ sport: ALPHA }, { sport: ALPHA }] };
const betaSlip = { sport: BETA, legs: [{ sport: BETA }] };
const mixedSlip = { sport: "multi", legs: [{ sport: ALPHA }, { sport: BETA }] };
const blockedSlip = { sport: BLOCKED, legs: [{ sport: BLOCKED }] };
const taggedOnlySlip = { sport: ALPHA, legs: [] }; // no leg metadata

test("sportsOnSlip reads legs, falls back to slip tag", () => {
  // Pure identity extraction — no capability involved, so it needs no predicate.
  assert.deepEqual(sportsOnSlip(alphaSlip), [ALPHA]);
  assert.deepEqual(sportsOnSlip(mixedSlip).sort(), [ALPHA, BETA].sort());
  assert.deepEqual(sportsOnSlip(taggedOnlySlip), [ALPHA]);
});

test("slip gates: official suggested vs BYO", () => {
  assert.equal(slipAllowedInOfficialSuggested(alphaSlip, eligible), true);
  assert.equal(slipAllowedInOfficialSuggested(betaSlip, eligible), true);
  assert.equal(slipAllowedInOfficialSuggested(mixedSlip, eligible), true); // mixed-of-eligible allowed
  assert.equal(slipAllowedInOfficialSuggested(blockedSlip, eligible), false); // ineligible blocked

  assert.equal(slipAllowedInBuildYourOwn(alphaSlip, eligible), true);
  assert.equal(slipAllowedInBuildYourOwn(mixedSlip, eligible), true); // mixed OK in BYO
  assert.equal(slipAllowedInBuildYourOwn(blockedSlip, eligible), false); // ineligible never

  // Real gate: a genuinely unsupported sport is blocked on both surfaces.
  const nhlSlip = { sport: "nhl", legs: [{ sport: "nhl" }] };
  assert.equal(slipAllowedInOfficialSuggested(nhlSlip), false);
  assert.equal(slipAllowedInBuildYourOwn(nhlSlip), false);
});

test("filterOfficialSuggestedSlips keeps eligible single + mixed, drops ineligible", () => {
  const kept = filterOfficialSuggestedSlips([alphaSlip, betaSlip, mixedSlip, blockedSlip], eligible);
  assert.deepEqual(kept, [alphaSlip, betaSlip, mixedSlip]); // mixed-of-eligible kept, blocked dropped
});

test("filterBuildYourOwnSlips keeps mixed-of-eligible, drops ineligible", () => {
  const kept = filterBuildYourOwnSlips([alphaSlip, mixedSlip, blockedSlip], eligible);
  assert.deepEqual(kept, [alphaSlip, mixedSlip]);
});

// --- publicRiskSections leak guard -----------------------------------------
test("unsupportedSportsInOfficialSections detects only non-modeled leaks (mixed-of-modeled OK)", () => {
  // clean official sections: modeled single AND mixed-of-modeled slips are fine
  const clean = {
    low: [alphaSlip, mixedSlip],
    medium: [betaSlip],
    high: [],
    longshot: [],
  };
  assert.deepEqual(unsupportedSportsInOfficialSections(clean, eligible), []);

  // leaky sections: only the ineligible slip is an offender
  const leaky = {
    low: [alphaSlip, mixedSlip],
    medium: [blockedSlip],
  };
  const offenders = unsupportedSportsInOfficialSections(leaky, eligible).sort();
  assert.ok(!offenders.includes("multi"), "mixed-of-eligible NOT flagged");
  assert.ok(offenders.includes(BLOCKED), "ineligible sport flagged");

  assert.deepEqual(unsupportedSportsInOfficialSections(null), []);
  assert.deepEqual(unsupportedSportsInOfficialSections(undefined), []);
});

test("isMixedSportSlip flags cross-sport slips only", () => {
  // Counts distinct sports; capability-independent by design.
  assert.equal(isMixedSportSlip(alphaSlip), false);
  assert.equal(isMixedSportSlip(betaSlip), false);
  assert.equal(isMixedSportSlip(mixedSlip), true);
  assert.equal(isMixedSportSlip(blockedSlip), false);
});

// --- Build Your Own leg-level gating (PR C) ---------------------------------
test("getLegSport reads leg sport, falls back to slip sport, else ''", () => {
  assert.equal(getLegSport({ sport: "NBA" }), "nba");
  assert.equal(getLegSport({ sport: null }, "mlb"), "mlb");
  assert.equal(getLegSport({}, null), "");
  assert.equal(getLegSport(null), "");
});

test("canUseLegInBuildYourOwn allows eligible legs, blocks the rest", () => {
  assert.equal(canUseLegInBuildYourOwn({ sport: ALPHA }, eligible), true);
  assert.equal(canUseLegInBuildYourOwn({ sport: BETA }, eligible), true);
  assert.equal(canUseLegInBuildYourOwn({ sport: BLOCKED }, eligible), false);
  // Fail-closed cases hold under ANY predicate — a leg with no sport can never be eligible.
  assert.equal(canUseLegInBuildYourOwn({ sport: "" }, eligible), false);
  assert.equal(canUseLegInBuildYourOwn({}, eligible), false);
  assert.equal(canUseLegInBuildYourOwn(null, eligible), false);

  // Real gate: genuinely unsupported + unknown sports are blocked.
  for (const s of ["nhl", "wnba", "epl", "cricket", ""]) {
    assert.equal(canUseLegInBuildYourOwn({ sport: s }), false, `${s || "(empty)"} must be blocked`);
  }
  assert.equal(canUseLegInBuildYourOwn(null), false);
  // ...and every currently-modeled sport is allowed.
  for (const s of MODELED_SPORT_KEYS) assert.equal(canUseLegInBuildYourOwn({ sport: s }), true, s);
});

test("filterBuildYourOwnLegs keeps only eligible legs (the candidate-pool gate)", () => {
  const legs = [
    { sport: ALPHA, playerName: "A" },
    { sport: BETA, playerName: "B" },
    { sport: BLOCKED, playerName: "C" }, // ineligible
    { sport: "nhl", playerName: "D" }, // schedule-only (ineligible under the fixture too)
    { sport: "", playerName: "E" }, // missing
    { playerName: "F" }, // missing
  ];
  assert.deepEqual(filterBuildYourOwnLegs(legs, eligible).map((l) => l.playerName), ["A", "B"]);

  // Real gate: a pool of genuinely unsupported legs is emptied entirely.
  const realPool = [
    { sport: "nhl", playerName: "X" },
    { sport: "wnba", playerName: "Y" },
    { sport: "epl", playerName: "Z" },
    { playerName: "W" },
  ];
  assert.deepEqual(filterBuildYourOwnLegs(realPool), []);
});

test("Build Your Own allows a mixed eligible slip but rejects any ineligible leg", () => {
  // A mixed eligible slip is allowed (slip-level), and every eligible leg passes.
  assert.equal(isBuildYourOwnParlayAllowed([ALPHA, BETA], eligible), true);
  assert.equal(filterBuildYourOwnLegs([{ sport: ALPHA }, { sport: BETA }], eligible).length, 2);
  // A would-be mixed slip with an ineligible leg loses that leg entirely.
  assert.equal(filterBuildYourOwnLegs([{ sport: ALPHA }, { sport: BLOCKED }], eligible).length, 1);
  // Real gate: a modeled leg beside an unsupported one keeps only the modeled one.
  const modeled = MODELED_SPORT_KEYS[0];
  assert.equal(filterBuildYourOwnLegs([{ sport: modeled }, { sport: "wnba" }]).length, 1);
  assert.equal(filterBuildYourOwnLegs([{ sport: modeled }, { sport: "nhl" }]).length, 1);
});

test("unsupportedSportsInBuildYourOwn flags ineligible, ignores mixed-of-eligible", () => {
  assert.deepEqual(unsupportedSportsInBuildYourOwn([alphaSlip, betaSlip, mixedSlip], eligible), []);
  assert.deepEqual(unsupportedSportsInBuildYourOwn([blockedSlip], eligible).sort(), [BLOCKED]);
  const halfBlocked = { sport: "multi", legs: [{ sport: ALPHA }, { sport: BLOCKED }] };
  assert.deepEqual(unsupportedSportsInBuildYourOwn([halfBlocked], eligible).sort(), [BLOCKED]);
  assert.deepEqual(unsupportedSportsInBuildYourOwn(null, eligible), []);

  // Real gate: an unsupported real sport is reported by name.
  assert.deepEqual(unsupportedSportsInBuildYourOwn([{ sport: "nhl", legs: [{ sport: "nhl" }] }]), ["nhl"]);
});

// --- filterOfficialSuggestedSections (publicRiskSections "all"-bucket leak) --
test("filterOfficialSuggestedSections keeps mixed-of-modeled, drops only non-modeled", () => {
  // Mirrors publicRiskSections where the per-sport buckets include an "all"
  // union bucket that, on a mixed slate, carries mixed slips.
  const sections = {
    low: [alphaSlip, betaSlip, mixedSlip], // 'all'-style union with a mixed slip
    medium: [mixedSlip, blockedSlip], // mixed-of-eligible + ineligible
    high: [betaSlip],
    longshot: [],
  };
  const out = filterOfficialSuggestedSections(sections, eligible);
  assert.deepEqual(out.low, [alphaSlip, betaSlip, mixedSlip]); // mixed-of-eligible kept
  assert.deepEqual(out.medium, [mixedSlip]); // ineligible dropped, mixed kept
  assert.deepEqual(out.high, [betaSlip]);
  assert.deepEqual(out.longshot, []);
  // section keys preserved
  assert.deepEqual(Object.keys(out).sort(), ["high", "longshot", "low", "medium"]);
  // and the result has NO ineligible leak
  assert.deepEqual(unsupportedSportsInOfficialSections(out, eligible), []);
});

test("filterOfficialSuggestedSections handles null/undefined", () => {
  assert.deepEqual(filterOfficialSuggestedSections(null), {});
  assert.deepEqual(filterOfficialSuggestedSections(undefined), {});
});

// --- registry sync ----------------------------------------------------------
test("capability table = coverage level AND capability registry (registry may only narrow)", () => {
  assert.equal(SPORT_CAPABILITIES.length, SPORTS_COVERAGE.length);
  for (const sport of SPORTS_COVERAGE) {
    const caps = getSportCapabilities(sport.key);
    const levelSaysFull = sport.level === "full";
    const registrySaysEligible = capabilityState(sport.key) === "FULL_MODEL";

    if (levelSaysFull && registrySaysEligible) {
      assert.equal(caps.status, "modeled", `${sport.key} should be modeled`);
      assert.equal(caps.hasSuggestedParlays, true);
      assert.equal(caps.hasBuildYourOwn, true);
      assert.equal(caps.hasGrading, true);
    } else {
      // Either gate alone is enough to block a product. `level` is a display field; the
      // registry is the evidence. NBA is the live case: level "full", registry
      // HISTORICAL_ONLY — it must NOT reach suggested parlays or Build Your Own.
      assert.equal(
        caps.hasSuggestedParlays,
        false,
        `${sport.key} (level=${sport.level}, registry=${capabilityState(sport.key)}) must not have suggested parlays`,
      );
      assert.equal(
        caps.hasBuildYourOwn,
        false,
        `${sport.key} (level=${sport.level}, registry=${capabilityState(sport.key)}) must not be in BYO`,
      );
      assert.notEqual(caps.status, "modeled", `${sport.key} must not be labelled modeled`);
    }

    // Grading is NOT a blanket downgrade: a sport with a real settled archive keeps it, so
    // /results does not lose a HISTORICAL_ONLY sport's history.
    assert.equal(
      caps.hasGrading,
      levelSaysFull && resultsMode(sport.key) !== "none",
      `${sport.key} grading must follow resultsMode, not prediction eligibility`,
    );
  }
});

test("the registry can only NARROW a level, never widen it", () => {
  // The direction that matters: no sport may gain a capability its coverage level did not
  // already grant. A registry edit can take a product away; it can never hand one out.
  for (const sport of SPORTS_COVERAGE) {
    const caps = getSportCapabilities(sport.key);
    if (sport.level !== "full") {
      assert.equal(caps.hasSuggestedParlays, false, `${sport.key} cannot gain suggested parlays from the registry`);
      assert.equal(caps.hasBuildYourOwn, false, `${sport.key} cannot gain BYO from the registry`);
      assert.equal(caps.hasGrading, false, `${sport.key} cannot gain grading from the registry`);
    }
  }
});

test("only registry-eligible sports pass canShowSuggestedParlays across the whole registry", () => {
  for (const sport of SPORTS_COVERAGE) {
    const expected = sport.level === "full" && capabilityState(sport.key) === "FULL_MODEL";
    assert.equal(
      canShowSuggestedParlays(sport.key),
      expected,
      `${sport.key} suggested gate (level=${sport.level}, registry=${capabilityState(sport.key)})`,
    );
  }
});
