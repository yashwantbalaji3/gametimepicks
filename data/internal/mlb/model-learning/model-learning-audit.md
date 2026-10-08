# Model Learning Audit

**Rows:** 49273 decisive · **Dates:** 2026-05-16 → 2026-10-07

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2547 | 0.2414 |
| Log loss ↓ | 0.7054 | 0.6758 |
| Mean predicted | 59.48% | 50.16% |
| Observed | 50.27% | — |

Hit rate **50.27%** (24772/49273), 95% CI [49.83%, 50.72%]. Overconfidence **9.20pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 20018 | 54.09% [53.40%, 54.78%] | 0.2433 | 0.2358 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 18204 | 49.82% [49.09%, 50.55%] | 0.2625 | 0.2472 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 8613 | 43.00% [41.96%, 44.05%] | 0.2596 | 0.2411 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2438 | 48.03% [46.05%, 50.02%] | 0.2735 | 0.2456 | 14.7pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2433 vs market 0.2358; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2625 vs market 0.2472; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.1%] lies entirely below 50% on n=8613
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2735 vs market 0.2456; overconfident by 14.7pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2264 | 36.5% | 35.6% [33.7%, 37.6%] | no |
| 0.4-0.5 | 7711 | 45.7% | 41.4% [40.3%, 42.5%] | **yes** |
| 0.5-0.6 | 14945 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 15316 | 64.9% | 54.1% [53.3%, 54.9%] | **yes** |
| 0.7-0.8 | 8106 | 73.9% | 60.4% [59.3%, 61.4%] | **yes** |
| 0.8-0.9 | 883 | 82.7% | 61.8% [58.6%, 65.0%] | **yes** |
| 0.9-1.0 | 44 | 93.9% | 50.0% [35.8%, 64.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 34439 rows (2026-05-16 → 2026-08-27) · Test: 14834 rows (2026-08-28 → 2026-10-07) · split at **2026-08-28**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2535 | 0.7024 | 59.88% |
| market | 0.2419 | 0.6768 | 50.26% |
| platt | 0.2449 | 0.6828 | 50.21% |
| isotonic | 0.2449 | 0.6829 | 50.22% |
| _observed_ | — | — | 51.23% |

**ADOPT platt for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `platt` · improves on raw model: **true** (Brier −0.0086) · still loses to market: **true** (gap +0.0029).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 22256 | 49.49% | 0.2645 | 0.2429 | 14.0pp |
| Low | 19985 | 51.06% | 0.2472 | 0.2405 | 4.4pp |
| Medium | 7032 | 50.51% | 0.2450 | 0.2393 | 7.7pp |