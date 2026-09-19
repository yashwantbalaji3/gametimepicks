# Model Learning Audit

**Rows:** 44494 decisive · **Dates:** 2026-05-16 → 2026-09-18

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2543 | 0.2413 |
| Log loss ↓ | 0.7044 | 0.6755 |
| Mean predicted | 59.33% | 50.12% |
| Observed | 50.24% | — |

Hit rate **50.24%** (22355/44494), 95% CI [49.78%, 50.71%]. Overconfidence **9.09pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 18057 | 54.00% [53.27%, 54.73%] | 0.2425 | 0.2354 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 16265 | 49.89% [49.12%, 50.66%] | 0.2622 | 0.2473 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 7971 | 43.02% [41.94%, 44.11%] | 0.2596 | 0.2410 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2201 | 48.16% [46.08%, 50.25%] | 0.2727 | 0.2453 | 14.5pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2425 vs market 0.2354; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2622 vs market 0.2473; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.1%] lies entirely below 50% on n=7971
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2727 vs market 0.2453; overconfident by 14.5pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2128 | 36.5% | 35.7% [33.7%, 37.7%] | no |
| 0.4-0.5 | 7071 | 45.7% | 41.5% [40.4%, 42.7%] | **yes** |
| 0.5-0.6 | 13575 | 55.3% | 47.0% [46.1%, 47.8%] | **yes** |
| 0.6-0.7 | 13677 | 64.9% | 54.1% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 7218 | 73.8% | 60.7% [59.6%, 61.8%] | **yes** |
| 0.8-0.9 | 779 | 82.7% | 62.5% [59.1%, 65.8%] | **yes** |
| 0.9-1.0 | 42 | 93.9% | 50.0% [35.5%, 64.5%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 31103 rows (2026-05-16 → 2026-08-20) · Test: 13391 rows (2026-08-21 → 2026-09-18) · split at **2026-08-21**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2512 | 0.6973 | 59.46% |
| market | 0.2414 | 0.6757 | 50.15% |
| platt | 0.2441 | 0.6813 | 49.85% |
| isotonic | 0.2440 | 0.6811 | 49.84% |
| _observed_ | — | — | 51.36% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0072) · still loses to market: **true** (gap +0.0026).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 19821 | 49.49% | 0.2638 | 0.2425 | 13.9pp |
| Low | 18262 | 51.05% | 0.2470 | 0.2406 | 4.3pp |
| Medium | 6411 | 50.27% | 0.2455 | 0.2396 | 7.9pp |