# Model Learning Audit

**Rows:** 42106 decisive · **Dates:** 2026-05-16 → 2026-09-13

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2544 | 0.2413 |
| Log loss ↓ | 0.7046 | 0.6755 |
| Mean predicted | 59.31% | 50.12% |
| Observed | 50.18% | — |

Hit rate **50.18%** (21127/42106), 95% CI [49.70%, 50.65%]. Overconfidence **9.13pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 17116 | 53.85% [53.10%, 54.60%] | 0.2427 | 0.2353 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 15333 | 49.83% [49.04%, 50.62%] | 0.2622 | 0.2472 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 7576 | 43.14% [42.02%, 44.25%] | 0.2600 | 0.2415 | 11.4pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2081 | 48.15% [46.01%, 50.30%] | 0.2727 | 0.2452 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2427 vs market 0.2353; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2622 vs market 0.2472; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.3%] lies entirely below 50% on n=7576
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2727 vs market 0.2452; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 2023 | 36.5% | 35.5% [33.5%, 37.7%] | no |
| 0.4-0.5 | 6722 | 45.7% | 41.4% [40.2%, 42.5%] | **yes** |
| 0.5-0.6 | 12833 | 55.3% | 46.9% [46.1%, 47.8%] | **yes** |
| 0.6-0.7 | 12932 | 64.9% | 54.0% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 6815 | 73.8% | 60.6% [59.5%, 61.8%] | **yes** |
| 0.8-0.9 | 738 | 82.7% | 62.5% [58.9%, 65.9%] | **yes** |
| 0.9-1.0 | 40 | 94.0% | 50.0% [35.2%, 64.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 29266 rows (2026-05-16 → 2026-08-16) · Test: 12840 rows (2026-08-17 → 2026-09-13) · split at **2026-08-17**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2514 | 0.6977 | 59.41% |
| market | 0.2411 | 0.6751 | 50.18% |
| platt | 0.2440 | 0.6811 | 49.83% |
| isotonic | 0.2440 | 0.6810 | 49.83% |
| _observed_ | — | — | 51.11% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0075) · still loses to market: **true** (gap +0.0029).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 18687 | 49.46% | 0.2639 | 0.2426 | 13.9pp |
| Low | 17311 | 50.92% | 0.2471 | 0.2405 | 4.4pp |
| Medium | 6108 | 50.25% | 0.2455 | 0.2395 | 7.9pp |