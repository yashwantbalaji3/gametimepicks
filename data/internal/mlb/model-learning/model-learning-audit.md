# Model Learning Audit

**Rows:** 34259 decisive · **Dates:** 2026-05-16 → 2026-08-26

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2552 | 0.2412 |
| Log loss ↓ | 0.7067 | 0.6753 |
| Mean predicted | 59.29% | 50.11% |
| Observed | 49.86% | — |

Hit rate **49.86%** (17080/34259), 95% CI [49.33%, 50.38%]. Overconfidence **9.44pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 14016 | 53.63% [52.81%, 54.46%] | 0.2433 | 0.2355 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 12233 | 49.58% [48.69%, 50.47%] | 0.2634 | 0.2476 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 6312 | 42.49% [41.28%, 43.71%] | 0.2613 | 0.2401 | 12.2pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1698 | 48.06% [45.69%, 50.43%] | 0.2726 | 0.2449 | 14.5pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2433 vs market 0.2355; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2634 vs market 0.2476; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.3%, 43.7%] lies entirely below 50% on n=6312
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2726 vs market 0.2449; overconfident by 14.5pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1648 | 36.5% | 36.1% [33.8%, 38.5%] | no |
| 0.4-0.5 | 5548 | 45.7% | 40.7% [39.4%, 42.0%] | **yes** |
| 0.5-0.6 | 10395 | 55.3% | 46.9% [45.9%, 47.8%] | **yes** |
| 0.6-0.7 | 10465 | 64.9% | 53.7% [52.7%, 54.6%] | **yes** |
| 0.7-0.8 | 5564 | 73.9% | 60.1% [58.8%, 61.4%] | **yes** |
| 0.8-0.9 | 598 | 82.8% | 61.2% [57.2%, 65.0%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 23616 rows (2026-05-16 → 2026-08-05) · Test: 10643 rows (2026-08-06 → 2026-08-26) · split at **2026-08-06**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2536 | 0.7023 | 59.02% |
| market | 0.2409 | 0.6747 | 50.01% |
| platt | 0.2443 | 0.6817 | 49.58% |
| isotonic | 0.2442 | 0.6815 | 49.59% |
| _observed_ | — | — | 49.86% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0094) · still loses to market: **true** (gap +0.0033).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 15159 | 48.95% | 0.2653 | 0.2424 | 14.4pp |
| Low | 14150 | 50.78% | 0.2478 | 0.2404 | 4.5pp |
| Medium | 4950 | 49.96% | 0.2458 | 0.2394 | 8.2pp |