# Model Learning Audit

**Rows:** 42485 decisive · **Dates:** 2026-05-16 → 2026-09-14

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2543 | 0.2412 |
| Log loss ↓ | 0.7044 | 0.6754 |
| Mean predicted | 59.32% | 50.12% |
| Observed | 50.19% | — |

Hit rate **50.19%** (21324/42485), 95% CI [49.72%, 50.67%]. Overconfidence **9.12pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 17267 | 53.89% [53.14%, 54.63%] | 0.2425 | 0.2353 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 15483 | 49.84% [49.05%, 50.63%] | 0.2621 | 0.2473 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 7636 | 43.14% [42.03%, 44.25%] | 0.2599 | 0.2415 | 11.4pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2099 | 48.02% [45.89%, 50.16%] | 0.2730 | 0.2453 | 14.7pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2425 vs market 0.2353; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2621 vs market 0.2473; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.3%] lies entirely below 50% on n=7636
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2730 vs market 0.2453; overconfident by 14.7pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 2040 | 36.5% | 35.5% [33.4%, 37.6%] | no |
| 0.4-0.5 | 6775 | 45.7% | 41.3% [40.2%, 42.5%] | **yes** |
| 0.5-0.6 | 12948 | 55.3% | 46.9% [46.1%, 47.8%] | **yes** |
| 0.6-0.7 | 13050 | 64.9% | 54.1% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 6883 | 73.8% | 60.7% [59.6%, 61.9%] | **yes** |
| 0.8-0.9 | 746 | 82.7% | 62.5% [58.9%, 65.9%] | **yes** |
| 0.9-1.0 | 40 | 94.0% | 50.0% [35.2%, 64.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 29648 rows (2026-05-16 → 2026-08-17) · Test: 12837 rows (2026-08-18 → 2026-09-14) · split at **2026-08-18**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2513 | 0.6974 | 59.43% |
| market | 0.2412 | 0.6753 | 50.17% |
| platt | 0.2440 | 0.6810 | 49.84% |
| isotonic | 0.2439 | 0.6809 | 49.84% |
| _observed_ | — | — | 51.17% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0074) · still loses to market: **true** (gap +0.0027).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 18871 | 49.48% | 0.2639 | 0.2426 | 13.9pp |
| Low | 17450 | 50.93% | 0.2470 | 0.2404 | 4.4pp |
| Medium | 6164 | 50.28% | 0.2455 | 0.2395 | 7.9pp |