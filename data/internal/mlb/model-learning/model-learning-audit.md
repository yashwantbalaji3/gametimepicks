# Model Learning Audit

**Rows:** 36020 decisive · **Dates:** 2026-05-16 → 2026-08-31

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2551 | 0.2412 |
| Log loss ↓ | 0.7063 | 0.6753 |
| Mean predicted | 59.27% | 50.11% |
| Observed | 49.89% | — |

Hit rate **49.89%** (17969/36020), 95% CI [49.37%, 50.40%]. Overconfidence **9.38pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 14703 | 53.61% [52.81%, 54.42%] | 0.2432 | 0.2354 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 12920 | 49.63% [48.77%, 50.49%] | 0.2632 | 0.2475 | 10.2pp |
| `batter_total_bases` | **DISABLED** | 6616 | 42.61% [41.42%, 43.80%] | 0.2609 | 0.2405 | 12.0pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1781 | 48.01% [45.69%, 50.33%] | 0.2736 | 0.2453 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2432 vs market 0.2354; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2632 vs market 0.2475; overconfident by 10.2pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.4%, 43.8%] lies entirely below 50% on n=6616
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2736 vs market 0.2453; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1751 | 36.5% | 35.9% [33.7%, 38.1%] | no |
| 0.4-0.5 | 5813 | 45.7% | 40.8% [39.5%, 42.1%] | **yes** |
| 0.5-0.6 | 10936 | 55.3% | 46.9% [46.0%, 47.8%] | **yes** |
| 0.6-0.7 | 11031 | 64.9% | 53.8% [52.9%, 54.7%] | **yes** |
| 0.7-0.8 | 5827 | 73.8% | 60.1% [58.9%, 61.4%] | **yes** |
| 0.8-0.9 | 620 | 82.8% | 61.3% [57.4%, 65.0%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 25166 rows (2026-05-16 → 2026-08-08) · Test: 10854 rows (2026-08-09 → 2026-08-31) · split at **2026-08-09**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2542 | 0.7037 | 59.10% |
| market | 0.2411 | 0.6752 | 50.04% |
| platt | 0.2445 | 0.6822 | 49.75% |
| isotonic | 0.2444 | 0.6819 | 49.76% |
| _observed_ | — | — | 49.79% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0098) · still loses to market: **true** (gap +0.0033).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 15946 | 49.03% | 0.2651 | 0.2424 | 14.3pp |
| Low | 14866 | 50.73% | 0.2477 | 0.2405 | 4.6pp |
| Medium | 5208 | 50.12% | 0.2457 | 0.2396 | 8.0pp |