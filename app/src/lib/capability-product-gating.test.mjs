/**
 * CAPABILITY-DRIVEN PRODUCT GATING — the migration's acceptance gates (Sprint 026 · Phase 2).
 *
 * The eligibility migration converted the mixed-sport test families onto injected FIXTURE
 * predicates, because mixed-sport mechanics need two eligible sports and only one real sport is
 * FULL_MODEL today. That is the right way to keep the mechanics covered — but on its own it would
 * leave the PRODUCTION path (no predicate, real capability gate) unasserted.
 *
 * This file is that assertion. Every test here calls production helpers with NO predicate, so it
 * fails if the real gate ever stops refusing an ineligible sport.
 *
 * Run: npx tsx --test src/lib/capability-product-gating.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  MODELED_SPORT_KEYS,
  getSportCapabilities,
  canShowSuggestedParlays,
  canUseInBuildYourOwn,
  canGradeSport,
  isOfficialSuggestedParlayAllowed,
  isBuildYourOwnParlayAllowed,
  filterBuildYourOwnLegs,
  filterOfficialSuggestedSlips,
  allSportsEligible,
} from "./sport-capabilities.ts";
import {
  capabilityState,
  canEnterPredictionProducts,
  resultsMode,
  FULL_MODEL_SPORTS,
} from "./sport-capability-registry.ts";
import { generateCustomParlaysFromPool } from "./custom-parlay-generator.ts";
import { selectPublishedSections, countPublishedSections } from "./published-cards.ts";

/** Every sport the registry does NOT clear for prediction products. */
const ineligibleSports = () =>
  ["nba", "nhl", "wnba", "ufc", "ipl", "mls", "epl", "cricket", "tennis", ""].filter(
    (s) => !canEnterPredictionProducts(s),
  );

// --- Gate: the registry, not a hardcoded constant, decides -------------------

test("GATE · product eligibility is registry-derived, not a hardcoded sport list", () => {
  assert.deepEqual(
    [...MODELED_SPORT_KEYS].sort(),
    [...FULL_MODEL_SPORTS].sort(),
    "the modeled set must be exactly the registry's FULL_MODEL set",
  );
  // A second FULL_MODEL sport therefore becomes eligible with no constant to edit: the rule is
  // `every sport on the slip is eligible`, evaluated per sport.
  assert.equal(allSportsEligible(["a", "b"], (s) => s === "a" || s === "b"), true);
  assert.equal(allSportsEligible(["a", "b"], (s) => s === "a"), false);
});

test("GATE · unknown sport fails closed across every product surface", () => {
  for (const s of ["", "tennis", "quidditch", "multi", "all", null, undefined]) {
    assert.equal(canShowSuggestedParlays(s), false, `${s}: suggested`);
    assert.equal(canUseInBuildYourOwn(s), false, `${s}: BYO`);
    assert.equal(canGradeSport(s), false, `${s}: grading`);
    assert.equal(isOfficialSuggestedParlayAllowed([s]), false, `${s}: official slip`);
    assert.equal(isBuildYourOwnParlayAllowed([s]), false, `${s}: BYO slip`);
  }
});

test("GATE · an eligible sport beside an ineligible one is blocked, not partially allowed", () => {
  const ok = MODELED_SPORT_KEYS[0];
  assert.ok(ok, "need one eligible sport");
  for (const bad of ineligibleSports()) {
    if (!bad) continue;
    assert.equal(isOfficialSuggestedParlayAllowed([ok, bad]), false, `${ok}+${bad}: official`);
    assert.equal(isBuildYourOwnParlayAllowed([ok, bad]), false, `${ok}+${bad}: BYO`);
  }
});

test("GATE · HISTORICAL_ONLY keeps its archive but cannot enter a new product", () => {
  const historical = ["nba", "nhl", "wnba", "ufc", "ipl", "mls", "epl"].filter(
    (s) => capabilityState(s) === "HISTORICAL_ONLY",
  );
  assert.ok(historical.length > 0, "fixture precondition: at least one HISTORICAL_ONLY sport");
  for (const s of historical) {
    // Blocked from anything forward-looking...
    assert.equal(canEnterPredictionProducts(s), false, `${s} must not enter prediction products`);
    assert.equal(canShowSuggestedParlays(s), false, `${s} must not reach suggested parlays`);
    assert.equal(canUseInBuildYourOwn(s), false, `${s} must not reach Build Your Own`);
    assert.notEqual(getSportCapabilities(s).status, "modeled", `${s} must not be labelled modeled`);
    // ...but its real settled history survives, or /results silently loses an archive.
    assert.equal(resultsMode(s), "archive", `${s} should still expose its archive`);
    assert.equal(canGradeSport(s), true, `${s} must keep grading for its settled archive`);
  }
});

// --- Gate: the REAL production path, with no predicate injected --------------

const leg = (sport, id) => ({
  sport,
  leanId: id,
  playerId: id,
  playerName: `P${id}`,
  market: "PTS",
  marketLabel: "Points",
  gameId: `g${id}`,
  team: "AAA",
  side: "Over",
  recent10Count: 10,
  recentSeries: [1, 2, 3, 4, 5, 6],
  starTier: "star",
  americanOdds: -110,
});

test("PRODUCTION · the BYO leg gate drops every ineligible sport (no predicate injected)", () => {
  const bad = ineligibleSports().filter(Boolean);
  assert.ok(bad.length > 0, "fixture precondition: at least one ineligible sport");
  const pool = bad.map((s, i) => leg(s, `bad${i}`));
  assert.deepEqual(filterBuildYourOwnLegs(pool), [], "no ineligible leg may survive the BYO gate");

  // ...and an eligible leg mixed in is the ONLY survivor.
  const ok = leg(MODELED_SPORT_KEYS[0], "ok");
  assert.deepEqual(filterBuildYourOwnLegs([...pool, ok]), [ok]);
});

test("PRODUCTION · the parlay generator refuses an ineligible pool even in multi mode", () => {
  // multi mode deliberately keeps every sport, so this is where an unfiltered pool would leak.
  const bad = ineligibleSports().filter(Boolean);
  const pool = bad.flatMap((s, i) => [leg(s, `x${i}a`), leg(s, `x${i}b`), leg(s, `x${i}c`)]);
  for (const sport of ["all", "multi"]) {
    const res = generateCustomParlaysFromPool(pool, { sport, count: 3 });
    assert.equal(res.poolSize, 0, `${sport}: ineligible legs must not enter the pool`);
    assert.deepEqual(res.slips, [], `${sport}: no slip may be generated from ineligible legs`);
  }
});

test("PRODUCTION · official suggested selection drops ineligible-sport slips", () => {
  const bad = ineligibleSports().filter(Boolean);
  const slips = bad.map((s, i) => ({ slipId: `s${i}`, legs: [{ sport: s }, { sport: s }] }));
  assert.deepEqual(filterOfficialSuggestedSlips(slips), [], "no ineligible slip may be published");

  // And through the real published-cards path, with no predicate injected.
  const sec = () => ({ mlb: [], nba: slips, multi: [], all: [] });
  const psr = { low: sec(), medium: sec(), high: sec(), longshot: sec() };
  for (const view of ["nba", "multi", "all"]) {
    assert.equal(
      countPublishedSections(selectPublishedSections(psr, view)),
      0,
      `${view}: an ineligible sport must publish zero cards`,
    );
  }
});

// --- Gate: no shadow gate re-introduces a hardcoded eligibility list ---------

test("GATE · no product helper decides eligibility from a hardcoded sport list", () => {
  // The migration's whole point: capability lives in ONE place. These helpers must reach the
  // registry (directly or via sport-capabilities), never carry their own membership list.
  const files = [
    "src/lib/custom-parlay.ts",
    "src/lib/custom-parlay-generator.ts",
    "src/lib/published-cards.ts",
    "src/lib/build-a-parlay-config.ts",
  ];
  for (const rel of files) {
    const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "") // strip block comments
      .replace(/\/\/.*$/gm, ""); // strip line comments
    assert.doesNotMatch(
      code,
      /\[\s*"(nba|mlb)"\s*,\s*"(nba|mlb)"\s*\]/,
      `${rel}: a hardcoded modeled-sport list is a shadow eligibility gate`,
    );
    assert.match(
      code,
      /sport-capabilities|sport-capability-registry/,
      `${rel}: must reach the capability layer rather than decide for itself`,
    );
  }
});
