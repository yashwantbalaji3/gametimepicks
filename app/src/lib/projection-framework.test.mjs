/**
 * Tests for projection-framework — the canonical cross-sport scoring layer.
 * Locks: no-vig two-way normalization, edge math, composite confidence gating
 * (thin/stale/contrarian cannot read "strong"), data-quality tiering, the
 * shared parlay-eligibility gate, and the card concentration score.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  americanToImpliedRaw,
  noVigTwoWay,
  marketProbability,
  edgePoints,
  clampProb,
  compositeConfidenceScore,
  confidenceBucket,
  dataQualityTier,
  parlayEligibility,
  concentrationScore,
  concentrationLabel,
} from "./projection-framework.ts";

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("americanToImpliedRaw: signs + null guard", () => {
  assert.ok(approx(americanToImpliedRaw(100), 0.5));
  assert.ok(approx(americanToImpliedRaw(-110), 110 / 210));
  assert.ok(approx(americanToImpliedRaw(150), 100 / 250));
  assert.equal(americanToImpliedRaw(0), null);
  assert.equal(americanToImpliedRaw(null), null);
  assert.equal(americanToImpliedRaw(undefined), null);
  assert.equal(americanToImpliedRaw(NaN), null);
});

test("noVigTwoWay: strips overround so the two sides sum to 1", () => {
  const r = noVigTwoWay(-110, -110);
  assert.ok(r);
  assert.ok(approx(r.side + r.other, 1));
  assert.ok(approx(r.side, 0.5));
  // a clear favorite/dog pair still sums to 1 after de-vig
  const fav = noVigTwoWay(-300, +250);
  assert.ok(fav);
  assert.ok(approx(fav.side + fav.other, 1));
  assert.ok(fav.side > fav.other);
  // missing a side ⇒ null (never fabricate)
  assert.equal(noVigTwoWay(-110, null), null);
});

test("marketProbability: prefers no-vig, falls back to raw, else null", () => {
  // no-vig (both sides) < raw single-sided for -110
  const novig = marketProbability(-110, -110);
  const raw = marketProbability(-110);
  assert.ok(novig < raw);
  assert.ok(approx(novig, 0.5));
  assert.equal(marketProbability(null), null);
});

test("edgePoints: (model − market) × 100, null-safe", () => {
  assert.ok(approx(edgePoints(0.6, 0.5), 10));
  assert.ok(approx(edgePoints(0.4, 0.5), -10));
  assert.equal(edgePoints(null, 0.5), null);
  assert.equal(edgePoints(0.6, undefined), null);
});

test("clampProb: bounds into (0.5%, 99.5%)", () => {
  assert.ok(approx(clampProb(0), 0.005));
  assert.ok(approx(clampProb(1), 0.995));
  assert.ok(approx(clampProb(0.5), 0.5));
});

test("compositeConfidence: thin/stale/contrarian cannot read strong", () => {
  const strong = compositeConfidenceScore({
    modelProbability: 0.7, edgePp: 10, dataCompleteness: 1, sampleSize: 20,
    freshness: 1, marketAgrees: true,
  });
  const thin = compositeConfidenceScore({
    modelProbability: 0.7, edgePp: 10, dataCompleteness: 1, sampleSize: 0,
    freshness: 1, marketAgrees: true,
  });
  const stale = compositeConfidenceScore({
    modelProbability: 0.7, edgePp: 10, dataCompleteness: 1, sampleSize: 20,
    freshness: 0.2, marketAgrees: true,
  });
  const contrarian = compositeConfidenceScore({
    modelProbability: 0.7, edgePp: 10, dataCompleteness: 1, sampleSize: 20,
    freshness: 1, marketAgrees: false,
  });
  assert.ok(strong > thin, "thin sample is discounted");
  assert.ok(strong > stale, "stale source is discounted");
  assert.ok(strong > contrarian, "market disagreement is discounted");
  assert.ok(strong <= 1 && thin >= 0);
});

test("confidenceBucket: model-only ⇒ watchlist; longshot labeling", () => {
  assert.equal(confidenceBucket(0.9, { modelProbability: 0.7, oddsBacked: false }), "watchlist");
  assert.equal(confidenceBucket(0.7, { modelProbability: 0.7, oddsBacked: true }), "strong");
  assert.equal(
    confidenceBucket(0.5, { modelProbability: 0.25, oddsBacked: true }),
    "high-risk value",
  );
  assert.equal(
    confidenceBucket(0.3, { modelProbability: 0.25, oddsBacked: true }),
    "longshot",
  );
  assert.equal(confidenceBucket(0.1, { modelProbability: 0.6, oddsBacked: true }), "watchlist");
});

test("dataQualityTier: A requires the full stack; unavailable on nothing", () => {
  assert.equal(dataQualityTier({
    hasCurrentOdds: true, hasFullStats: true, eventConfirmed: true,
    freshness: 1, sampleSize: 10,
  }), "A");
  assert.equal(dataQualityTier({
    hasCurrentOdds: true, hasFullStats: false, eventConfirmed: true,
    freshness: 1, sampleSize: 1,
  }), "B");
  assert.equal(dataQualityTier({
    hasCurrentOdds: false, hasFullStats: true, eventConfirmed: false,
    freshness: 0.5, sampleSize: 4,
  }), "C");
  assert.equal(dataQualityTier({
    hasCurrentOdds: false, hasFullStats: false, eventConfirmed: false,
    freshness: 0, sampleSize: 0,
  }), "unavailable");
});

test("parlayEligibility: every gate must pass; model-only is rejected", () => {
  const good = parlayEligibility({
    oddsBacked: true, modelOnly: false, isToday: true, settled: false,
    stale: false, marketSupported: true, sourceFailed: false, dataQuality: "A",
  });
  assert.equal(good.eligible, true);
  assert.deepEqual(good.reasons, []);

  const modelOnly = parlayEligibility({
    oddsBacked: false, modelOnly: true, isToday: true, settled: false,
    stale: false, marketSupported: true, sourceFailed: false, dataQuality: "C",
  });
  assert.equal(modelOnly.eligible, false);
  assert.ok(modelOnly.reasons.some((r) => r.includes("model-only")));
  assert.ok(modelOnly.reasons.some((r) => r.includes("odds-backed")));

  const lowGrade = parlayEligibility({
    oddsBacked: true, modelOnly: false, isToday: true, settled: false,
    stale: false, marketSupported: true, sourceFailed: false, dataQuality: "D",
  });
  assert.equal(lowGrade.eligible, false);
});

test("concentrationScore: diversified ≈ 0, all-same-game ≈ 1", () => {
  const diversified = concentrationScore([
    { gameId: "a", market: "h2h", team: "X" },
    { gameId: "b", market: "total", team: "Y" },
    { gameId: "c", market: "spread", team: "Z" },
  ]);
  const sameGame = concentrationScore([
    { gameId: "a", market: "h2h", team: "X" },
    { gameId: "a", market: "total", team: "X" },
    { gameId: "a", market: "spread", team: "X" },
  ]);
  assert.ok(diversified < 0.2, `diversified should be low, got ${diversified}`);
  assert.ok(sameGame > 0.9, `same-game should be high, got ${sameGame}`);
  assert.equal(concentrationScore([]), 0);
  assert.equal(concentrationScore([{ gameId: "a" }]), 0);
  assert.equal(concentrationLabel(sameGame), "highly concentrated");
  assert.equal(concentrationLabel(diversified), "diversified");
});

test("concentrationScore: heavy-favorite stacking raises the score", () => {
  // structurally diversified legs (distinct game/market/team) so that ONLY the
  // favorite-stacking term differs between the two slips.
  const noFavs = concentrationScore([
    { gameId: "a", market: "h2h", team: "X", probability: 0.55 },
    { gameId: "b", market: "total", team: "Y", probability: 0.55 },
  ]);
  const allFavs = concentrationScore([
    { gameId: "a", market: "h2h", team: "X", probability: 0.85 },
    { gameId: "b", market: "total", team: "Y", probability: 0.85 },
  ]);
  assert.ok(approx(noFavs, 0), `no heavy favorites ⇒ low, got ${noFavs}`);
  assert.ok(allFavs > noFavs, "stacking heavy favorites is more concentrated");
});
