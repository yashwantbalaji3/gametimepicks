# Model Learning Audit

**Rows:** 21633 decisive · **Dates:** 2026-05-16 → 2026-07-28

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2556 | 0.2412 |
| Log loss ↓ | 0.7079 | 0.6754 |
| Mean predicted | 59.48% | 50.16% |
| Observed | 50.16% | — |

Hit rate **50.16%** (10852/21633), 95% CI [49.50%, 50.83%]. Overconfidence **9.32pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 9005 | 53.81% [52.78%, 54.84%] | 0.2434 | 0.2349 | 6.7pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 7408 | 49.64% [48.50%, 50.77%] | 0.2638 | 0.2477 | 10.4pp |
| `batter_total_bases` | **DISABLED** | 4120 | 43.76% [42.25%, 45.28%] | 0.2628 | 0.2426 | 11.6pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1100 | 47.82% [44.88%, 50.77%] | 0.2729 | 0.2435 | 15.1pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2434 vs market 0.2349; overconfident by 6.7pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2638 vs market 0.2477; overconfident by 10.4pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.3%, 45.3%] lies entirely below 50% on n=4120
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2729 vs market 0.2435; overconfident by 15.1pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1087 | 36.5% | 36.5% [33.7%, 39.4%] | no |
| 0.4-0.5 | 3386 | 45.7% | 41.3% [39.6%, 43.0%] | **yes** |
| 0.5-0.6 | 6453 | 55.3% | 47.2% [46.0%, 48.4%] | **yes** |
| 0.6-0.7 | 6604 | 64.9% | 53.9% [52.7%, 55.1%] | **yes** |
| 0.7-0.8 | 3665 | 73.9% | 59.9% [58.3%, 61.5%] | **yes** |
| 0.8-0.9 | 400 | 82.8% | 59.0% [54.1%, 63.7%] | **yes** |
| 0.9-1.0 | 35 | 94.2% | 51.4% [35.6%, 67.0%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 14938 rows (2026-05-16 → 2026-06-25) · Test: 6695 rows (2026-07-01 → 2026-07-28) · split at **2026-07-01**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2559 | 0.7095 | 59.23% |
| market | 0.2413 | 0.6757 | 50.08% |
| platt | 0.2455 | 0.6847 | 50.08% |
| isotonic | 0.2456 | 0.6844 | 50.07% |
| _observed_ | — | — | 49.84% |

**ADOPT platt for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `platt` · improves on raw model: **true** (Brier −0.0104) · still loses to market: **true** (gap +0.0042).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 9672 | 49.26% | 0.2649 | 0.2425 | 14.2pp |
| Low | 8875 | 51.00% | 0.2491 | 0.2404 | 4.6pp |
| Medium | 3086 | 50.62% | 0.2450 | 0.2396 | 7.5pp |