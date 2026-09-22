# Model Learning Audit

**Rows:** 45655 decisive · **Dates:** 2026-05-16 → 2026-09-21

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2543 | 0.2412 |
| Log loss ↓ | 0.7044 | 0.6754 |
| Mean predicted | 59.34% | 50.12% |
| Observed | 50.24% | — |

Hit rate **50.24%** (22938/45655), 95% CI [49.78%, 50.70%]. Overconfidence **9.09pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 18515 | 54.04% [53.32%, 54.76%] | 0.2427 | 0.2356 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 16723 | 49.87% [49.11%, 50.62%] | 0.2621 | 0.2472 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 8159 | 42.87% [41.80%, 43.95%] | 0.2597 | 0.2409 | 11.6pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2258 | 48.49% [46.44%, 50.56%] | 0.2720 | 0.2455 | 14.2pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2427 vs market 0.2356; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2621 vs market 0.2472; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.8%, 43.9%] lies entirely below 50% on n=8159
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2720 vs market 0.2455; overconfident by 14.2pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2167 | 36.5% | 35.8% [33.8%, 37.8%] | no |
| 0.4-0.5 | 7261 | 45.7% | 41.5% [40.4%, 42.6%] | **yes** |
| 0.5-0.6 | 13925 | 55.3% | 46.9% [46.1%, 47.8%] | **yes** |
| 0.6-0.7 | 14049 | 64.9% | 54.1% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 7411 | 73.8% | 60.7% [59.5%, 61.8%] | **yes** |
| 0.8-0.9 | 796 | 82.7% | 62.7% [59.3%, 66.0%] | **yes** |
| 0.9-1.0 | 42 | 93.9% | 50.0% [35.5%, 64.5%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 31663 rows (2026-05-16 → 2026-08-21) · Test: 13992 rows (2026-08-22 → 2026-09-21) · split at **2026-08-22**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2517 | 0.6983 | 59.44% |
| market | 0.2412 | 0.6754 | 50.14% |
| platt | 0.2442 | 0.6814 | 49.90% |
| isotonic | 0.2441 | 0.6812 | 49.90% |
| _observed_ | — | — | 51.16% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0076) · still loses to market: **true** (gap +0.0028).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 20356 | 49.44% | 0.2640 | 0.2426 | 14.0pp |
| Low | 18740 | 51.05% | 0.2469 | 0.2404 | 4.3pp |
| Medium | 6559 | 50.42% | 0.2454 | 0.2396 | 7.7pp |