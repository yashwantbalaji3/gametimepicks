# Model Learning Audit

**Rows:** 48992 decisive · **Dates:** 2026-05-16 → 2026-10-04

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2546 | 0.2414 |
| Log loss ↓ | 0.7053 | 0.6758 |
| Mean predicted | 59.45% | 50.15% |
| Observed | 50.29% | — |

Hit rate **50.29%** (24637/48992), 95% CI [49.85%, 50.73%]. Overconfidence **9.16pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 19896 | 54.10% [53.40%, 54.79%] | 0.2432 | 0.2358 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 18082 | 49.84% [49.11%, 50.57%] | 0.2624 | 0.2472 | 10.2pp |
| `batter_total_bases` | **DISABLED** | 8588 | 43.05% [42.00%, 44.10%] | 0.2596 | 0.2411 | 11.4pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2426 | 48.02% [46.04%, 50.01%] | 0.2736 | 0.2458 | 14.7pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2432 vs market 0.2358; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2624 vs market 0.2472; overconfident by 10.2pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.1%] lies entirely below 50% on n=8588
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2736 vs market 0.2458; overconfident by 14.7pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2263 | 36.5% | 35.7% [33.7%, 37.7%] | no |
| 0.4-0.5 | 7693 | 45.7% | 41.4% [40.3%, 42.5%] | **yes** |
| 0.5-0.6 | 14873 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 15210 | 64.9% | 54.1% [53.3%, 54.9%] | **yes** |
| 0.7-0.8 | 8035 | 73.9% | 60.3% [59.3%, 61.4%] | **yes** |
| 0.8-0.9 | 870 | 82.7% | 62.0% [58.7%, 65.1%] | **yes** |
| 0.9-1.0 | 44 | 93.9% | 50.0% [35.8%, 64.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 34259 rows (2026-05-16 → 2026-08-26) · Test: 14733 rows (2026-08-27 → 2026-10-04) · split at **2026-08-27**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2533 | 0.7020 | 59.81% |
| market | 0.2420 | 0.6770 | 50.24% |
| platt | 0.2449 | 0.6829 | 50.16% |
| isotonic | 0.2449 | 0.6829 | 50.16% |
| _observed_ | — | — | 51.29% |

**ADOPT platt for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `platt` · improves on raw model: **true** (Brier −0.0084) · still loses to market: **true** (gap +0.0029).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 22079 | 49.50% | 0.2645 | 0.2430 | 14.0pp |
| Low | 19916 | 51.07% | 0.2471 | 0.2405 | 4.3pp |
| Medium | 6997 | 50.54% | 0.2450 | 0.2393 | 7.6pp |