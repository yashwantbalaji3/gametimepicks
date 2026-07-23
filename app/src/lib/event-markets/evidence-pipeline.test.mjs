/**
 * EVIDENCE-PIPELINE DEMONSTRATION (Phase 15). End-to-end, FIXTURES ONLY: a fixture EventMarket + EvidenceItems flow
 * through evidence-store (validation) → source-reliability (dedupe + tier ranking) → preview-assembler, producing an
 * OutcomeEstimate PREVIEW. Proves the two honesty invariants:
 *   - the preview NEVER emits a fabricated probability (every estimate is NOT_YET_MODELED / estimatedProbability null);
 *   - source-reliability weighting is applied DETERMINISTICALLY (social_unverified is down-weighted; same in → same out).
 *
 * No new production module — this composes the existing event-market libs. Run:
 *   npx tsx --test src/lib/event-markets/evidence-pipeline.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateEvidence, isEstablishedEvidence, provenanceHash } from "./evidence-store.ts";
import { resolveTier, dedupeEvidence, atLeastAsReliable, RELIABILITY_TIERS } from "./source-reliability.ts";
import { assemblePreview } from "./preview-assembler.ts";
import { FIXTURE_MARKET, FIXTURE_SNAPSHOT, FIXTURE_EVIDENCE } from "./fixtures/star-player-next-team.ts";

// A reliability config for the fixture's sources (deterministic; scoped to this demonstration).
const reliabilityConfig = {
  assignments: [
    { source: "Fixture Beat Reporter", tier: "tier1_reporter", version: "v1" },
    { source: "Fixture Cap Analyst", tier: "reputable_outlet", version: "v1" },
    { source: "Fixture Social (unverified)", tier: "social_unverified", version: "v1" },
  ],
  defaultTier: "aggregator",
};

/** Deterministic reliability weight from the tier RANK (official 1.0 … social 0.2). NOT a probability — an ordering weight. */
const reliabilityWeight = (tier) => (6 - RELIABILITY_TIERS[tier].rank) / 5;

/** The assembler's evidence-completeness rule, recomputed independently to prove the weighting is what's applied. */
const expectedCompleteness = (outcomeId, evidence) => {
  const touching = evidence.filter((e) => outcomeId in e.directionByOutcome && e.publishedAt != null);
  const weight = touching.reduce((a, e) => a + (e.reliabilityTier === "social_unverified" ? 0.1 : e.confidence), 0);
  return Number(Math.max(0, Math.min(1, weight / 2)).toFixed(2));
};

/** Full pipeline: validate (evidence-store) → dedupe copied reports (source-reliability) → assemble preview. */
function runPipeline(evidence = FIXTURE_EVIDENCE) {
  const usable = evidence.filter((e) => validateEvidence(e).valid);
  const deduped = dedupeEvidence(usable);
  const preview = assemblePreview({ market: FIXTURE_MARKET, snapshot: FIXTURE_SNAPSHOT, evidence: deduped }, { fixture: true });
  return { usable, deduped, preview };
}

test("1 · step 1 (evidence-store) · every fixture EvidenceItem validates + earns a provenance hash", () => {
  for (const e of FIXTURE_EVIDENCE) {
    const v = validateEvidence(e);
    assert.equal(v.valid, true, `${e.evidenceId} should validate`);
    assert.equal(v.provenanceHash.length, 32);
    assert.equal(provenanceHash(e).length, 32);
  }
  const social = FIXTURE_EVIDENCE.find((e) => e.reliabilityTier === "social_unverified");
  assert.equal(validateEvidence(social).valid, true, "social item is retained (valid)");
  assert.equal(isEstablishedEvidence(social), false, "but is NOT established evidence");
});

test("2 · step 2 (source-reliability) · sources resolve to deterministic tiers with a monotonic rank order", () => {
  assert.equal(resolveTier(reliabilityConfig, "Fixture Beat Reporter").tier, "tier1_reporter");
  assert.equal(resolveTier(reliabilityConfig, "Fixture Cap Analyst").tier, "reputable_outlet");
  assert.equal(resolveTier(reliabilityConfig, "Fixture Social (unverified)").tier, "social_unverified");
  assert.equal(resolveTier(reliabilityConfig, "Unknown Source").matched, "default", "unknown ⇒ conservative default");
  const ranks = ["official", "tier1_reporter", "reputable_outlet", "aggregator", "social_unverified"].map((t) => RELIABILITY_TIERS[t].rank);
  for (let i = 1; i < ranks.length; i++) assert.ok(ranks[i - 1] < ranks[i], "ranks strictly increase official → social");
  assert.equal(atLeastAsReliable("tier1_reporter", "social_unverified"), true);
});

test("3 · step 2 (source-reliability) · copied reports dedupe to the MOST authoritative (many aggregators != one official)", () => {
  const copies = [
    { evidenceId: "c1", claim: "Team A signs Player X", entities: ["player-x"], reliabilityTier: "aggregator" },
    { evidenceId: "c2", claim: "team a signs player x", entities: ["player-x"], reliabilityTier: "social_unverified" },
    { evidenceId: "c3", claim: "Team A  signs   Player X", entities: ["player-x"], reliabilityTier: "official" },
  ];
  const survivors = dedupeEvidence(copies);
  assert.equal(survivors.length, 1);
  assert.equal(survivors[0].reliabilityTier, "official");
});

test("4 · step 3 (preview-assembler) · every outcome estimate is NOT_YET_MODELED with a null probability (no fabricated percentage)", () => {
  const { preview } = runPipeline();
  assert.equal(preview.estimates.length, FIXTURE_MARKET.outcomes.length);
  for (const e of preview.estimates) {
    assert.equal(e.estimateStatus, "NOT_YET_MODELED");
    assert.equal(e.estimatedProbability, null);
    assert.equal(e.differencePts, null);
    assert.equal(e.forecastConfidence, null);
  }
});

test("5 · no-probability honesty · the preview asserts NO independent probability + carries no advantage vocabulary", () => {
  const { preview } = runPipeline();
  assert.equal(preview.modelability.mayShowIndependentProbability, false, "player_movement (insider-driven) may not show an independent number");
  assert.match(preview.disclaimer, /NOT YET MODELED/);
  const scan = JSON.stringify(preview).toLowerCase();
  for (const term of ["\"edge\"", "best bet", "lock", "guaranteed", "beat the market"]) assert.ok(!scan.includes(term), `no "${term}"`);
});

test("6 · source-reliability weighting IS applied deterministically · assembler completeness matches the weighted formula + is reproducible", () => {
  const { deduped, preview } = runPipeline();
  const teamC = preview.estimates.find((e) => e.outcome === "team-c");
  // the assembler's number equals the reliability-weighted formula (social_unverified contributes only 0.1)
  assert.equal(teamC.evidenceCompleteness, expectedCompleteness("team-c", deduped));
  assert.equal(teamC.evidenceCompleteness, 0.7, "0.7 (tier1 0.7 + reputable 0.6 + social CAPPED 0.1) / 2");
  // if the social item were (wrongly) counted at its raw 0.2 confidence, completeness would be 0.75 — proving the cap is applied
  assert.notEqual(teamC.evidenceCompleteness, 0.75);
  // determinism: identical inputs ⇒ byte-identical preview
  assert.equal(JSON.stringify(runPipeline().preview), JSON.stringify(runPipeline().preview));
});

test("7 · reliability weighting is causal · promoting the social_unverified item to an established tier strictly increases that outcome's completeness", () => {
  const promoted = FIXTURE_EVIDENCE.map((e) => (e.reliabilityTier === "social_unverified" ? { ...e, reliabilityTier: "tier1_reporter" } : e));
  const base = runPipeline().preview.estimates.find((e) => e.outcome === "team-c").evidenceCompleteness;
  const lifted = runPipeline(promoted).preview.estimates.find((e) => e.outcome === "team-c").evidenceCompleteness;
  assert.ok(lifted > base, `promoting the source lifts completeness (${base} → ${lifted})`);
  // the deterministic tier weight rises accordingly (0.2 → 0.8) — an ordering weight, never a probability
  assert.ok(reliabilityWeight("tier1_reporter") > reliabilityWeight("social_unverified"));
});

test("8 · end-to-end provenance · pipeline is internal/fixture, surfaces MARKET prices, keeps the independent estimate null (market != model)", () => {
  const { preview } = runPipeline();
  assert.equal(preview.public, false);
  assert.equal(preview.fixture, true);
  const teamA = preview.estimates.find((e) => e.outcome === "team-a");
  assert.equal(teamA.marketProbability, 0.42, "the platform's implied number is surfaced as market context");
  assert.equal(teamA.estimatedProbability, null, "our independent estimate stays null (NOT the market number)");
});
