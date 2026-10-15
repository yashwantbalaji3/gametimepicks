# Model Learning Audit

**Rows:** 49540 decisive · **Dates:** 2026-05-16 → 2026-10-14

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2548 | 0.2414 |
| Log loss ↓ | 0.7056 | 0.6757 |
| Mean predicted | 59.50% | 50.17% |
| Observed | 50.28% | — |

Hit rate **50.28%** (24908/49540), 95% CI [49.84%, 50.72%]. Overconfidence **9.23pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 20133 | 54.13% [53.44%, 54.81%] | 0.2433 | 0.2358 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 18319 | 49.81% [49.08%, 50.53%] | 0.2626 | 0.2472 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 8634 | 42.95% [41.91%, 43.99%] | 0.2596 | 0.2410 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2454 | 48.04% [46.07%, 50.02%] | 0.2737 | 0.2456 | 14.7pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2433 vs market 0.2358; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2626 vs market 0.2472; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.0%] lies entirely below 50% on n=8634
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2737 vs market 0.2456; overconfident by 14.7pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2265 | 36.5% | 35.7% [33.7%, 37.7%] | no |
| 0.4-0.5 | 7732 | 45.7% | 41.4% [40.3%, 42.5%] | **yes** |
| 0.5-0.6 | 15007 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 15415 | 64.9% | 54.1% [53.3%, 54.9%] | **yes** |
| 0.7-0.8 | 8180 | 73.9% | 60.4% [59.3%, 61.4%] | **yes** |
| 0.8-0.9 | 893 | 82.7% | 61.5% [58.2%, 64.6%] | **yes** |
| 0.9-1.0 | 44 | 93.9% | 50.0% [35.8%, 64.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 34439 rows (2026-05-16 → 2026-08-27) · Test: 15101 rows (2026-08-28 → 2026-10-14) · split at **2026-08-28**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2537 | 0.7029 | 59.97% |
| market | 0.2419 | 0.6768 | 50.28% |
| platt | 0.2449 | 0.6829 | 50.27% |
| isotonic | 0.2449 | 0.6829 | 50.28% |
| _observed_ | — | — | 51.22% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0088) · still loses to market: **true** (gap +0.0030).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 22423 | 49.50% | 0.2645 | 0.2429 | 14.0pp |
| Low | 20051 | 51.05% | 0.2474 | 0.2405 | 4.4pp |
| Medium | 7066 | 50.57% | 0.2449 | 0.2392 | 7.6pp |