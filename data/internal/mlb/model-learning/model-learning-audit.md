# Model Learning Audit

**Rows:** 33133 decisive · **Dates:** 2026-05-16 → 2026-08-24

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2554 | 0.2413 |
| Log loss ↓ | 0.7071 | 0.6755 |
| Mean predicted | 59.30% | 50.12% |
| Observed | 49.86% | — |

Hit rate **49.86%** (16521/33133), 95% CI [49.32%, 50.40%]. Overconfidence **9.44pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 13572 | 53.63% [52.79%, 54.46%] | 0.2437 | 0.2358 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 11789 | 49.59% [48.69%, 50.49%] | 0.2634 | 0.2476 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 6124 | 42.59% [41.35%, 43.83%] | 0.2613 | 0.2402 | 12.2pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1648 | 47.88% [45.47%, 50.29%] | 0.2730 | 0.2449 | 14.7pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2437 vs market 0.2358; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2634 vs market 0.2476; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.4%, 43.8%] lies entirely below 50% on n=6124
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2730 vs market 0.2449; overconfident by 14.7pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1606 | 36.5% | 36.4% [34.0%, 38.7%] | no |
| 0.4-0.5 | 5357 | 45.7% | 40.9% [39.6%, 42.2%] | **yes** |
| 0.5-0.6 | 10044 | 55.3% | 46.8% [45.8%, 47.7%] | **yes** |
| 0.6-0.7 | 10110 | 64.9% | 53.7% [52.8%, 54.7%] | **yes** |
| 0.7-0.8 | 5393 | 73.9% | 60.1% [58.7%, 61.4%] | **yes** |
| 0.8-0.9 | 582 | 82.8% | 60.7% [56.6%, 64.5%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 23015 rows (2026-05-16 → 2026-08-04) · Test: 10118 rows (2026-08-05 → 2026-08-24) · split at **2026-08-05**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2548 | 0.7051 | 58.95% |
| market | 0.2413 | 0.6755 | 49.99% |
| platt | 0.2446 | 0.6823 | 49.73% |
| isotonic | 0.2445 | 0.6821 | 49.74% |
| _observed_ | — | — | 49.40% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0103) · still loses to market: **true** (gap +0.0032).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 14645 | 48.98% | 0.2653 | 0.2425 | 14.4pp |
| Low | 13689 | 50.81% | 0.2480 | 0.2405 | 4.5pp |
| Medium | 4799 | 49.84% | 0.2462 | 0.2396 | 8.3pp |