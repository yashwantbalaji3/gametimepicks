/**
 * Tests for the event-market modelability contract. Verifies category logic (not hardcoded per example), the hard
 * gates (private-info ⇒ INFORMATION_ONLY, unclear rules ⇒ UNSUPPORTED), and that only HIGH/MEDIUM may carry an
 * independent probability.
 *
 * Run: npx tsx --test src/lib/event-markets/modelability-contract.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { scoreModelability } from "./modelability-contract.ts";

test("1 · qualification (playoff berth) with structured standings scores HIGH", () => {
  const r = scoreModelability({ category: "qualification" });
  assert.equal(r.classification, "HIGH_MODELABILITY");
  assert.equal(r.mayShowIndependentProbability, true);
});

test("2 · an award (MVP) is HIGH or MEDIUM (structured + comparables), never information-only by default", () => {
  const r = scoreModelability({ category: "award" });
  assert.ok(["HIGH_MODELABILITY", "MEDIUM_MODELABILITY"].includes(r.classification));
  assert.equal(r.mayShowIndependentProbability, true);
});

test("3 · player_movement (next team) is INFORMATION_ONLY — private-information driven", () => {
  const r = scoreModelability({ category: "player_movement" });
  assert.equal(r.classification, "INFORMATION_ONLY");
  assert.equal(r.mayShowIndependentProbability, false, "no independent probability for an insider-driven contract");
  assert.match(r.reasons.join(" "), /private\/insider information/);
});

test("4 · personnel (coach firing) + retirement are INFORMATION_ONLY by default", () => {
  assert.equal(scoreModelability({ category: "personnel" }).classification, "INFORMATION_ONLY");
  assert.equal(scoreModelability({ category: "retirement" }).classification, "INFORMATION_ONLY");
});

test("5 · category is a PRIOR, not a conclusion — strong dimensions can lift a player_movement above the private-info gate", () => {
  // if the specific contract is NOT actually insider-driven (e.g. contract runs out, forced sale) evidence is public
  const r = scoreModelability({ category: "player_movement", dimensions: { privateInformationResistance: 4, structuredDataAvailability: 4, historicalComparables: 4, ruleClarity: 5, outcomeClarity: 5, evidenceAvailability: 4, sourceDiversity: 4, liquidity: 4 } });
  assert.notEqual(r.classification, "INFORMATION_ONLY", "public-evidence-driven movement can be modelable");
  assert.ok(["MEDIUM_MODELABILITY", "HIGH_MODELABILITY"].includes(r.classification));
});

test("6 · unclear rules / ambiguous outcome ⇒ UNSUPPORTED regardless of other strengths", () => {
  const r = scoreModelability({ category: "tournament_winner", dimensions: { ruleClarity: 0, outcomeClarity: 1 } });
  assert.equal(r.classification, "UNSUPPORTED");
  assert.equal(r.mayShowIndependentProbability, false);
});

test("7 · draft_position sits LOW/MEDIUM (semi-structured, some private info)", () => {
  const r = scoreModelability({ category: "draft_position" });
  assert.ok(["LOW_MODELABILITY", "MEDIUM_MODELABILITY", "INFORMATION_ONLY"].includes(r.classification));
});

test("8 · score is normalized 0..1 and byDimension is fully populated", () => {
  const r = scoreModelability({ category: "award" });
  assert.ok(r.score >= 0 && r.score <= 1);
  for (const k of ["outcomeClarity", "ruleClarity", "evidenceAvailability", "structuredDataAvailability", "historicalComparables", "liquidity", "timeToResolution", "privateInformationResistance", "sourceDiversity", "outcomeExhaustiveness"]) {
    assert.ok(k in r.byDimension, `byDimension has ${k}`);
  }
});

test("9 · thin liquidity + single gatekeeper are flagged in reasons", () => {
  const r = scoreModelability({ category: "award", dimensions: { liquidity: 0, sourceDiversity: 0 } });
  assert.match(r.reasons.join(" "), /thin liquidity/);
  assert.match(r.reasons.join(" "), /single gatekeeper/);
});
