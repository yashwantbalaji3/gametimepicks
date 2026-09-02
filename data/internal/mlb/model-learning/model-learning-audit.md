# Model Learning Audit

**Rows:** 36591 decisive · **Dates:** 2026-05-16 → 2026-09-01

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2549 | 0.2412 |
| Log loss ↓ | 0.7060 | 0.6754 |
| Mean predicted | 59.26% | 50.11% |
| Observed | 49.96% | — |

Hit rate **49.96%** (18280/36591), 95% CI [49.45%, 50.47%]. Overconfidence **9.30pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 14924 | 53.63% [52.82%, 54.42%] | 0.2431 | 0.2354 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 13141 | 49.74% [48.88%, 50.59%] | 0.2629 | 0.2475 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 6718 | 42.74% [41.56%, 43.92%] | 0.2608 | 0.2407 | 11.9pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1808 | 48.12% [45.82%, 50.42%] | 0.2732 | 0.2453 | 14.5pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2431 vs market 0.2354; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2629 vs market 0.2475; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.6%, 43.9%] lies entirely below 50% on n=6718
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2732 vs market 0.2453; overconfident by 14.5pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1787 | 36.5% | 35.8% [33.6%, 38.0%] | no |
| 0.4-0.5 | 5901 | 45.7% | 40.9% [39.6%, 42.1%] | **yes** |
| 0.5-0.6 | 11123 | 55.3% | 47.1% [46.1%, 48.0%] | **yes** |
| 0.6-0.7 | 11197 | 64.9% | 53.8% [52.9%, 54.7%] | **yes** |
| 0.7-0.8 | 5912 | 73.8% | 60.2% [58.9%, 61.4%] | **yes** |
| 0.8-0.9 | 629 | 82.8% | 61.4% [57.5%, 65.1%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 25166 rows (2026-05-16 → 2026-08-08) · Test: 11425 rows (2026-08-09 → 2026-09-01) · split at **2026-08-09**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2538 | 0.7028 | 59.07% |
| market | 0.2412 | 0.6753 | 50.04% |
| platt | 0.2446 | 0.6822 | 49.73% |
| isotonic | 0.2445 | 0.6820 | 49.73% |
| _observed_ | — | — | 50.02% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0093) · still loses to market: **true** (gap +0.0033).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 16181 | 49.14% | 0.2648 | 0.2425 | 14.2pp |
| Low | 15111 | 50.78% | 0.2476 | 0.2404 | 4.5pp |
| Medium | 5299 | 50.10% | 0.2460 | 0.2398 | 8.0pp |