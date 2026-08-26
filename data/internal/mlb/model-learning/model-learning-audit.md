# Model Learning Audit

**Rows:** 33687 decisive · **Dates:** 2026-05-16 → 2026-08-25

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2553 | 0.2412 |
| Log loss ↓ | 0.7068 | 0.6754 |
| Mean predicted | 59.30% | 50.12% |
| Observed | 49.87% | — |

Hit rate **49.87%** (16801/33687), 95% CI [49.34%, 50.41%]. Overconfidence **9.43pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 13792 | 53.68% [52.84%, 54.51%] | 0.2435 | 0.2357 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 12009 | 49.58% [48.69%, 50.47%] | 0.2634 | 0.2476 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 6212 | 42.51% [41.29%, 43.75%] | 0.2612 | 0.2400 | 12.2pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1674 | 47.97% [45.58%, 50.36%] | 0.2731 | 0.2451 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2435 vs market 0.2357; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2634 vs market 0.2476; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.3%, 43.7%] lies entirely below 50% on n=6212
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2731 vs market 0.2451; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1623 | 36.5% | 36.4% [34.0%, 38.7%] | no |
| 0.4-0.5 | 5450 | 45.7% | 40.8% [39.5%, 42.1%] | **yes** |
| 0.5-0.6 | 10205 | 55.3% | 46.8% [45.8%, 47.8%] | **yes** |
| 0.6-0.7 | 10299 | 64.9% | 53.8% [52.8%, 54.7%] | **yes** |
| 0.7-0.8 | 5476 | 73.9% | 60.1% [58.8%, 61.4%] | **yes** |
| 0.8-0.9 | 593 | 82.8% | 60.9% [56.9%, 64.7%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 23015 rows (2026-05-16 → 2026-08-04) · Test: 10672 rows (2026-08-05 → 2026-08-25) · split at **2026-08-05**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2545 | 0.7044 | 58.97% |
| market | 0.2411 | 0.6751 | 50.00% |
| platt | 0.2445 | 0.6821 | 49.74% |
| isotonic | 0.2444 | 0.6818 | 49.74% |
| _observed_ | — | — | 49.46% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0102) · still loses to market: **true** (gap +0.0033).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 14902 | 48.98% | 0.2653 | 0.2426 | 14.4pp |
| Low | 13906 | 50.83% | 0.2478 | 0.2404 | 4.5pp |
| Medium | 4879 | 49.87% | 0.2459 | 0.2394 | 8.3pp |