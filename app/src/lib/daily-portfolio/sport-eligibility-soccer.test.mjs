/**
 * EPL and Ligue 1 were refused by omission: `legSportEligibility` answered UNREGISTERED, which reads as "nobody thought
 * about this". They are now registered and refused for stated reasons, the same contract NFL got. Fail-closed is
 * unchanged: the eligible set is still exactly MLB and World Cup.
 *
 * Run: npx tsx --test src/lib/daily-portfolio/sport-eligibility-soccer.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { SPORT_LEG_RULES, eligibleLegSports, legSportEligibility } from "./sport-eligibility.ts";
import { laneEligibility } from "./accounting.ts";
import { capabilityState } from "../sport-capability-registry.ts";

test("EPL and Ligue 1 are registered and refused, under every spelling a leg can carry", () => {
  for (const [key, spellings] of [["EPL", ["EPL", "epl", " Epl "]], ["LIGUE_1", ["ligue-1", "LIGUE_1", "Ligue 1"]]]) {
    const rule = SPORT_LEG_RULES[key];
    assert.equal(rule?.sport, key);
    assert.equal(rule.eligible, false, `${key} is refused`);
    assert.ok(rule.whatWouldQualify.length >= 3, `${key} names what would change the refusal`);
    for (const sport of spellings) {
      const v = legSportEligibility({ sport });
      assert.equal(v.sport, key);
      assert.equal(v.eligible, false);
      assert.equal(v.unregistered, false, `${sport}: a decision, not an omission`);
      assert.equal(v.code, "NOT_ELIGIBLE");
      assert.equal(v.reason, rule.reason);
    }
  }
});

test("the reasons state what is actually true of each league", () => {
  assert.match(SPORT_LEG_RULES.EPL.reason, /no EPL loader feeds/);
  assert.match(SPORT_LEG_RULES.EPL.reason, /not beaten the market out of sample/);
  assert.match(SPORT_LEG_RULES.LIGUE_1.reason, /no odds/);
  assert.match(SPORT_LEG_RULES.LIGUE_1.reason, /too few matches/);
  for (const key of ["EPL", "ligue-1"]) assert.equal(capabilityState(key), "EXPERIMENTAL_PUBLIC", `${key}: the registry state the reasons rest on`);
});

test("FAIL CLOSED is unchanged: nothing new became eligible, and an unknown sport is still unregistered", () => {
  assert.deepEqual(eligibleLegSports().sort(), ["MLB", "WORLD_CUP"]);
  const unknown = legSportEligibility({ sport: "curling" });
  assert.equal(unknown.eligible, false);
  assert.equal(unknown.unregistered, true);
  assert.equal(unknown.code, "UNREGISTERED");
});

test("the money path refuses a soccer leg with the stated reason", () => {
  for (const sport of ["EPL", "ligue-1"]) {
    const lane = { product: "bank-builder", legCount: 2, targetLegs: 2, combinedOdds: 100, legs: [{ sport, matchup: "Home v Away", kickoffUtc: "2026-11-03T00:00:00Z" }, { sport: "MLB", matchup: "A @ B", kickoffUtc: "2026-11-03T00:00:00Z" }] };
    const verdict = laneEligibility(lane, Date.parse("2026-11-02T12:00:00Z"));
    assert.equal(verdict.eligible, false);
    assert.ok(verdict.reason.includes(legSportEligibility({ sport }).reason), verdict.reason);
  }
});
