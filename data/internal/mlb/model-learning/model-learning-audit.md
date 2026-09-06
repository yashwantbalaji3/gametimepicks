# Model Learning Audit

**Rows:** 38519 decisive · **Dates:** 2026-05-16 → 2026-09-05

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2545 | 0.2412 |
| Log loss ↓ | 0.7051 | 0.6754 |
| Mean predicted | 59.27% | 50.11% |
| Observed | 50.14% | — |

Hit rate **50.14%** (19312/38519), 95% CI [49.64%, 50.64%]. Overconfidence **9.14pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 15682 | 53.78% [53.00%, 54.56%] | 0.2427 | 0.2353 | 6.7pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 13899 | 49.92% [49.09%, 50.75%] | 0.2624 | 0.2474 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 7035 | 42.93% [41.78%, 44.09%] | 0.2604 | 0.2411 | 11.6pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1903 | 48.34% [46.11%, 50.59%] | 0.2729 | 0.2452 | 14.3pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2427 vs market 0.2353; overconfident by 6.7pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2624 vs market 0.2474; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.8%, 44.1%] lies entirely below 50% on n=7035
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2729 vs market 0.2452; overconfident by 14.3pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1882 | 36.5% | 35.6% [33.5%, 37.8%] | no |
| 0.4-0.5 | 6199 | 45.7% | 41.2% [40.0%, 42.5%] | **yes** |
| 0.5-0.6 | 11720 | 55.3% | 47.1% [46.2%, 48.0%] | **yes** |
| 0.6-0.7 | 11774 | 64.9% | 54.0% [53.1%, 54.9%] | **yes** |
| 0.7-0.8 | 6235 | 73.8% | 60.4% [59.2%, 61.6%] | **yes** |
| 0.8-0.9 | 667 | 82.7% | 62.2% [58.5%, 65.8%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 26726 rows (2026-05-16 → 2026-08-11) · Test: 11793 rows (2026-08-12 → 2026-09-05) · split at **2026-08-12**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2522 | 0.6993 | 59.24% |
| market | 0.2409 | 0.6748 | 50.11% |
| platt | 0.2442 | 0.6815 | 49.81% |
| isotonic | 0.2441 | 0.6813 | 49.82% |
| _observed_ | — | — | 50.74% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0080) · still loses to market: **true** (gap +0.0032).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 17062 | 49.38% | 0.2641 | 0.2424 | 14.0pp |
| Low | 15888 | 50.98% | 0.2473 | 0.2404 | 4.3pp |
| Medium | 5569 | 50.06% | 0.2460 | 0.2397 | 8.0pp |