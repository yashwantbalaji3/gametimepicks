# Model Learning Audit

**Rows:** 49311 decisive · **Dates:** 2026-05-16 → 2026-10-08

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2547 | 0.2414 |
| Log loss ↓ | 0.7054 | 0.6758 |
| Mean predicted | 59.48% | 50.16% |
| Observed | 50.29% | — |

Hit rate **50.29%** (24798/49311), 95% CI [49.85%, 50.73%]. Overconfidence **9.19pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 20034 | 54.11% [53.42%, 54.80%] | 0.2432 | 0.2358 | 6.6pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 18220 | 49.84% [49.11%, 50.56%] | 0.2625 | 0.2472 | 10.2pp |
| `batter_total_bases` | **DISABLED** | 8616 | 42.99% [41.95%, 44.04%] | 0.2596 | 0.2411 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2441 | 48.10% [46.12%, 50.08%] | 0.2735 | 0.2457 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2432 vs market 0.2358; overconfident by 6.6pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2625 vs market 0.2472; overconfident by 10.2pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.0%] lies entirely below 50% on n=8616
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2735 vs market 0.2457; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2264 | 36.5% | 35.6% [33.7%, 37.6%] | no |
| 0.4-0.5 | 7716 | 45.7% | 41.4% [40.3%, 42.5%] | **yes** |
| 0.5-0.6 | 14953 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 15332 | 64.9% | 54.1% [53.3%, 54.9%] | **yes** |
| 0.7-0.8 | 8113 | 73.9% | 60.3% [59.3%, 61.4%] | **yes** |
| 0.8-0.9 | 885 | 82.7% | 61.9% [58.7%, 65.1%] | **yes** |
| 0.9-1.0 | 44 | 93.9% | 50.0% [35.8%, 64.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 34439 rows (2026-05-16 → 2026-08-27) · Test: 14872 rows (2026-08-28 → 2026-10-08) · split at **2026-08-28**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2534 | 0.7023 | 59.89% |
| market | 0.2419 | 0.6768 | 50.26% |
| platt | 0.2449 | 0.6829 | 50.22% |
| isotonic | 0.2449 | 0.6829 | 50.23% |
| _observed_ | — | — | 51.27% |

**ADOPT platt for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `platt` · improves on raw model: **true** (Brier −0.0085) · still loses to market: **true** (gap +0.0030).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 22275 | 49.49% | 0.2646 | 0.2429 | 14.0pp |
| Low | 19995 | 51.08% | 0.2472 | 0.2405 | 4.4pp |
| Medium | 7041 | 50.55% | 0.2449 | 0.2392 | 7.6pp |