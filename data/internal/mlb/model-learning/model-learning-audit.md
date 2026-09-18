# Model Learning Audit

**Rows:** 43942 decisive · **Dates:** 2026-05-16 → 2026-09-17

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2544 | 0.2413 |
| Log loss ↓ | 0.7047 | 0.6755 |
| Mean predicted | 59.33% | 50.12% |
| Observed | 50.18% | — |

Hit rate **50.18%** (22050/43942), 95% CI [49.71%, 50.65%]. Overconfidence **9.15pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 17838 | 53.95% [53.22%, 54.68%] | 0.2427 | 0.2355 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 16053 | 49.80% [49.02%, 50.57%] | 0.2623 | 0.2472 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 7877 | 42.99% [41.90%, 44.08%] | 0.2598 | 0.2411 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2174 | 48.11% [46.02%, 50.22%] | 0.2726 | 0.2455 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2427 vs market 0.2355; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2623 vs market 0.2472; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.1%] lies entirely below 50% on n=7877
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2726 vs market 0.2455; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 2104 | 36.5% | 35.6% [33.6%, 37.7%] | no |
| 0.4-0.5 | 6980 | 45.7% | 41.5% [40.3%, 42.6%] | **yes** |
| 0.5-0.6 | 13404 | 55.3% | 46.9% [46.0%, 47.7%] | **yes** |
| 0.6-0.7 | 13517 | 64.9% | 54.0% [53.1%, 54.8%] | **yes** |
| 0.7-0.8 | 7126 | 73.8% | 60.6% [59.5%, 61.8%] | **yes** |
| 0.8-0.9 | 766 | 82.7% | 62.7% [59.2%, 66.0%] | **yes** |
| 0.9-1.0 | 42 | 93.9% | 50.0% [35.5%, 64.5%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 30226 rows (2026-05-16 → 2026-08-18) · Test: 13716 rows (2026-08-19 → 2026-09-17) · split at **2026-08-19**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2523 | 0.6995 | 59.49% |
| market | 0.2416 | 0.6760 | 50.19% |
| platt | 0.2443 | 0.6816 | 49.93% |
| isotonic | 0.2443 | 0.6816 | 49.93% |
| _observed_ | — | — | 50.98% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0080) · still loses to market: **true** (gap +0.0027).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 19569 | 49.42% | 0.2640 | 0.2425 | 14.0pp |
| Low | 18034 | 50.98% | 0.2471 | 0.2406 | 4.4pp |
| Medium | 6339 | 50.26% | 0.2456 | 0.2396 | 7.9pp |