# Model Learning Audit

**Rows:** 48788 decisive · **Dates:** 2026-05-16 → 2026-10-01

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2545 | 0.2414 |
| Log loss ↓ | 0.7048 | 0.6758 |
| Mean predicted | 59.43% | 50.15% |
| Observed | 50.33% | — |

Hit rate **50.33%** (24556/48788), 95% CI [49.89%, 50.78%]. Overconfidence **9.09pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 19801 | 54.13% [53.44%, 54.83%] | 0.2430 | 0.2357 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 17995 | 49.92% [49.19%, 50.65%] | 0.2621 | 0.2472 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 8577 | 43.08% [42.04%, 44.13%] | 0.2595 | 0.2412 | 11.4pp |
| `pitcher_strikeouts` | **DISABLED** | 2415 | 47.99% [46.00%, 49.99%] | 0.2740 | 0.2458 | 14.7pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2430 vs market 0.2357; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2621 vs market 0.2472; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.1%] lies entirely below 50% on n=8577
- `pitcher_strikeouts` → **DISABLED**: the 95% interval [46.0%, 50.0%] lies entirely below 50% on n=2415

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2261 | 36.5% | 35.7% [33.7%, 37.7%] | no |
| 0.4-0.5 | 7679 | 45.7% | 41.5% [40.4%, 42.6%] | **yes** |
| 0.5-0.6 | 14826 | 55.3% | 47.1% [46.3%, 47.9%] | **yes** |
| 0.6-0.7 | 15132 | 64.9% | 54.2% [53.4%, 55.0%] | **yes** |
| 0.7-0.8 | 7984 | 73.9% | 60.5% [59.4%, 61.5%] | **yes** |
| 0.8-0.9 | 858 | 82.7% | 62.1% [58.8%, 65.3%] | **yes** |
| 0.9-1.0 | 44 | 93.9% | 50.0% [35.8%, 64.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 33687 rows (2026-05-16 → 2026-08-25) · Test: 15101 rows (2026-08-26 → 2026-10-01) · split at **2026-08-26**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2526 | 0.7003 | 59.70% |
| market | 0.2419 | 0.6766 | 50.21% |
| platt | 0.2447 | 0.6824 | 50.10% |
| isotonic | 0.2447 | 0.6824 | 50.10% |
| _observed_ | — | — | 51.35% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0079) · still loses to market: **true** (gap +0.0028).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 21959 | 49.57% | 0.2642 | 0.2429 | 13.9pp |
| Low | 19856 | 51.08% | 0.2470 | 0.2405 | 4.3pp |
| Medium | 6973 | 50.60% | 0.2449 | 0.2393 | 7.6pp |