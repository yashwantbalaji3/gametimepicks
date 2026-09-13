# Model Learning Audit

**Rows:** 41565 decisive · **Dates:** 2026-05-16 → 2026-09-12

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2544 | 0.2412 |
| Log loss ↓ | 0.7047 | 0.6754 |
| Mean predicted | 59.29% | 50.11% |
| Observed | 50.15% | — |

Hit rate **50.15%** (20845/41565), 95% CI [49.67%, 50.63%]. Overconfidence **9.14pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 16899 | 53.80% [53.04%, 54.55%] | 0.2427 | 0.2353 | 6.7pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 15116 | 49.85% [49.06%, 50.65%] | 0.2622 | 0.2473 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 7500 | 43.09% [41.98%, 44.22%] | 0.2600 | 0.2413 | 11.4pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2050 | 48.10% [45.94%, 50.26%] | 0.2731 | 0.2453 | 14.7pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2427 vs market 0.2353; overconfident by 6.7pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2622 vs market 0.2473; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.2%] lies entirely below 50% on n=7500
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2731 vs market 0.2453; overconfident by 14.7pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 2005 | 36.5% | 35.4% [33.3%, 37.5%] | no |
| 0.4-0.5 | 6651 | 45.7% | 41.3% [40.2%, 42.5%] | **yes** |
| 0.5-0.6 | 12671 | 55.3% | 47.0% [46.1%, 47.9%] | **yes** |
| 0.6-0.7 | 12756 | 64.9% | 54.1% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 6711 | 73.8% | 60.5% [59.3%, 61.6%] | **yes** |
| 0.8-0.9 | 728 | 82.7% | 62.6% [59.1%, 66.1%] | **yes** |
| 0.9-1.0 | 40 | 94.0% | 50.0% [35.2%, 64.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 28719 rows (2026-05-16 → 2026-08-15) · Test: 12846 rows (2026-08-16 → 2026-09-12) · split at **2026-08-16**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2515 | 0.6979 | 59.34% |
| market | 0.2409 | 0.6746 | 50.16% |
| platt | 0.2440 | 0.6810 | 49.79% |
| isotonic | 0.2439 | 0.6808 | 49.79% |
| _observed_ | — | — | 50.98% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0076) · still loses to market: **true** (gap +0.0031).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 18420 | 49.41% | 0.2641 | 0.2426 | 14.0pp |
| Low | 17106 | 50.92% | 0.2471 | 0.2404 | 4.4pp |
| Medium | 6039 | 50.22% | 0.2456 | 0.2395 | 7.9pp |