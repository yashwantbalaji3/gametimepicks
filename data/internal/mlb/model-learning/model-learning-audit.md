# Model Learning Audit

**Rows:** 39752 decisive · **Dates:** 2026-05-16 → 2026-09-08

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2548 | 0.2413 |
| Log loss ↓ | 0.7056 | 0.6755 |
| Mean predicted | 59.30% | 50.11% |
| Observed | 50.08% | — |

Hit rate **50.08%** (19909/39752), 95% CI [49.59%, 50.57%]. Overconfidence **9.21pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 16176 | 53.74% [52.97%, 54.51%] | 0.2430 | 0.2354 | 6.7pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 14394 | 49.82% [49.00%, 50.64%] | 0.2628 | 0.2473 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 7216 | 42.92% [41.78%, 44.06%] | 0.2603 | 0.2410 | 11.6pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1966 | 48.22% [46.02%, 50.43%] | 0.2730 | 0.2452 | 14.5pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2430 vs market 0.2354; overconfident by 6.7pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2628 vs market 0.2473; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.8%, 44.1%] lies entirely below 50% on n=7216
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2730 vs market 0.2452; overconfident by 14.5pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1934 | 36.5% | 35.6% [33.5%, 37.7%] | no |
| 0.4-0.5 | 6364 | 45.7% | 41.3% [40.1%, 42.5%] | **yes** |
| 0.5-0.6 | 12084 | 55.3% | 47.0% [46.1%, 47.9%] | **yes** |
| 0.6-0.7 | 12185 | 64.9% | 54.0% [53.1%, 54.9%] | **yes** |
| 0.7-0.8 | 6442 | 73.8% | 60.2% [59.0%, 61.4%] | **yes** |
| 0.8-0.9 | 701 | 82.7% | 62.2% [58.5%, 65.7%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 27644 rows (2026-05-16 → 2026-08-13) · Test: 12108 rows (2026-08-14 → 2026-09-08) · split at **2026-08-14**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2524 | 0.6998 | 59.40% |
| market | 0.2409 | 0.6747 | 50.17% |
| platt | 0.2443 | 0.6816 | 49.81% |
| isotonic | 0.2442 | 0.6815 | 49.82% |
| _observed_ | — | — | 50.83% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0082) · still loses to market: **true** (gap +0.0033).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 17642 | 49.31% | 0.2646 | 0.2426 | 14.1pp |
| Low | 16372 | 50.91% | 0.2473 | 0.2404 | 4.4pp |
| Medium | 5738 | 50.10% | 0.2459 | 0.2397 | 8.0pp |