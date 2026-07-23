/**
 * Tests for the internal event-market preview assembler. Verifies the honesty invariants: NO independent probability
 * (estimateStatus NOT_YET_MODELED, estimatedProbability null, no "edge"), market probabilities surfaced, evidence
 * timeline ordered + reliability-tagged, scenario tree wired, and the whole thing flagged internal/fixture.
 *
 * Run: npx tsx --test src/lib/event-markets/preview-assembler.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { assemblePreview } from "./preview-assembler.ts";
import { FIXTURE_MARKET, FIXTURE_SNAPSHOT, FIXTURE_EVIDENCE } from "./fixtures/star-player-next-team.ts";

const vm = () => assemblePreview({ market: FIXTURE_MARKET, snapshot: FIXTURE_SNAPSHOT, evidence: FIXTURE_EVIDENCE }, { fixture: true });

test("1 · every estimate is NOT_YET_MODELED with a null probability (no fabricated percentage)", () => {
  const r = vm();
  assert.ok(r.estimates.length === FIXTURE_MARKET.outcomes.length);
  for (const e of r.estimates) {
    assert.equal(e.estimateStatus, "NOT_YET_MODELED");
    assert.equal(e.estimatedProbability, null);
    assert.equal(e.differencePts, null, "no difference without an independent estimate");
    assert.equal(e.forecastConfidence, null);
  }
});

test("2 · market probabilities ARE surfaced (the honest first useful state)", () => {
  const r = vm();
  const teamA = r.estimates.find((e) => e.outcome === "team-a");
  assert.equal(teamA.marketProbability, 0.42);
});

test("3 · a player_movement (next team) contract is INFORMATION_ONLY and may NOT show an independent probability", () => {
  const r = vm();
  assert.equal(r.modelability.classification, "INFORMATION_ONLY");
  assert.equal(r.modelability.mayShowIndependentProbability, false);
});

test("4 · evidence timeline is ordered by publish time + tagged usable/reliability", () => {
  const r = vm();
  const times = r.evidenceTimeline.map((e) => e.publishedAt);
  for (let i = 1; i < times.length; i++) assert.ok(String(times[i - 1]) <= String(times[i]), "ascending by publishedAt");
  assert.ok(r.evidenceTimeline.every((e) => "usableAsTimedEvidence" in e && "reliabilityTier" in e));
});

test("5 · scenario tree wires supporting/opposing evidence per outcome", () => {
  const r = vm();
  const teamA = r.scenarioTree.find((s) => s.outcome === "team-a");
  assert.ok(teamA.supporting.includes("ev-1"), "the Team-A-favoring report supports team-a");
  assert.ok(teamA.opposing.includes("ev-2"), "the cap-space note opposes team-a");
});

test("6 · the whole view-model is internal + fixture + carries the not-a-prediction disclaimer", () => {
  const r = vm();
  assert.equal(r.public, false);
  assert.equal(r.fixture, true);
  assert.match(r.disclaimer, /NOT YET MODELED/);
  assert.match(r.disclaimer, /not a prediction/i);
  // no betting-advantage vocabulary anywhere in the emitted view-model
  const scan = JSON.stringify(r).toLowerCase();
  for (const term of ["\"edge\"", "best bet", "lock", "guaranteed", "beat the market"]) assert.ok(!scan.includes(term), `no "${term}"`);
});

test("7 · contract confidence reflects rule/resolution completeness", () => {
  const r = vm();
  assert.ok(r.estimates[0].contractConfidence >= 0.8, "fixture has full rules + source + deadline");
});
