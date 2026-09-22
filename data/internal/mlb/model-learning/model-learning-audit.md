# Model Learning Audit

**Rows:** 45550 decisive · **Dates:** 2026-05-16 → 2026-09-20

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2542 | 0.2412 |
| Log loss ↓ | 0.7043 | 0.6754 |
| Mean predicted | 59.34% | 50.12% |
| Observed | 50.25% | — |

Hit rate **50.25%** (22890/45550), 95% CI [49.79%, 50.71%]. Overconfidence **9.09pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 18472 | 54.03% [53.31%, 54.75%] | 0.2426 | 0.2355 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 16680 | 49.89% [49.13%, 50.65%] | 0.2621 | 0.2472 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 8144 | 42.89% [41.82%, 43.97%] | 0.2597 | 0.2409 | 11.6pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2254 | 48.54% [46.48%, 50.60%] | 0.2718 | 0.2455 | 14.1pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2426 vs market 0.2355; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2621 vs market 0.2472; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.8%, 44.0%] lies entirely below 50% on n=8144
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2718 vs market 0.2455; overconfident by 14.1pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2162 | 36.5% | 35.8% [33.8%, 37.8%] | no |
| 0.4-0.5 | 7245 | 45.7% | 41.5% [40.3%, 42.6%] | **yes** |
| 0.5-0.6 | 13887 | 55.3% | 47.0% [46.1%, 47.8%] | **yes** |
| 0.6-0.7 | 14013 | 64.9% | 54.1% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 7402 | 73.8% | 60.7% [59.6%, 61.8%] | **yes** |
| 0.8-0.9 | 795 | 82.7% | 62.8% [59.4%, 66.1%] | **yes** |
| 0.9-1.0 | 42 | 93.9% | 50.0% [35.5%, 64.5%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 31663 rows (2026-05-16 → 2026-08-21) · Test: 13887 rows (2026-08-22 → 2026-09-20) · split at **2026-08-22**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2515 | 0.6979 | 59.45% |
| market | 0.2412 | 0.6753 | 50.15% |
| platt | 0.2441 | 0.6812 | 49.91% |
| isotonic | 0.2440 | 0.6810 | 49.90% |
| _observed_ | — | — | 51.20% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0075) · still loses to market: **true** (gap +0.0028).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 20316 | 49.48% | 0.2639 | 0.2426 | 13.9pp |
| Low | 18696 | 51.05% | 0.2468 | 0.2404 | 4.3pp |
| Medium | 6538 | 50.37% | 0.2454 | 0.2395 | 7.8pp |