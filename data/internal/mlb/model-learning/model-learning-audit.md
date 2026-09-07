# Model Learning Audit

**Rows:** 39011 decisive · **Dates:** 2026-05-16 → 2026-09-06

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2546 | 0.2412 |
| Log loss ↓ | 0.7052 | 0.6754 |
| Mean predicted | 59.28% | 50.11% |
| Observed | 50.12% | — |

Hit rate **50.12%** (19551/39011), 95% CI [49.62%, 50.61%]. Overconfidence **9.16pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 15879 | 53.77% [52.99%, 54.54%] | 0.2429 | 0.2354 | 6.7pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 14097 | 49.85% [49.02%, 50.67%] | 0.2625 | 0.2472 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 7105 | 42.96% [41.81%, 44.11%] | 0.2604 | 0.2411 | 11.6pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1930 | 48.39% [46.17%, 50.62%] | 0.2722 | 0.2453 | 14.3pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2429 vs market 0.2354; overconfident by 6.7pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2625 vs market 0.2472; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.8%, 44.1%] lies entirely below 50% on n=7105
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2722 vs market 0.2453; overconfident by 14.3pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1903 | 36.5% | 35.6% [33.5%, 37.8%] | no |
| 0.4-0.5 | 6264 | 45.7% | 41.2% [40.0%, 42.4%] | **yes** |
| 0.5-0.6 | 11875 | 55.3% | 47.0% [46.2%, 47.9%] | **yes** |
| 0.6-0.7 | 11936 | 64.9% | 54.0% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 6309 | 73.8% | 60.3% [59.1%, 61.5%] | **yes** |
| 0.8-0.9 | 682 | 82.7% | 62.3% [58.6%, 65.9%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 26726 rows (2026-05-16 → 2026-08-11) · Test: 12285 rows (2026-08-12 → 2026-09-06) · split at **2026-08-12**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2525 | 0.7000 | 59.26% |
| market | 0.2410 | 0.6749 | 50.12% |
| platt | 0.2443 | 0.6816 | 49.83% |
| isotonic | 0.2442 | 0.6814 | 49.83% |
| _observed_ | — | — | 50.66% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0083) · still loses to market: **true** (gap +0.0032).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 17290 | 49.38% | 0.2643 | 0.2425 | 14.0pp |
| Low | 16085 | 50.95% | 0.2473 | 0.2404 | 4.3pp |
| Medium | 5636 | 50.00% | 0.2460 | 0.2396 | 8.1pp |