# Model Learning Audit

**Rows:** 49665 decisive · **Dates:** 2026-05-16 → 2026-10-17

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2548 | 0.2414 |
| Log loss ↓ | 0.7056 | 0.6758 |
| Mean predicted | 59.51% | 50.17% |
| Observed | 50.28% | — |

Hit rate **50.28%** (24974/49665), 95% CI [49.85%, 50.72%]. Overconfidence **9.23pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 20187 | 54.12% [53.44%, 54.81%] | 0.2433 | 0.2359 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 18373 | 49.81% [49.09%, 50.54%] | 0.2626 | 0.2472 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 8647 | 42.94% [41.90%, 43.99%] | 0.2596 | 0.2410 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2458 | 48.13% [46.16%, 50.11%] | 0.2734 | 0.2457 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2433 vs market 0.2359; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2626 vs market 0.2472; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.0%] lies entirely below 50% on n=8647
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2734 vs market 0.2457; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2267 | 36.5% | 35.6% [33.7%, 37.6%] | no |
| 0.4-0.5 | 7744 | 45.7% | 41.4% [40.3%, 42.5%] | **yes** |
| 0.5-0.6 | 15039 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 15460 | 64.9% | 54.1% [53.3%, 54.9%] | **yes** |
| 0.7-0.8 | 8211 | 73.9% | 60.3% [59.3%, 61.4%] | **yes** |
| 0.8-0.9 | 895 | 82.7% | 61.6% [58.3%, 64.7%] | **yes** |
| 0.9-1.0 | 45 | 93.8% | 51.1% [37.0%, 65.0%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 34439 rows (2026-05-16 → 2026-08-27) · Test: 15226 rows (2026-08-28 → 2026-10-17) · split at **2026-08-28**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2537 | 0.7030 | 60.00% |
| market | 0.2420 | 0.6769 | 50.29% |
| platt | 0.2449 | 0.6829 | 50.28% |
| isotonic | 0.2449 | 0.6829 | 50.30% |
| _observed_ | — | — | 51.23% |

**ADOPT platt for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `platt` · improves on raw model: **true** (Brier −0.0088) · still loses to market: **true** (gap +0.0029).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 22507 | 49.50% | 0.2646 | 0.2429 | 14.0pp |
| Low | 20078 | 51.06% | 0.2473 | 0.2405 | 4.4pp |
| Medium | 7080 | 50.59% | 0.2448 | 0.2392 | 7.6pp |