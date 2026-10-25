# Model Learning Audit

**Rows:** 49827 decisive · **Dates:** 2026-05-16 → 2026-10-24

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2547 | 0.2414 |
| Log loss ↓ | 0.7055 | 0.6757 |
| Mean predicted | 59.53% | 50.17% |
| Observed | 50.31% | — |

Hit rate **50.31%** (25067/49827), 95% CI [49.87%, 50.75%]. Overconfidence **9.22pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 20258 | 54.14% [53.45%, 54.82%] | 0.2433 | 0.2358 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 18444 | 49.85% [49.13%, 50.57%] | 0.2625 | 0.2471 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 8660 | 42.96% [41.92%, 44.00%] | 0.2596 | 0.2410 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2465 | 48.11% [46.15%, 50.09%] | 0.2736 | 0.2458 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2433 vs market 0.2358; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2625 vs market 0.2471; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.0%] lies entirely below 50% on n=8660
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2736 vs market 0.2458; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2270 | 36.5% | 35.6% [33.7%, 37.6%] | no |
| 0.4-0.5 | 7757 | 45.7% | 41.4% [40.3%, 42.5%] | **yes** |
| 0.5-0.6 | 15079 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 15524 | 64.9% | 54.2% [53.4%, 54.9%] | **yes** |
| 0.7-0.8 | 8251 | 73.9% | 60.3% [59.3%, 61.4%] | **yes** |
| 0.8-0.9 | 897 | 82.7% | 61.5% [58.3%, 64.7%] | **yes** |
| 0.9-1.0 | 45 | 93.8% | 51.1% [37.0%, 65.0%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 34796 rows (2026-05-16 → 2026-08-28) · Test: 15031 rows (2026-08-29 → 2026-10-24) · split at **2026-08-29**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2533 | 0.7022 | 60.03% |
| market | 0.2418 | 0.6766 | 50.30% |
| platt | 0.2448 | 0.6826 | 50.29% |
| isotonic | 0.2448 | 0.6826 | 50.31% |
| _observed_ | — | — | 51.35% |

**ADOPT platt for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `platt` · improves on raw model: **true** (Brier −0.0086) · still loses to market: **true** (gap +0.0029).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 22619 | 49.53% | 0.2645 | 0.2429 | 14.0pp |
| Low | 20108 | 51.07% | 0.2474 | 0.2405 | 4.4pp |
| Medium | 7100 | 50.63% | 0.2447 | 0.2391 | 7.6pp |