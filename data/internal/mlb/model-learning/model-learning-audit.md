# Model Learning Audit

**Rows:** 47174 decisive · **Dates:** 2026-05-16 → 2026-09-24

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2544 | 0.2413 |
| Log loss ↓ | 0.7047 | 0.6756 |
| Mean predicted | 59.38% | 50.13% |
| Observed | 50.26% | — |

Hit rate **50.26%** (23712/47174), 95% CI [49.81%, 50.72%]. Overconfidence **9.12pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 19127 | 54.08% [53.37%, 54.79%] | 0.2429 | 0.2357 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 17334 | 49.82% [49.07%, 50.56%] | 0.2622 | 0.2471 | 10.2pp |
| `batter_total_bases` | **DISABLED** | 8376 | 43.03% [41.97%, 44.09%] | 0.2595 | 0.2410 | 11.4pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2337 | 48.31% [46.29%, 50.34%] | 0.2726 | 0.2456 | 14.4pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2429 vs market 0.2357; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2622 vs market 0.2471; overconfident by 10.2pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.1%] lies entirely below 50% on n=8376
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2726 vs market 0.2456; overconfident by 14.4pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2216 | 36.5% | 35.6% [33.6%, 37.6%] | no |
| 0.4-0.5 | 7465 | 45.7% | 41.6% [40.5%, 42.7%] | **yes** |
| 0.5-0.6 | 14354 | 55.3% | 46.9% [46.1%, 47.8%] | **yes** |
| 0.6-0.7 | 14567 | 64.9% | 54.0% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 7698 | 73.9% | 60.6% [59.5%, 61.7%] | **yes** |
| 0.8-0.9 | 827 | 82.7% | 62.5% [59.2%, 65.7%] | **yes** |
| 0.9-1.0 | 43 | 93.9% | 51.2% [36.8%, 65.4%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 32755 rows (2026-05-16 → 2026-08-23) · Test: 14419 rows (2026-08-24 → 2026-09-24) · split at **2026-08-24**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2523 | 0.6996 | 59.58% |
| market | 0.2414 | 0.6757 | 50.16% |
| platt | 0.2444 | 0.6818 | 50.02% |
| isotonic | 0.2443 | 0.6817 | 50.02% |
| _observed_ | — | — | 51.18% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0080) · still loses to market: **true** (gap +0.0029).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 21139 | 49.52% | 0.2640 | 0.2427 | 13.9pp |
| Low | 19291 | 50.99% | 0.2471 | 0.2404 | 4.4pp |
| Medium | 6744 | 50.52% | 0.2452 | 0.2395 | 7.6pp |