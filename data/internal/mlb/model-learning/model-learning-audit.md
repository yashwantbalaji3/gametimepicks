# Model Learning Audit

**Rows:** 35285 decisive · **Dates:** 2026-05-16 → 2026-08-29

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2554 | 0.2412 |
| Log loss ↓ | 0.7070 | 0.6755 |
| Mean predicted | 59.29% | 50.11% |
| Observed | 49.84% | — |

Hit rate **49.84%** (17585/35285), 95% CI [49.32%, 50.36%]. Overconfidence **9.46pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 14424 | 53.61% [52.79%, 54.42%] | 0.2436 | 0.2357 | 6.9pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 12641 | 49.56% [48.69%, 50.43%] | 0.2635 | 0.2476 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 6474 | 42.49% [41.29%, 43.70%] | 0.2611 | 0.2401 | 12.2pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1746 | 47.94% [45.60%, 50.28%] | 0.2733 | 0.2451 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2436 vs market 0.2357; overconfident by 6.9pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2635 vs market 0.2476; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.3%, 43.7%] lies entirely below 50% on n=6474
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2733 vs market 0.2451; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1699 | 36.5% | 36.2% [33.9%, 38.5%] | no |
| 0.4-0.5 | 5698 | 45.7% | 40.8% [39.5%, 42.1%] | **yes** |
| 0.5-0.6 | 10701 | 55.3% | 46.8% [45.9%, 47.8%] | **yes** |
| 0.6-0.7 | 10806 | 64.9% | 53.7% [52.8%, 54.7%] | **yes** |
| 0.7-0.8 | 5728 | 73.9% | 59.9% [58.7%, 61.2%] | **yes** |
| 0.8-0.9 | 612 | 82.8% | 61.3% [57.4%, 65.1%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 24598 rows (2026-05-16 → 2026-08-07) · Test: 10687 rows (2026-08-08 → 2026-08-29) · split at **2026-08-08**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2548 | 0.7049 | 59.14% |
| market | 0.2411 | 0.6752 | 50.04% |
| platt | 0.2448 | 0.6827 | 49.71% |
| isotonic | 0.2447 | 0.6825 | 49.72% |
| _observed_ | — | — | 49.75% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0101) · still loses to market: **true** (gap +0.0036).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 15642 | 48.88% | 0.2655 | 0.2424 | 14.5pp |
| Low | 14539 | 50.77% | 0.2479 | 0.2406 | 4.6pp |
| Medium | 5104 | 50.12% | 0.2458 | 0.2396 | 8.0pp |