/**
 * Tests for the source-reliability framework. Tiers are ranks (not probabilities); domain overrides; copied reports
 * dedupe to the most authoritative; retractions flag (not delete) superseded items; many low-quality != one
 * authoritative. Run: npx tsx --test src/lib/event-markets/source-reliability.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { resolveTier, atLeastAsReliable, dedupeEvidence, applyRetractions, RELIABILITY_TIERS } from "./source-reliability.ts";

const config = {
  assignments: [
    { source: "OfficialFeed", tier: "official", version: "v1" },
    { source: "AceReporter", tier: "tier1_reporter", version: "v1" },
    { source: "AceReporter", tier: "aggregator", domain: "gossip", version: "v1" }, // same source, different domain
    { source: "RumorMill", tier: "social_unverified", version: "v1" },
  ],
  defaultTier: "aggregator",
};

test("1 · tiers are ranks, not probabilities (official is rank 1, social is rank 5)", () => {
  assert.equal(RELIABILITY_TIERS.official.rank, 1);
  assert.equal(RELIABILITY_TIERS.social_unverified.rank, 5);
});

test("2 · a domain-scoped assignment overrides the global one", () => {
  assert.equal(resolveTier(config, "AceReporter").tier, "tier1_reporter");
  assert.equal(resolveTier(config, "AceReporter", "gossip").tier, "aggregator", "same reporter is only an aggregator in the gossip domain");
});

test("3 · an unknown source falls back to the conservative default", () => {
  const r = resolveTier(config, "WhoDis");
  assert.equal(r.tier, "aggregator");
  assert.equal(r.matched, "default");
});

test("4 · atLeastAsReliable orders by authority", () => {
  assert.equal(atLeastAsReliable("official", "tier1_reporter"), true);
  assert.equal(atLeastAsReliable("social_unverified", "official"), false);
});

test("5 · copied reports dedupe to the MOST authoritative source (many aggregators != one official)", () => {
  const items = [
    { claim: "Team A signs Player X", entities: ["player-x"], reliabilityTier: "aggregator" },
    { claim: "team a signs player x", entities: ["player-x"], reliabilityTier: "social_unverified" },
    { claim: "Team A  signs   Player X", entities: ["player-x"], reliabilityTier: "official" }, // the authoritative copy
  ];
  const deduped = dedupeEvidence(items);
  assert.equal(deduped.length, 1, "all three collapse to one market claim");
  assert.equal(deduped[0].reliabilityTier, "official", "the official copy survives");
});

test("6 · retractions flag (never delete) superseded evidence", () => {
  const items = [
    { evidenceId: "e1" },
    { evidenceId: "e2", retracts: ["e1"] },
    { evidenceId: "e3" },
  ];
  const { active, superseded } = applyRetractions(items);
  assert.deepEqual(active.map((x) => x.evidenceId).sort(), ["e2", "e3"]);
  assert.deepEqual(superseded.map((x) => x.evidenceId), ["e1"], "e1 is retained as superseded, not deleted");
});
