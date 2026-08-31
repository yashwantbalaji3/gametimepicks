# Model Learning Audit

**Rows:** 35553 decisive · **Dates:** 2026-05-16 → 2026-08-30

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2553 | 0.2412 |
| Log loss ↓ | 0.7068 | 0.6754 |
| Mean predicted | 59.28% | 50.11% |
| Observed | 49.84% | — |

Hit rate **49.84%** (17720/35553), 95% CI [49.32%, 50.36%]. Overconfidence **9.44pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 14524 | 53.57% [52.76%, 54.38%] | 0.2435 | 0.2356 | 6.9pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 12741 | 49.58% [48.71%, 50.45%] | 0.2634 | 0.2476 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 6529 | 42.52% [41.32%, 43.72%] | 0.2611 | 0.2403 | 12.1pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1759 | 48.10% [45.77%, 50.43%] | 0.2731 | 0.2451 | 14.5pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2435 vs market 0.2356; overconfident by 6.9pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2634 vs market 0.2476; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.3%, 43.7%] lies entirely below 50% on n=6529
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2731 vs market 0.2451; overconfident by 14.5pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1721 | 36.5% | 36.0% [33.7%, 38.3%] | no |
| 0.4-0.5 | 5736 | 45.7% | 40.8% [39.5%, 42.0%] | **yes** |
| 0.5-0.6 | 10788 | 55.3% | 46.9% [45.9%, 47.8%] | **yes** |
| 0.6-0.7 | 10890 | 64.9% | 53.7% [52.8%, 54.7%] | **yes** |
| 0.7-0.8 | 5763 | 73.9% | 60.0% [58.7%, 61.2%] | **yes** |
| 0.8-0.9 | 614 | 82.8% | 61.2% [57.3%, 65.0%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 24598 rows (2026-05-16 → 2026-08-07) · Test: 10955 rows (2026-08-08 → 2026-08-30) · split at **2026-08-08**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2546 | 0.7044 | 59.11% |
| market | 0.2410 | 0.6750 | 50.03% |
| platt | 0.2447 | 0.6825 | 49.69% |
| isotonic | 0.2446 | 0.6822 | 49.69% |
| _observed_ | — | — | 49.77% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0100) · still loses to market: **true** (gap +0.0036).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 15758 | 48.88% | 0.2655 | 0.2425 | 14.5pp |
| Low | 14653 | 50.77% | 0.2477 | 0.2405 | 4.5pp |
| Medium | 5142 | 50.12% | 0.2458 | 0.2396 | 8.0pp |