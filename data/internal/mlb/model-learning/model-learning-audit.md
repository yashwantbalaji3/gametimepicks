# Model Learning Audit

**Rows:** 31663 decisive · **Dates:** 2026-05-16 → 2026-08-21

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2554 | 0.2412 |
| Log loss ↓ | 0.7072 | 0.6755 |
| Mean predicted | 59.29% | 50.11% |
| Observed | 49.84% | — |

Hit rate **49.84%** (15780/31663), 95% CI [49.29%, 50.39%]. Overconfidence **9.45pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 12985 | 53.65% [52.80%, 54.51%] | 0.2436 | 0.2358 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 11200 | 49.55% [48.63%, 50.48%] | 0.2634 | 0.2476 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 5899 | 42.52% [41.26%, 43.78%] | 0.2613 | 0.2403 | 12.2pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1579 | 47.82% [45.36%, 50.28%] | 0.2737 | 0.2449 | 14.8pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2436 vs market 0.2358; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2634 vs market 0.2476; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.3%, 43.8%] lies entirely below 50% on n=5899
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2737 vs market 0.2449; overconfident by 14.8pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1543 | 36.5% | 36.4% [34.0%, 38.8%] | no |
| 0.4-0.5 | 5128 | 45.7% | 40.8% [39.5%, 42.2%] | **yes** |
| 0.5-0.6 | 9598 | 55.3% | 46.8% [45.8%, 47.8%] | **yes** |
| 0.6-0.7 | 9633 | 64.9% | 53.8% [52.8%, 54.8%] | **yes** |
| 0.7-0.8 | 5166 | 73.9% | 60.0% [58.6%, 61.3%] | **yes** |
| 0.8-0.9 | 554 | 82.8% | 60.5% [56.3%, 64.5%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 22001 rows (2026-05-16 → 2026-07-30) · Test: 9662 rows (2026-07-31 → 2026-08-21) · split at **2026-07-31**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2544 | 0.7040 | 58.86% |
| market | 0.2411 | 0.6752 | 50.00% |
| platt | 0.2444 | 0.6818 | 49.67% |
| isotonic | 0.2442 | 0.6816 | 49.68% |
| _observed_ | — | — | 49.33% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0101) · still loses to market: **true** (gap +0.0031).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 14003 | 48.94% | 0.2653 | 0.2425 | 14.4pp |
| Low | 13096 | 50.89% | 0.2480 | 0.2405 | 4.5pp |
| Medium | 4564 | 49.56% | 0.2464 | 0.2395 | 8.5pp |