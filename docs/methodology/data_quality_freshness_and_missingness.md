# Data Quality, Freshness & Missingness (canonical)

_Code: `app/src/lib/methodology/data-quality.ts`, `global-rules.ts`; grades in
`projection-framework.ts` (`dataQualityTier` → A/B/C/D/unavailable)._

## Don't silently fill missing data
Critical features carry **both** missing and stale indicators — never a quiet default:
`lineup_missing/stale`, `injury_missing/stale`, `weather_missing/stale`, `market_missing/stale`,
`projection_missing/stale`, `role_missing/stale`. Builders: `missingFlag()`, `staleFlag()`.

## Staleness is sport/field-specific
Default thresholds (minutes), `FRESHNESS_THRESHOLDS`: lineup 240, injury 360, weather 180,
market 120, projection 720. A feed older than its threshold → stale flag; an absent feed → missing
flag (not stale).

## Sample-size buckets
```
sample_size_0 · 1_to_5 · 6_to_15 · 16_to_30 · 31_plus
```
Every historical / head-to-head / venue / matchup feature stores `rawValue, sampleSize,
sampleSizeBucket, sampleWeight, smallSampleFlag` (`sampleSized()`). Recommended downweight:
0 → ignore · 1-5 → heavy (0.15) · 6-15 → moderate (0.45) · 16-30 → partial (0.75) · 31+ → full (1.0).
`smallSampleFlag` is true for 1–15.

## Data-quality grade (existing)
`dataQualityTier()`: **A** = current odds + full stats + confirmed event + fresh + sample ≥ 5;
**B** = current odds + confirmed; **C** = full stats or sample ≥ 3; **D**; **unavailable**.
World Cup player props are explicitly **limited-data** (market-implied) and never Bank Builder
eligible.

## Implementation status (honesty)
Each registry feature is `implemented | partial | planned | not_available`. `coverage(sport)`
returns the counts so the UI/docs can state plainly which feeds are live vs defined-only.
