/**
 * Methodology framework v1 contracts: leakage validation, confidence (≠ probability), risk scoring,
 * sample-size buckets, and the sport feature registries (honest implementation status).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { validateLeakage } from "./methodology/validation.ts";
import { computeConfidence, categorize } from "./methodology/confidence.ts";
import { computeRisk } from "./methodology/risk.ts";
import { sampleSizeBucket, sampleWeight, FEATURE_PRIORITY, NEVER_USE } from "./methodology/global-rules.ts";
import { REGISTRIES, coverage } from "./methodology/sport-feature-groups.ts";

const base = {
  eventId: "e1", sport: "MLB", leagueOrCompetition: "MLB", predictionTarget: "batter_hits",
  predictionTime: "2026-06-17T18:00:00Z", eventStartTime: "2026-06-17T23:00:00Z",
  dataCutoffTime: "2026-06-17T17:55:00Z", featureSnapshotTime: "2026-06-17T17:50:00Z",
  marketSnapshotTime: "2026-06-17T17:45:00Z", lineupSnapshotTime: "2026-06-17T17:30:00Z",
};

test("sample-size buckets + weights map per the spec", () => {
  assert.equal(sampleSizeBucket(0), "sample_size_0");
  assert.equal(sampleSizeBucket(3), "sample_size_1_to_5");
  assert.equal(sampleSizeBucket(10), "sample_size_6_to_15");
  assert.equal(sampleSizeBucket(20), "sample_size_16_to_30");
  assert.equal(sampleSizeBucket(31), "sample_size_31_plus");
  assert.equal(sampleWeight(0), 0);
  assert.ok(sampleWeight(3) < sampleWeight(20) && sampleWeight(31) === 1);
});

test("leakage: a valid pre-game prediction passes", () => {
  const r = validateLeakage(base, [
    { windowStartTime: "2026-05-01T00:00:00Z", windowEndTime: "2026-06-16T23:59:00Z", sampleSize: 20, includesTargetEventFlag: false },
  ]);
  assert.equal(r.passed, true, JSON.stringify(r.checks.filter((c) => !c.passed)));
});

test("leakage: feature snapshot AFTER prediction time fails", () => {
  const r = validateLeakage({ ...base, featureSnapshotTime: "2026-06-17T18:30:00Z" });
  assert.equal(r.passed, false);
  assert.ok(r.checks.find((c) => c.name === "features_at_or_before_prediction" && !c.passed));
});

test("leakage: prediction at/after event start fails", () => {
  const r = validateLeakage({ ...base, predictionTime: "2026-06-17T23:30:00Z" });
  assert.equal(r.passed, false);
  assert.ok(r.checks.find((c) => c.name === "prediction_before_event_start" && !c.passed));
});

test("leakage: a market snapshot after prediction time fails (no closing-odds leak)", () => {
  const r = validateLeakage({ ...base, marketSnapshotTime: "2026-06-17T18:30:00Z" });
  assert.equal(r.passed, false);
  assert.ok(r.checks.find((c) => c.name === "market_snapshot_not_after_prediction" && !c.passed));
});

test("leakage: a rolling window that includes the target event fails", () => {
  const r = validateLeakage(base, [
    { windowStartTime: "2026-05-01T00:00:00Z", windowEndTime: "2026-06-18T00:00:00Z", sampleSize: 21, includesTargetEventFlag: false },
  ]);
  assert.equal(r.passed, false); // window end is after event start
});

test("confidence is NOT probability — driven by data-quality components", () => {
  const fresh = computeConfidence({
    dataFreshnessScore: 1, roleCertaintyScore: 1, sampleSizeScore: 1, modelAgreementScore: 1,
    marketAgreementScore: 1, lineupCertaintyScore: 1, projectionVolatilityPenalty: 0, missingCriticalDataPenalty: 0,
  });
  assert.equal(fresh.category, "High");
  const stale = computeConfidence({
    dataFreshnessScore: 0.2, roleCertaintyScore: 0.3, sampleSizeScore: 0.2, modelAgreementScore: 0.3,
    marketAgreementScore: 0.2, lineupCertaintyScore: 0.2, projectionVolatilityPenalty: 0.8, missingCriticalDataPenalty: 0,
  });
  assert.ok(stale.score < fresh.score, "stale/volatile lowers confidence");
  // missing critical data forces No Bet regardless of score
  assert.equal(categorize(0.9, { missingCriticalDataPenalty: 0.6 }), "No Bet");
});

test("risk: fragile/DNP/stale raise the score; clean is low", () => {
  const clean = computeRisk({ roleUncertainty: 0.1, staleData: false, missingCriticalData: false, smallSample: false, volatileMarket: false, fragilePropType: false, dnpOrScratchRisk: false, overCorrelation: false });
  const fragile = computeRisk({ roleUncertainty: 0.8, staleData: true, missingCriticalData: false, smallSample: true, volatileMarket: false, fragilePropType: true, dnpOrScratchRisk: true, overCorrelation: false });
  assert.equal(clean.band, "low");
  assert.ok(fragile.score > clean.score && fragile.band !== "low");
  assert.ok(fragile.drivers.includes("dnp or scratch risk") || fragile.drivers.some((d) => d.includes("dnp")));
});

test("registries cover all four sports with priorities + honest status + leakage rules", () => {
  for (const sport of ["MLB", "NBA", "UFC", "WORLD_CUP"]) {
    const reg = REGISTRIES[sport];
    assert.ok(reg.priorities.length >= 8, `${sport} has an opportunity-first priority list`);
    assert.ok(reg.features.length >= 12, `${sport} defines features`);
    for (const ftr of reg.features) {
      assert.ok(ftr.leakageRule && ftr.group, `${sport}/${ftr.name} has a group + leakage rule`);
      assert.ok(["implemented", "partial", "planned", "not_available"].includes(ftr.status));
    }
    // honesty: at least one not-yet-built feature is explicitly marked
    assert.ok(reg.features.some((x) => x.status === "planned" || x.status === "not_available"),
      `${sport} honestly marks unbuilt features`);
    // every sport has a leakage-validation feature
    assert.ok(reg.features.some((x) => x.group === "validation"));
    const cov = coverage(sport);
    assert.equal(cov.implemented + cov.partial + cov.planned + cov.not_available, reg.features.length);
  }
});

test("opportunity-first hierarchy + never-use list are codified", () => {
  assert.equal(FEATURE_PRIORITY[0], "availability");
  assert.ok(FEATURE_PRIORITY.indexOf("opportunity") < FEATURE_PRIORITY.indexOf("efficiency"), "opportunity before efficiency");
  assert.ok(FEATURE_PRIORITY.indexOf("market") < FEATURE_PRIORITY.indexOf("validation"));
  assert.ok(NEVER_USE.includes("target_game_box_score") && NEVER_USE.includes("rolling_averages_that_include_target_event"));
});
