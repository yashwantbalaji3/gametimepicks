# Model Learning Audit

**Rows:** 41007 decisive · **Dates:** 2026-05-16 → 2026-09-11

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2546 | 0.2413 |
| Log loss ↓ | 0.7051 | 0.6755 |
| Mean predicted | 59.30% | 50.12% |
| Observed | 50.13% | — |

Hit rate **50.13%** (20557/41007), 95% CI [49.65%, 50.61%]. Overconfidence **9.17pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 16679 | 53.80% [53.04%, 54.55%] | 0.2429 | 0.2354 | 6.7pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 14896 | 49.82% [49.02%, 50.62%] | 0.2625 | 0.2473 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 7406 | 43.03% [41.91%, 44.16%] | 0.2601 | 0.2413 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2026 | 48.17% [46.00%, 50.35%] | 0.2724 | 0.2451 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2429 vs market 0.2354; overconfident by 6.7pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2625 vs market 0.2473; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.2%] lies entirely below 50% on n=7406
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2724 vs market 0.2451; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1980 | 36.5% | 35.7% [33.6%, 37.8%] | no |
| 0.4-0.5 | 6549 | 45.7% | 41.3% [40.1%, 42.5%] | **yes** |
| 0.5-0.6 | 12503 | 55.2% | 46.9% [46.0%, 47.8%] | **yes** |
| 0.6-0.7 | 12584 | 64.9% | 54.1% [53.2%, 55.0%] | **yes** |
| 0.7-0.8 | 6629 | 73.8% | 60.4% [59.2%, 61.5%] | **yes** |
| 0.8-0.9 | 719 | 82.7% | 62.6% [59.0%, 66.0%] | **yes** |
| 0.9-1.0 | 40 | 94.0% | 50.0% [35.2%, 64.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 28161 rows (2026-05-16 → 2026-08-14) · Test: 12846 rows (2026-08-15 → 2026-09-11) · split at **2026-08-15**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2520 | 0.6989 | 59.38% |
| market | 0.2411 | 0.6751 | 50.19% |
| platt | 0.2442 | 0.6815 | 49.80% |
| isotonic | 0.2442 | 0.6814 | 49.80% |
| _observed_ | — | — | 50.95% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0078) · still loses to market: **true** (gap +0.0031).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 18191 | 49.35% | 0.2643 | 0.2426 | 14.0pp |
| Low | 16876 | 50.94% | 0.2472 | 0.2404 | 4.3pp |
| Medium | 5940 | 50.20% | 0.2457 | 0.2396 | 7.9pp |