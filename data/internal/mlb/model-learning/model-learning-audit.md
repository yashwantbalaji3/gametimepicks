# Model Learning Audit

**Rows:** 30779 decisive · **Dates:** 2026-05-16 → 2026-08-19

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2555 | 0.2413 |
| Log loss ↓ | 0.7073 | 0.6755 |
| Mean predicted | 59.27% | 50.10% |
| Observed | 49.81% | — |

Hit rate **49.81%** (15332/30779), 95% CI [49.25%, 50.37%]. Overconfidence **9.46pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 12626 | 53.64% [52.76%, 54.50%] | 0.2435 | 0.2357 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 10841 | 49.48% [48.54%, 50.42%] | 0.2635 | 0.2476 | 10.4pp |
| `batter_total_bases` | **DISABLED** | 5777 | 42.62% [41.35%, 43.90%] | 0.2616 | 0.2405 | 12.2pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1535 | 47.82% [45.33%, 50.32%] | 0.2741 | 0.2448 | 14.8pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2435 vs market 0.2357; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2635 vs market 0.2476; overconfident by 10.4pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.3%, 43.9%] lies entirely below 50% on n=5777
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2741 vs market 0.2448; overconfident by 14.8pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1506 | 36.5% | 36.3% [33.9%, 38.7%] | no |
| 0.4-0.5 | 4993 | 45.7% | 41.0% [39.6%, 42.3%] | **yes** |
| 0.5-0.6 | 9341 | 55.2% | 46.7% [45.7%, 47.7%] | **yes** |
| 0.6-0.7 | 9332 | 64.9% | 53.9% [52.8%, 54.9%] | **yes** |
| 0.7-0.8 | 5028 | 73.8% | 59.8% [58.4%, 61.1%] | **yes** |
| 0.8-0.9 | 538 | 82.8% | 60.4% [56.2%, 64.5%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 21192 rows (2026-05-16 → 2026-07-26) · Test: 9587 rows (2026-07-27 → 2026-08-19) · split at **2026-07-27**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2553 | 0.7061 | 58.78% |
| market | 0.2411 | 0.6751 | 49.99% |
| platt | 0.2446 | 0.6823 | 49.75% |
| isotonic | 0.2445 | 0.6821 | 49.75% |
| _observed_ | — | — | 48.95% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0108) · still loses to market: **true** (gap +0.0034).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 13578 | 48.90% | 0.2654 | 0.2426 | 14.4pp |
| Low | 12751 | 50.87% | 0.2482 | 0.2406 | 4.5pp |
| Medium | 4450 | 49.57% | 0.2462 | 0.2393 | 8.5pp |