# Model Learning Audit

**Rows:** 49889 decisive · **Dates:** 2026-05-16 → 2026-10-27

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2548 | 0.2414 |
| Log loss ↓ | 0.7056 | 0.6758 |
| Mean predicted | 59.53% | 50.17% |
| Observed | 50.31% | — |

Hit rate **50.31%** (25097/49889), 95% CI [49.87%, 50.74%]. Overconfidence **9.22pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 20284 | 54.13% [53.44%, 54.82%] | 0.2433 | 0.2358 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 18470 | 49.84% [49.12%, 50.56%] | 0.2626 | 0.2471 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 8667 | 42.97% [41.93%, 44.01%] | 0.2596 | 0.2410 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2468 | 48.14% [46.17%, 50.11%] | 0.2738 | 0.2458 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2433 vs market 0.2358; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2626 vs market 0.2471; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.0%] lies entirely below 50% on n=8667
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2738 vs market 0.2458; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2273 | 36.5% | 35.7% [33.7%, 37.7%] | no |
| 0.4-0.5 | 7766 | 45.7% | 41.4% [40.3%, 42.5%] | **yes** |
| 0.5-0.6 | 15099 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 15546 | 64.9% | 54.1% [53.4%, 54.9%] | **yes** |
| 0.7-0.8 | 8258 | 73.9% | 60.3% [59.3%, 61.4%] | **yes** |
| 0.8-0.9 | 898 | 82.7% | 61.5% [58.2%, 64.6%] | **yes** |
| 0.9-1.0 | 45 | 93.8% | 51.1% [37.0%, 65.0%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 34796 rows (2026-05-16 → 2026-08-28) · Test: 15093 rows (2026-08-29 → 2026-10-27) · split at **2026-08-29**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2535 | 0.7024 | 60.03% |
| market | 0.2419 | 0.6768 | 50.30% |
| platt | 0.2448 | 0.6828 | 50.29% |
| isotonic | 0.2448 | 0.6827 | 50.31% |
| _observed_ | — | — | 51.34% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0086) · still loses to market: **true** (gap +0.0029).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 22648 | 49.53% | 0.2645 | 0.2429 | 14.0pp |
| Low | 20130 | 51.07% | 0.2474 | 0.2405 | 4.4pp |
| Medium | 7111 | 50.63% | 0.2447 | 0.2391 | 7.6pp |