# Model Learning Audit

**Rows:** 48070 decisive · **Dates:** 2026-05-16 → 2026-09-26

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2543 | 0.2413 |
| Log loss ↓ | 0.7045 | 0.6756 |
| Mean predicted | 59.40% | 50.14% |
| Observed | 50.33% | — |

Hit rate **50.33%** (24194/48070), 95% CI [49.88%, 50.78%]. Overconfidence **9.07pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 19496 | 54.15% [53.45%, 54.85%] | 0.2428 | 0.2356 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 17703 | 49.92% [49.18%, 50.65%] | 0.2620 | 0.2471 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 8490 | 43.03% [41.98%, 44.08%] | 0.2594 | 0.2410 | 11.4pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2381 | 48.17% [46.17%, 50.18%] | 0.2729 | 0.2457 | 14.5pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2428 vs market 0.2356; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2620 vs market 0.2471; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.1%] lies entirely below 50% on n=8490
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2729 vs market 0.2457; overconfident by 14.5pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2243 | 36.5% | 35.7% [33.7%, 37.7%] | no |
| 0.4-0.5 | 7582 | 45.7% | 41.5% [40.3%, 42.6%] | **yes** |
| 0.5-0.6 | 14633 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 14878 | 64.9% | 54.2% [53.4%, 55.0%] | **yes** |
| 0.7-0.8 | 7849 | 73.9% | 60.6% [59.5%, 61.6%] | **yes** |
| 0.8-0.9 | 838 | 82.7% | 62.3% [59.0%, 65.5%] | **yes** |
| 0.9-1.0 | 43 | 93.9% | 51.2% [36.8%, 65.4%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 33133 rows (2026-05-16 → 2026-08-24) · Test: 14937 rows (2026-08-25 → 2026-09-26) · split at **2026-08-25**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2518 | 0.6987 | 59.62% |
| market | 0.2414 | 0.6758 | 50.19% |
| platt | 0.2443 | 0.6817 | 50.03% |
| isotonic | 0.2443 | 0.6816 | 50.04% |
| _observed_ | — | — | 51.37% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0075) · still loses to market: **true** (gap +0.0028).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 21572 | 49.61% | 0.2639 | 0.2428 | 13.8pp |
| Low | 19618 | 51.02% | 0.2471 | 0.2405 | 4.4pp |
| Medium | 6880 | 50.63% | 0.2449 | 0.2393 | 7.5pp |