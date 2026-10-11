# Model Learning Audit

**Rows:** 49348 decisive · **Dates:** 2026-05-16 → 2026-10-10

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2548 | 0.2414 |
| Log loss ↓ | 0.7055 | 0.6757 |
| Mean predicted | 59.48% | 50.16% |
| Observed | 50.27% | — |

Hit rate **50.27%** (24808/49348), 95% CI [49.83%, 50.71%]. Overconfidence **9.21pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 20050 | 54.09% [53.40%, 54.78%] | 0.2433 | 0.2358 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 18236 | 49.80% [49.08%, 50.53%] | 0.2627 | 0.2472 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 8619 | 42.97% [41.93%, 44.02%] | 0.2596 | 0.2410 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2443 | 48.14% [46.16%, 50.12%] | 0.2733 | 0.2456 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2433 vs market 0.2358; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2627 vs market 0.2472; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.0%] lies entirely below 50% on n=8619
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2733 vs market 0.2456; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2264 | 36.5% | 35.6% [33.7%, 37.6%] | no |
| 0.4-0.5 | 7719 | 45.7% | 41.4% [40.3%, 42.5%] | **yes** |
| 0.5-0.6 | 14964 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 15346 | 64.9% | 54.1% [53.3%, 54.9%] | **yes** |
| 0.7-0.8 | 8119 | 73.9% | 60.3% [59.3%, 61.4%] | **yes** |
| 0.8-0.9 | 888 | 82.7% | 61.7% [58.5%, 64.9%] | **yes** |
| 0.9-1.0 | 44 | 93.9% | 50.0% [35.8%, 64.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 34439 rows (2026-05-16 → 2026-08-27) · Test: 14909 rows (2026-08-28 → 2026-10-10) · split at **2026-08-28**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2536 | 0.7028 | 59.90% |
| market | 0.2419 | 0.6768 | 50.26% |
| platt | 0.2449 | 0.6829 | 50.23% |
| isotonic | 0.2449 | 0.6830 | 50.23% |
| _observed_ | — | — | 51.21% |

**ADOPT platt for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `platt` · improves on raw model: **true** (Brier −0.0087) · still loses to market: **true** (gap +0.0030).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 22295 | 49.47% | 0.2646 | 0.2429 | 14.0pp |
| Low | 20007 | 51.07% | 0.2473 | 0.2405 | 4.4pp |
| Medium | 7046 | 50.53% | 0.2449 | 0.2392 | 7.7pp |