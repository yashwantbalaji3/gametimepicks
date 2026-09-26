# Model Learning Audit

**Rows:** 47596 decisive · **Dates:** 2026-05-16 → 2026-09-25

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2545 | 0.2413 |
| Log loss ↓ | 0.7049 | 0.6756 |
| Mean predicted | 59.40% | 50.14% |
| Observed | 50.26% | — |

Hit rate **50.26%** (23923/47596), 95% CI [49.81%, 50.71%]. Overconfidence **9.14pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 19303 | 54.11% [53.40%, 54.81%] | 0.2429 | 0.2357 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 17510 | 49.83% [49.09%, 50.57%] | 0.2623 | 0.2471 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 8423 | 42.97% [41.91%, 44.03%] | 0.2595 | 0.2409 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2360 | 48.05% [46.04%, 50.07%] | 0.2733 | 0.2456 | 14.7pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2429 vs market 0.2357; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2623 vs market 0.2471; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.0%] lies entirely below 50% on n=8423
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2733 vs market 0.2456; overconfident by 14.7pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2224 | 36.5% | 35.6% [33.6%, 37.6%] | no |
| 0.4-0.5 | 7519 | 45.7% | 41.5% [40.4%, 42.6%] | **yes** |
| 0.5-0.6 | 14475 | 55.3% | 47.0% [46.1%, 47.8%] | **yes** |
| 0.6-0.7 | 14719 | 64.9% | 54.1% [53.3%, 54.9%] | **yes** |
| 0.7-0.8 | 7780 | 73.9% | 60.5% [59.4%, 61.6%] | **yes** |
| 0.8-0.9 | 832 | 82.7% | 62.1% [58.8%, 65.4%] | **yes** |
| 0.9-1.0 | 43 | 93.9% | 51.2% [36.8%, 65.4%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 33133 rows (2026-05-16 → 2026-08-24) · Test: 14463 rows (2026-08-25 → 2026-09-25) · split at **2026-08-25**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2524 | 0.6999 | 59.63% |
| market | 0.2414 | 0.6757 | 50.18% |
| platt | 0.2444 | 0.6819 | 50.04% |
| isotonic | 0.2444 | 0.6818 | 50.04% |
| _observed_ | — | — | 51.18% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0080) · still loses to market: **true** (gap +0.0030).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 21362 | 49.50% | 0.2642 | 0.2428 | 13.9pp |
| Low | 19435 | 50.99% | 0.2471 | 0.2404 | 4.4pp |
| Medium | 6799 | 50.58% | 0.2451 | 0.2395 | 7.6pp |