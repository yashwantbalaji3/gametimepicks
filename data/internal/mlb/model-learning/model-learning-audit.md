# Model Learning Audit

**Rows:** 34796 decisive · **Dates:** 2026-05-16 → 2026-08-28

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2553 | 0.2412 |
| Log loss ↓ | 0.7069 | 0.6753 |
| Mean predicted | 59.31% | 50.12% |
| Observed | 49.86% | — |

Hit rate **49.86%** (17348/34796), 95% CI [49.33%, 50.38%]. Overconfidence **9.45pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 14233 | 53.63% [52.81%, 54.45%] | 0.2434 | 0.2356 | 6.9pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 12450 | 49.59% [48.71%, 50.47%] | 0.2636 | 0.2476 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 6387 | 42.46% [41.25%, 43.68%] | 0.2612 | 0.2402 | 12.2pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1726 | 48.03% [45.68%, 50.39%] | 0.2728 | 0.2450 | 14.5pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2434 vs market 0.2356; overconfident by 6.9pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2636 vs market 0.2476; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.3%, 43.7%] lies entirely below 50% on n=6387
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2728 vs market 0.2450; overconfident by 14.5pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1671 | 36.5% | 36.1% [33.9%, 38.5%] | no |
| 0.4-0.5 | 5608 | 45.7% | 40.7% [39.4%, 42.0%] | **yes** |
| 0.5-0.6 | 10554 | 55.3% | 46.9% [45.9%, 47.8%] | **yes** |
| 0.6-0.7 | 10651 | 64.9% | 53.7% [52.8%, 54.7%] | **yes** |
| 0.7-0.8 | 5665 | 73.8% | 59.9% [58.7%, 61.2%] | **yes** |
| 0.8-0.9 | 606 | 82.8% | 61.1% [57.1%, 64.9%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 24031 rows (2026-05-16 → 2026-08-06) · Test: 10765 rows (2026-08-07 → 2026-08-28) · split at **2026-08-07**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2544 | 0.7041 | 59.13% |
| market | 0.2409 | 0.6747 | 50.03% |
| platt | 0.2445 | 0.6821 | 49.75% |
| isotonic | 0.2444 | 0.6818 | 49.76% |
| _observed_ | — | — | 49.68% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0100) · still loses to market: **true** (gap +0.0035).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 15431 | 48.94% | 0.2654 | 0.2424 | 14.4pp |
| Low | 14335 | 50.79% | 0.2479 | 0.2405 | 4.5pp |
| Medium | 5030 | 50.00% | 0.2457 | 0.2394 | 8.2pp |