# Model Learning Audit

**Rows:** 43050 decisive · **Dates:** 2026-05-16 → 2026-09-15

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2544 | 0.2413 |
| Log loss ↓ | 0.7047 | 0.6755 |
| Mean predicted | 59.33% | 50.12% |
| Observed | 50.17% | — |

Hit rate **50.17%** (21598/43050), 95% CI [49.70%, 50.64%]. Overconfidence **9.16pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 17488 | 53.89% [53.15%, 54.63%] | 0.2427 | 0.2354 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 15704 | 49.81% [49.03%, 50.59%] | 0.2623 | 0.2473 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 7730 | 43.10% [42.00%, 44.21%] | 0.2598 | 0.2413 | 11.4pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2128 | 47.89% [45.77%, 50.01%] | 0.2731 | 0.2453 | 14.8pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2427 vs market 0.2354; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2623 vs market 0.2473; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.2%] lies entirely below 50% on n=7730
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2731 vs market 0.2453; overconfident by 14.8pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 2064 | 36.5% | 35.7% [33.6%, 37.8%] | no |
| 0.4-0.5 | 6852 | 45.7% | 41.4% [40.3%, 42.6%] | **yes** |
| 0.5-0.6 | 13115 | 55.3% | 46.8% [46.0%, 47.7%] | **yes** |
| 0.6-0.7 | 13237 | 64.9% | 54.0% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 6983 | 73.9% | 60.6% [59.5%, 61.8%] | **yes** |
| 0.8-0.9 | 755 | 82.7% | 62.4% [58.9%, 65.8%] | **yes** |
| 0.9-1.0 | 41 | 94.0% | 51.2% [36.5%, 65.7%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 29648 rows (2026-05-16 → 2026-08-17) · Test: 13402 rows (2026-08-18 → 2026-09-15) · split at **2026-08-18**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2518 | 0.6986 | 59.47% |
| market | 0.2413 | 0.6755 | 50.19% |
| platt | 0.2441 | 0.6813 | 49.86% |
| isotonic | 0.2441 | 0.6812 | 49.87% |
| _observed_ | — | — | 51.06% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0077) · still loses to market: **true** (gap +0.0028).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 19149 | 49.42% | 0.2640 | 0.2425 | 14.0pp |
| Low | 17677 | 50.95% | 0.2470 | 0.2405 | 4.4pp |
| Medium | 6224 | 50.24% | 0.2456 | 0.2396 | 7.9pp |