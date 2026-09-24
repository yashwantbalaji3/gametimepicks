# Model Learning Audit

**Rows:** 46733 decisive · **Dates:** 2026-05-16 → 2026-09-23

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2543 | 0.2412 |
| Log loss ↓ | 0.7045 | 0.6754 |
| Mean predicted | 59.37% | 50.13% |
| Observed | 50.27% | — |

Hit rate **50.27%** (23495/46733), 95% CI [49.82%, 50.73%]. Overconfidence **9.09pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 18947 | 54.10% [53.39%, 54.81%] | 0.2427 | 0.2356 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 17155 | 49.87% [49.12%, 50.62%] | 0.2620 | 0.2471 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 8316 | 42.95% [41.89%, 44.02%] | 0.2595 | 0.2408 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2315 | 48.25% [46.22%, 50.29%] | 0.2731 | 0.2456 | 14.5pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2427 vs market 0.2356; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2620 vs market 0.2471; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.0%] lies entirely below 50% on n=8316
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2731 vs market 0.2456; overconfident by 14.5pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2204 | 36.5% | 35.7% [33.7%, 37.7%] | no |
| 0.4-0.5 | 7415 | 45.7% | 41.5% [40.4%, 42.7%] | **yes** |
| 0.5-0.6 | 14221 | 55.3% | 46.9% [46.1%, 47.8%] | **yes** |
| 0.6-0.7 | 14421 | 64.9% | 54.1% [53.3%, 54.9%] | **yes** |
| 0.7-0.8 | 7604 | 73.9% | 60.7% [59.6%, 61.8%] | **yes** |
| 0.8-0.9 | 821 | 82.7% | 62.7% [59.4%, 66.0%] | **yes** |
| 0.9-1.0 | 43 | 93.9% | 51.2% [36.8%, 65.4%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 32227 rows (2026-05-16 → 2026-08-22) · Test: 14506 rows (2026-08-23 → 2026-09-23) · split at **2026-08-23**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2518 | 0.6985 | 59.52% |
| market | 0.2411 | 0.6751 | 50.15% |
| platt | 0.2442 | 0.6815 | 49.96% |
| isotonic | 0.2441 | 0.6812 | 49.95% |
| _observed_ | — | — | 51.23% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0077) · still loses to market: **true** (gap +0.0030).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 20912 | 49.54% | 0.2639 | 0.2426 | 13.9pp |
| Low | 19134 | 51.00% | 0.2470 | 0.2404 | 4.4pp |
| Medium | 6687 | 50.52% | 0.2451 | 0.2394 | 7.6pp |