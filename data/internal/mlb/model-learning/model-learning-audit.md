# Model Learning Audit

**Rows:** 40266 decisive · **Dates:** 2026-05-16 → 2026-09-09

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2546 | 0.2412 |
| Log loss ↓ | 0.7052 | 0.6754 |
| Mean predicted | 59.29% | 50.12% |
| Observed | 50.12% | — |

Hit rate **50.12%** (20181/40266), 95% CI [49.63%, 50.61%]. Overconfidence **9.17pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 16378 | 53.76% [52.99%, 54.52%] | 0.2428 | 0.2353 | 6.7pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 14596 | 49.87% [49.06%, 50.68%] | 0.2626 | 0.2474 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 7302 | 42.96% [41.83%, 44.10%] | 0.2602 | 0.2411 | 11.6pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1990 | 48.29% [46.10%, 50.49%] | 0.2726 | 0.2452 | 14.5pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2428 vs market 0.2353; overconfident by 6.7pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2626 vs market 0.2474; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.8%, 44.1%] lies entirely below 50% on n=7302
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2726 vs market 0.2452; overconfident by 14.5pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1956 | 36.5% | 35.6% [33.5%, 37.7%] | no |
| 0.4-0.5 | 6436 | 45.7% | 41.3% [40.1%, 42.6%] | **yes** |
| 0.5-0.6 | 12264 | 55.3% | 47.0% [46.1%, 47.8%] | **yes** |
| 0.6-0.7 | 12349 | 64.9% | 54.0% [53.1%, 54.9%] | **yes** |
| 0.7-0.8 | 6514 | 73.8% | 60.4% [59.2%, 61.6%] | **yes** |
| 0.8-0.9 | 705 | 82.7% | 62.4% [58.8%, 65.9%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 28161 rows (2026-05-16 → 2026-08-14) · Test: 12105 rows (2026-08-15 → 2026-09-09) · split at **2026-08-15**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2519 | 0.6988 | 59.37% |
| market | 0.2409 | 0.6746 | 50.19% |
| platt | 0.2442 | 0.6814 | 49.80% |
| isotonic | 0.2442 | 0.6814 | 49.80% |
| _observed_ | — | — | 50.96% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0077) · still loses to market: **true** (gap +0.0033).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 17852 | 49.36% | 0.2643 | 0.2425 | 14.0pp |
| Low | 16591 | 50.93% | 0.2473 | 0.2404 | 4.4pp |
| Medium | 5823 | 50.16% | 0.2456 | 0.2395 | 8.0pp |