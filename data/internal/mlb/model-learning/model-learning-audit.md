# Model Learning Audit

**Rows:** 39200 decisive · **Dates:** 2026-05-16 → 2026-09-07

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2546 | 0.2412 |
| Log loss ↓ | 0.7053 | 0.6754 |
| Mean predicted | 59.29% | 50.11% |
| Observed | 50.11% | — |

Hit rate **50.11%** (19643/39200), 95% CI [49.61%, 50.60%]. Overconfidence **9.18pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 15955 | 53.76% [52.98%, 54.53%] | 0.2430 | 0.2355 | 6.7pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 14173 | 49.85% [49.03%, 50.67%] | 0.2625 | 0.2472 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 7132 | 42.96% [41.82%, 44.11%] | 0.2603 | 0.2411 | 11.6pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1940 | 48.30% [46.08%, 50.52%] | 0.2726 | 0.2453 | 14.4pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2430 vs market 0.2355; overconfident by 6.7pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2625 vs market 0.2472; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.8%, 44.1%] lies entirely below 50% on n=7132
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2726 vs market 0.2453; overconfident by 14.4pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1911 | 36.5% | 35.6% [33.5%, 37.8%] | no |
| 0.4-0.5 | 6287 | 45.7% | 41.2% [40.0%, 42.4%] | **yes** |
| 0.5-0.6 | 11923 | 55.3% | 47.0% [46.1%, 47.9%] | **yes** |
| 0.6-0.7 | 12000 | 64.9% | 54.0% [53.1%, 54.9%] | **yes** |
| 0.7-0.8 | 6346 | 73.8% | 60.3% [59.1%, 61.5%] | **yes** |
| 0.8-0.9 | 691 | 82.7% | 62.2% [58.6%, 65.8%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 27318 rows (2026-05-16 → 2026-08-12) · Test: 11882 rows (2026-08-13 → 2026-09-07) · split at **2026-08-13**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2526 | 0.7001 | 59.36% |
| market | 0.2410 | 0.6749 | 50.15% |
| platt | 0.2443 | 0.6817 | 49.87% |
| isotonic | 0.2442 | 0.6814 | 49.88% |
| _observed_ | — | — | 50.73% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0084) · still loses to market: **true** (gap +0.0032).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 17380 | 49.36% | 0.2643 | 0.2424 | 14.0pp |
| Low | 16163 | 50.94% | 0.2473 | 0.2404 | 4.3pp |
| Medium | 5657 | 50.04% | 0.2459 | 0.2396 | 8.1pp |