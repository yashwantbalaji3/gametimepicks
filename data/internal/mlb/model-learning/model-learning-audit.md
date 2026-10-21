# Model Learning Audit

**Rows:** 49746 decisive · **Dates:** 2026-05-16 → 2026-10-19

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2548 | 0.2414 |
| Log loss ↓ | 0.7056 | 0.6758 |
| Mean predicted | 59.52% | 50.17% |
| Observed | 50.29% | — |

Hit rate **50.29%** (25016/49746), 95% CI [49.85%, 50.73%]. Overconfidence **9.23pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 20223 | 54.12% [53.43%, 54.80%] | 0.2433 | 0.2358 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 18409 | 49.82% [49.10%, 50.54%] | 0.2626 | 0.2471 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 8653 | 42.96% [41.92%, 44.00%] | 0.2596 | 0.2410 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2461 | 48.11% [46.14%, 50.09%] | 0.2735 | 0.2457 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2433 vs market 0.2358; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2626 vs market 0.2471; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.0%] lies entirely below 50% on n=8653
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2735 vs market 0.2457; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2269 | 36.5% | 35.6% [33.7%, 37.6%] | no |
| 0.4-0.5 | 7750 | 45.7% | 41.4% [40.3%, 42.5%] | **yes** |
| 0.5-0.6 | 15061 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 15490 | 64.9% | 54.1% [53.3%, 54.9%] | **yes** |
| 0.7-0.8 | 8230 | 73.9% | 60.3% [59.3%, 61.4%] | **yes** |
| 0.8-0.9 | 897 | 82.7% | 61.5% [58.3%, 64.7%] | **yes** |
| 0.9-1.0 | 45 | 93.8% | 51.1% [37.0%, 65.0%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 34796 rows (2026-05-16 → 2026-08-28) · Test: 14950 rows (2026-08-29 → 2026-10-19) · split at **2026-08-29**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2535 | 0.7025 | 60.01% |
| market | 0.2419 | 0.6767 | 50.29% |
| platt | 0.2448 | 0.6827 | 50.28% |
| isotonic | 0.2448 | 0.6827 | 50.30% |
| _observed_ | — | — | 51.29% |

**ADOPT platt for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `platt` · improves on raw model: **true** (Brier −0.0087) · still loses to market: **true** (gap +0.0029).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 22564 | 49.50% | 0.2645 | 0.2429 | 14.0pp |
| Low | 20089 | 51.06% | 0.2474 | 0.2405 | 4.4pp |
| Medium | 7093 | 50.61% | 0.2448 | 0.2391 | 7.6pp |