import { test } from "node:test";
import assert from "node:assert/strict";
import { RISK_BUCKETS, RISK_LABELS, normalizeRiskBucket, riskLabel, RISK_GATES, CARD_GENERATION_TARGETS } from "./risk-taxonomy.ts";

test("public labels are Low Risk / Medium Risk / High Risk / Longshot", () => {
  assert.deepEqual(RISK_BUCKETS, ["low", "medium", "high", "longshot"]);
  assert.equal(RISK_LABELS.low, "Low Risk");
  assert.equal(RISK_LABELS.medium, "Medium Risk");
  assert.equal(RISK_LABELS.high, "High Risk");
  assert.equal(RISK_LABELS.longshot, "Longshot");
});

test("old/alias risk strings normalize to canonical buckets", () => {
  assert.equal(normalizeRiskBucket("lower_variance"), "low");
  assert.equal(normalizeRiskBucket("Lower Variance"), "low");
  assert.equal(normalizeRiskBucket("balanced"), "medium");
  assert.equal(normalizeRiskBucket("higher_return"), "high");
  assert.equal(normalizeRiskBucket("higher-return"), "high");
  assert.equal(normalizeRiskBucket("longshot"), "longshot");
  assert.equal(normalizeRiskBucket("nonsense"), null);
});

test("riskLabel renders the canonical public label and never the old labels", () => {
  for (const old of ["lower_variance", "balanced", "higher_return"]) {
    const label = riskLabel(old);
    assert.ok(/Risk|Longshot/.test(label), `${old} → a canonical label`);
    assert.ok(!/lower variance|balanced|higher return/i.test(label), `${old} must not render the old label`);
  }
  assert.equal(riskLabel("medium"), "Medium Risk");
});

test("risk gates: Low is shortest/fewest legs, Longshot is the most legs + highest payout band", () => {
  assert.equal(RISK_GATES.low.legs.max, 2, "Low Risk never produces a 5-leg longshot");
  assert.equal(RISK_GATES.longshot.legs.max, 5);
  assert.ok(RISK_GATES.longshot.legs.min >= 3, "Longshot is multi-leg");
  assert.ok(RISK_GATES.high.combinedOdds.min > RISK_GATES.medium.combinedOdds.min, "High Risk targets higher payout than Medium");
  assert.equal(RISK_GATES.longshot.volatility, "highest", "Longshot flags highest volatility");
});

test("generation targets include all four buckets for every scope", () => {
  for (const scope of Object.keys(CARD_GENERATION_TARGETS)) {
    for (const b of RISK_BUCKETS) {
      const t = CARD_GENERATION_TARGETS[scope][b];
      assert.ok(t && typeof t.target === "number" && t.max >= t.target && t.target >= t.min, `${scope}.${b} target valid`);
    }
  }
});
