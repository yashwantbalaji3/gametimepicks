# GameTimePicks — Prediction Methodology (v1, canonical)

_Leakage-safe, sport-specific, opportunity-first prediction framework for MLB, NBA, UFC, and the
Soccer World Cup. This is the canonical methodology layer. The machine-readable contracts live in
`app/src/lib/methodology/`; the exhaustive per-sport feature catalogs are in the sibling docs._

## Core objective
Make **pre-event** predictions for games/matches/fights and player/team props using only information
available **at or before `prediction_time`**, scoring sport-specific opportunity, role, efficiency,
matchup, context, market, uncertainty, and data-freshness — and never letting a projection look more
certain than the data supports.

## The non-negotiable hierarchy (opportunity-first)
```
Availability → Opportunity → Role → Matchup → Efficiency → Context → Market (optional) → Uncertainty → Validation
```
> Opportunity first. Role second. Matchup third. Efficiency fourth. Context fifth. Market optional
> but powerful. Historical head-to-head last and heavily downweighted.

Codified in `methodology/global-rules.ts` (`FEATURE_PRIORITY`, `PRINCIPLE`).

## Documents in this framework
| Doc | Contents |
|---|---|
| `prediction_time_and_leakage_rules.md` | The prediction-time rule, never-use list, rolling-window rules, snapshot metadata |
| `mlb_prediction_methodology.md` | MLB targets, feature groups, prop-priority logic |
| `nba_prediction_methodology.md` | NBA targets, minutes/usage/vacated-usage, prop-priority logic |
| `ufc_prediction_methodology.md` | UFC path-dependent style/phase/cardio framework |
| `world_cup_prediction_methodology.md` | World Cup team/player, 90-min vs advancement, set pieces |
| `confidence_and_risk_scoring.md` | Confidence ≠ probability; risk/volatility scoring |
| `data_quality_freshness_and_missingness.md` | Missing/stale flags, sample-size buckets, data-quality grades |
| `market_aware_modeling.md` | no-market / market-aware / market-residual model modes |
| `bank_builder_v2_methodology.md` | Survival gate, suspended/0-AB rules, launch policy |

## Machine-readable layer (`app/src/lib/methodology/`)
- `types.ts` — `Sport`, `PredictionSnapshotMetadata`, `FeatureDefinition`, `ModelMode`,
  `PredictionOutput`, sample-size + missing/stale flags, `LeakageValidationResult`.
- `global-rules.ts` — hierarchy, rolling windows, never-use list, sample-size bucketing.
- `validation.ts` — `validateLeakage()` enforces `feature_timestamp <= prediction_time < event_start_time`.
- `confidence.ts` / `risk.ts` — confidence (data-quality driven) and risk (fragility) scoring, both
  distinct from probability.
- `data-quality.ts` — missing/stale flag builders + sample-sized values + freshness thresholds.
- `{mlb,nba,ufc,world-cup}.ts` + `sport-feature-groups.ts` — per-sport feature registries with an
  **implementation status** on every feature: `implemented | partial | planned | not_available`.

## Honesty principle
If a feature is missing, stale, small-sample, or not yet built, the framework **exposes** it — via
missing/stale/small-sample flags, a risk score, a data-quality grade, and the registry status. We
never fabricate stats, lineups, odds, weather, officials, or predictions; unbuilt feeds are stubbed
`planned` / `not_available`.

## Final prediction output (canonical)
Every prediction emits the `PredictionOutput` shape: ids + snapshot times, market vs model
probability, edge, **confidence (category)**, **risk score**, data-quality grade, model mode, top
positive/negative factors, missing/stale/small-sample flags, and `leakageValidationPassed`.

## Status (v1)
This release codifies the methodology, schema, validation, confidence/risk, registries, and
workflows. Many features are defined but **not yet calculated** (status `planned`/`not_available`) —
see each sport doc's coverage note. Wiring the scoring deeper into projection generation, Parlay
Lab, and Build is the next phase.
