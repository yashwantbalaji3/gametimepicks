# Model Learning Audit

**Rows:** 37958 decisive · **Dates:** 2026-05-16 → 2026-09-04

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2547 | 0.2412 |
| Log loss ↓ | 0.7056 | 0.6754 |
| Mean predicted | 59.26% | 50.10% |
| Observed | 50.09% | — |

Hit rate **50.09%** (19015/37958), 95% CI [49.59%, 50.60%]. Overconfidence **9.17pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 15459 | 53.71% [52.92%, 54.49%] | 0.2430 | 0.2354 | 6.7pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 13676 | 49.88% [49.04%, 50.71%] | 0.2627 | 0.2474 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 6949 | 42.94% [41.78%, 44.11%] | 0.2605 | 0.2410 | 11.6pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1874 | 48.40% [46.14%, 50.66%] | 0.2727 | 0.2453 | 14.2pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2430 vs market 0.2354; overconfident by 6.7pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2627 vs market 0.2474; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.8%, 44.1%] lies entirely below 50% on n=6949
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2727 vs market 0.2453; overconfident by 14.2pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1855 | 36.5% | 35.6% [33.4%, 37.8%] | no |
| 0.4-0.5 | 6123 | 45.7% | 41.3% [40.1%, 42.6%] | **yes** |
| 0.5-0.6 | 11544 | 55.3% | 47.1% [46.2%, 48.1%] | **yes** |
| 0.6-0.7 | 11604 | 64.9% | 53.9% [53.0%, 54.8%] | **yes** |
| 0.7-0.8 | 6134 | 73.8% | 60.3% [59.1%, 61.5%] | **yes** |
| 0.8-0.9 | 656 | 82.7% | 61.9% [58.1%, 65.5%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 26129 rows (2026-05-16 → 2026-08-10) · Test: 11829 rows (2026-08-11 → 2026-09-04) · split at **2026-08-11**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2529 | 0.7009 | 59.17% |
| market | 0.2411 | 0.6752 | 50.07% |
| platt | 0.2444 | 0.6819 | 49.81% |
| isotonic | 0.2443 | 0.6816 | 49.81% |
| _observed_ | — | — | 50.49% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0086) · still loses to market: **true** (gap +0.0032).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 16803 | 49.27% | 0.2645 | 0.2424 | 14.1pp |
| Low | 15667 | 50.95% | 0.2474 | 0.2405 | 4.3pp |
| Medium | 5488 | 50.18% | 0.2459 | 0.2398 | 7.9pp |