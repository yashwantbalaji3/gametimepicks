# Runbook — Data-Quality Gate Workflow

_Before any projection is published, it must pass the data-quality + leakage gates. Honesty over
coverage._

## Gates (in order)
1. **Leakage gate** — `validateLeakage()` passes (`feature_timestamp <= prediction_time <
   event_start_time`; no snapshot after prediction; rolling windows exclude the target).
2. **Freshness gate** — for each time-sensitive feed (lineup/injury/weather/market/projection),
   age ≤ its `FRESHNESS_THRESHOLDS`. Older → stale flag (not silently used).
3. **Missingness gate** — any critical feature absent → missing flag; a critical miss drives the
   confidence category to **No Bet**.
4. **Sample-size gate** — historical/matchup features carry a sample-size bucket + downweight;
   1–15 sets `smallSampleFlag`.
5. **Data-quality grade** — `dataQualityTier()` → A/B/C/D/unavailable. Limited-data (market-implied)
   props are never Bank Builder eligible.

## Outputs every prediction must carry
`missing_data_flags`, `stale_data_flags`, `small_sample_flags`, `confidence_score`, `risk_score`,
`data_quality` grade, `model_mode`, and `leakage_validation_passed`.

## Eligibility tiers (driven by the gates)
- **suggestedCard / parlayLab / build** — odds-backed + acceptable data quality.
- **bankBuilder** — only legs that additionally clear the survival gate (no fragile/limited-data/DNP).

## Rule of thumb
If a feature is missing, stale, small-sample, or not implemented, **expose it** — a flag, a lower
confidence, a higher risk. Never let a projection look more certain than the data supports.
