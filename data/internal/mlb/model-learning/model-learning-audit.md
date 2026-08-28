# Model Learning Audit

**Rows:** 34439 decisive · **Dates:** 2026-05-16 → 2026-08-27

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2553 | 0.2412 |
| Log loss ↓ | 0.7067 | 0.6753 |
| Mean predicted | 59.30% | 50.12% |
| Observed | 49.86% | — |

Hit rate **49.86%** (17173/34439), 95% CI [49.34%, 50.39%]. Overconfidence **9.44pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 14090 | 53.65% [52.82%, 54.47%] | 0.2433 | 0.2356 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 12307 | 49.59% [48.71%, 50.47%] | 0.2634 | 0.2476 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 6334 | 42.47% [41.26%, 43.69%] | 0.2613 | 0.2401 | 12.2pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1708 | 48.07% [45.71%, 50.44%] | 0.2728 | 0.2450 | 14.4pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2433 vs market 0.2356; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2634 vs market 0.2476; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.3%, 43.7%] lies entirely below 50% on n=6334
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2728 vs market 0.2450; overconfident by 14.4pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1653 | 36.5% | 36.2% [34.0%, 38.6%] | no |
| 0.4-0.5 | 5567 | 45.7% | 40.8% [39.5%, 42.1%] | **yes** |
| 0.5-0.6 | 10448 | 55.3% | 46.9% [45.9%, 47.8%] | **yes** |
| 0.6-0.7 | 10529 | 64.9% | 53.7% [52.7%, 54.7%] | **yes** |
| 0.7-0.8 | 5599 | 73.8% | 60.1% [58.8%, 61.4%] | **yes** |
| 0.8-0.9 | 602 | 82.8% | 61.1% [57.2%, 64.9%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 24031 rows (2026-05-16 → 2026-08-06) · Test: 10408 rows (2026-08-07 → 2026-08-27) · split at **2026-08-07**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2541 | 0.7033 | 59.10% |
| market | 0.2408 | 0.6745 | 50.03% |
| platt | 0.2444 | 0.6818 | 49.73% |
| isotonic | 0.2443 | 0.6816 | 49.74% |
| _observed_ | — | — | 49.70% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0098) · still loses to market: **true** (gap +0.0035).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 15251 | 48.92% | 0.2653 | 0.2424 | 14.4pp |
| Low | 14209 | 50.83% | 0.2478 | 0.2404 | 4.5pp |
| Medium | 4979 | 50.01% | 0.2458 | 0.2394 | 8.2pp |