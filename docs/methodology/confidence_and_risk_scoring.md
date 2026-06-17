# Confidence & Risk Scoring (canonical)

_Code: `app/src/lib/methodology/confidence.ts`, `risk.ts`._

## Confidence ≠ probability
Probability is *how likely the pick hits*. **Confidence is how much we trust the projection** —
driven by data quality, feature agreement, and uncertainty. A 58% pick on a confirmed-lineup,
fresh-data, stable-role projection is **higher confidence** than a 58% pick that hinges on an
unconfirmed lineup.

## Confidence formula (`computeConfidence`)
```
confidence =
  0.20*data_freshness + 0.20*role_certainty + 0.15*sample_size
+ 0.15*model_agreement + 0.10*market_agreement + 0.10*lineup_certainty
- 0.10*projection_volatility_penalty - missing_critical_data_penalty
```
Clamped to [0,1]. Categories: **High** ≥ 0.70 · **Medium** ≥ 0.50 · **Low** ≥ 0.30 · **No Bet**
otherwise. A critical-data miss (`missing_critical_data_penalty ≥ 0.5`) forces **No Bet** regardless
of the numeric score.

## Risk / projection-volatility (`computeRisk`)
A 0..1 fragility score (band: low / elevated / high) reflecting:
role uncertainty, stale data, missing critical data, small sample, volatile market, **fragile prop
type** (single-game single-player high-variance), **DNP/scratch risk** (player prop without a
confirmed lineup), and **over-correlation** with other selected legs. Risk drives Bank Builder
survival gating and "fragile leg" warnings.

## Relationship to existing scoring
This complements the existing `projection-framework.ts` (`UnifiedProjection`, `dataQualityTier`,
`concentrationScore`) and the Bank Builder V2 survival score — confidence/risk are the
data-quality/fragility lenses; probability/edge remain the projection lenses.

## Tested
`methodology.test.mjs`: fresh+complete → High; stale/volatile lowers the score; a critical-data miss
forces No Bet; fragile/DNP/stale inputs raise the risk band above "low".
