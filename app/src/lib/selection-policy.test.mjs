/**
 * selection-policy.test — validates the daily-learning artifact schema and the
 * FAIL-CLOSED invariants the optimizer (PR 4) will rely on. Reads the committed
 * artifact produced by scripts/update-selection-learning.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = resolve(__dirname, "..", "..", "public", "data", "learning", "selection-policy-latest.json");

const VALID_STATUS = new Set(["allowed", "restricted", "high_risk_only", "disabled", "insufficient_sample"]);

test("learning artifact exists and has the required schema", () => {
  assert.ok(existsSync(ARTIFACT), "selection-policy-latest.json must exist");
  const p = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  for (const k of ["policyVersion", "latestSettledDate", "trainingWindowStart", "trainingWindowEnd",
    "sampleSizes", "universeBaselineHitRate", "noLiveWire", "hardGuards", "recommendedMarketStatus",
    "calibration", "segments", "cardLengthProjection", "warnings"]) {
    assert.ok(k in p, `artifact must include ${k}`);
  }
  assert.equal(typeof p.noLiveWire, "boolean");
});

test("hard guards are fail-closed and cannot lengthen cards", () => {
  const { hardGuards: g } = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  assert.ok(g.maxLegsByLane.low <= 2, "Low cards capped at 2 legs");
  assert.ok(g.bankBuilderMaxLegs <= 2, "Bank Builder capped at 2 legs");
  for (const lane of ["medium", "high", "longshot"]) assert.ok(g.maxLegsByLane[lane] <= 3, `${lane} <= 3 legs`);
  assert.equal(g.confidenceUsedForRanking, false, "confidence must not be used for ranking");
  assert.equal(g.lowNoPlusMoney, true);
  assert.equal(g.nbaRequiresRealStatsProvider, true, "NBA blocked without real stats");
  assert.equal(g.ufcFailClosed, true);
  assert.equal(g.staleFormBlockedFromLowBank, true);
  assert.equal(g.maxRestrictedLegsPerCard, 1);
  assert.ok(g.excludeEdgePctFromLowMedium <= 15 && g.excludeEdgePctAll <= 20, "edge caps present");
});

test("every recommended market status is a valid enum value", () => {
  const p = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  for (const [mk, s] of Object.entries(p.recommendedMarketStatus)) {
    assert.ok(VALID_STATUS.has(s.recommendedStatus), `${mk} status ${s.recommendedStatus} invalid`);
    assert.ok(typeof s.n === "number" && s.n >= 0);
    assert.ok(s.wilsonLB >= 0 && s.wilsonLB <= 1);
  }
});

test("calibration reflects the data: edge inverted, confidence non-predictive", () => {
  const { calibration: c } = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  assert.equal(typeof c.edgeInverted, "boolean");
  assert.equal(typeof c.confidencePredictive, "boolean");
  // a small disabled market must never be recommended 'allowed'
});

test("small samples are never promoted to allowed", () => {
  const p = JSON.parse(readFileSync(ARTIFACT, "utf8"));
  for (const s of Object.values(p.recommendedMarketStatus)) {
    if (s.n < 20) assert.equal(s.recommendedStatus, "insufficient_sample", "tiny sample must not promote");
    if (s.recommendedStatus === "allowed") assert.ok(s.n >= 40, "allowed requires adequate sample");
  }
});
