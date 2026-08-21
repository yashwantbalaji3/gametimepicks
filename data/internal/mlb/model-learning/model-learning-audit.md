# Model Learning Audit

**Rows:** 31103 decisive · **Dates:** 2026-05-16 → 2026-08-20

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2556 | 0.2412 |
| Log loss ↓ | 0.7075 | 0.6754 |
| Mean predicted | 59.28% | 50.11% |
| Observed | 49.76% | — |

Hit rate **49.76%** (15477/31103), 95% CI [49.20%, 50.32%]. Overconfidence **9.51pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 12758 | 53.59% [52.72%, 54.45%] | 0.2436 | 0.2357 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 10973 | 49.46% [48.52%, 50.39%] | 0.2637 | 0.2476 | 10.4pp |
| `batter_total_bases` | **DISABLED** | 5819 | 42.46% [41.20%, 43.74%] | 0.2616 | 0.2403 | 12.3pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1553 | 47.78% [45.30%, 50.27%] | 0.2738 | 0.2449 | 14.8pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2436 vs market 0.2357; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2637 vs market 0.2476; overconfident by 10.4pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.2%, 43.7%] lies entirely below 50% on n=5819
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2738 vs market 0.2449; overconfident by 14.8pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1521 | 36.5% | 36.1% [33.7%, 38.5%] | no |
| 0.4-0.5 | 5044 | 45.7% | 41.0% [39.6%, 42.3%] | **yes** |
| 0.5-0.6 | 9438 | 55.3% | 46.7% [45.6%, 47.7%] | **yes** |
| 0.6-0.7 | 9444 | 64.9% | 53.7% [52.7%, 54.7%] | **yes** |
| 0.7-0.8 | 5073 | 73.9% | 59.9% [58.5%, 61.2%] | **yes** |
| 0.8-0.9 | 542 | 82.8% | 60.3% [56.2%, 64.4%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 21633 rows (2026-05-16 → 2026-07-27) · Test: 9470 rows (2026-07-30 → 2026-08-20) · split at **2026-07-30**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2556 | 0.7065 | 58.80% |
| market | 0.2413 | 0.6755 | 49.99% |
| platt | 0.2446 | 0.6822 | 49.73% |
| isotonic | 0.2445 | 0.6822 | 49.73% |
| _observed_ | — | — | 48.84% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0110) · still loses to market: **true** (gap +0.0033).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 13724 | 48.83% | 0.2656 | 0.2425 | 14.5pp |
| Low | 12883 | 50.87% | 0.2481 | 0.2406 | 4.5pp |
| Medium | 4496 | 49.42% | 0.2463 | 0.2392 | 8.7pp |