# Model Learning Audit

**Rows:** 43610 decisive · **Dates:** 2026-05-16 → 2026-09-16

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2543 | 0.2413 |
| Log loss ↓ | 0.7045 | 0.6755 |
| Mean predicted | 59.34% | 50.13% |
| Observed | 50.22% | — |

Hit rate **50.22%** (21901/43610), 95% CI [49.75%, 50.69%]. Overconfidence **9.12pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 17712 | 53.95% [53.21%, 54.68%] | 0.2426 | 0.2354 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 15927 | 49.88% [49.11%, 50.66%] | 0.2622 | 0.2473 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 7814 | 43.04% [41.94%, 44.14%] | 0.2598 | 0.2412 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2157 | 48.12% [46.02%, 50.23%] | 0.2726 | 0.2453 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2426 vs market 0.2354; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2622 vs market 0.2473; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.1%] lies entirely below 50% on n=7814
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2726 vs market 0.2453; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 2090 | 36.5% | 35.6% [33.6%, 37.7%] | no |
| 0.4-0.5 | 6920 | 45.7% | 41.4% [40.3%, 42.6%] | **yes** |
| 0.5-0.6 | 13295 | 55.3% | 46.9% [46.1%, 47.8%] | **yes** |
| 0.6-0.7 | 13416 | 64.9% | 54.0% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 7081 | 73.8% | 60.7% [59.6%, 61.9%] | **yes** |
| 0.8-0.9 | 763 | 82.7% | 62.6% [59.2%, 66.0%] | **yes** |
| 0.9-1.0 | 42 | 93.9% | 50.0% [35.5%, 64.5%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 30226 rows (2026-05-16 → 2026-08-18) · Test: 13384 rows (2026-08-19 → 2026-09-16) · split at **2026-08-19**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2518 | 0.6985 | 59.51% |
| market | 0.2415 | 0.6759 | 50.20% |
| platt | 0.2441 | 0.6813 | 49.94% |
| isotonic | 0.2441 | 0.6812 | 49.94% |
| _observed_ | — | — | 51.14% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0077) · still loses to market: **true** (gap +0.0026).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 19422 | 49.51% | 0.2638 | 0.2425 | 13.9pp |
| Low | 17886 | 50.98% | 0.2470 | 0.2405 | 4.4pp |
| Medium | 6302 | 50.25% | 0.2456 | 0.2396 | 7.9pp |