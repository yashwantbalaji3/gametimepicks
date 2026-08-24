# Model Learning Audit

**Rows:** 32755 decisive · **Dates:** 2026-05-16 → 2026-08-23

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2554 | 0.2413 |
| Log loss ↓ | 0.7070 | 0.6755 |
| Mean predicted | 59.30% | 50.12% |
| Observed | 49.86% | — |

Hit rate **49.86%** (16333/32755), 95% CI [49.32%, 50.41%]. Overconfidence **9.43pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 13422 | 53.61% [52.77%, 54.46%] | 0.2437 | 0.2358 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 11639 | 49.61% [48.70%, 50.52%] | 0.2633 | 0.2476 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 6066 | 42.60% [41.36%, 43.85%] | 0.2612 | 0.2402 | 12.1pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1628 | 47.85% [45.43%, 50.28%] | 0.2732 | 0.2449 | 14.8pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2437 vs market 0.2358; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2633 vs market 0.2476; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.4%, 43.8%] lies entirely below 50% on n=6066
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2732 vs market 0.2449; overconfident by 14.8pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1588 | 36.5% | 36.3% [33.9%, 38.7%] | no |
| 0.4-0.5 | 5309 | 45.7% | 40.9% [39.6%, 42.2%] | **yes** |
| 0.5-0.6 | 9922 | 55.3% | 46.8% [45.8%, 47.8%] | **yes** |
| 0.6-0.7 | 9978 | 64.9% | 53.8% [52.8%, 54.7%] | **yes** |
| 0.7-0.8 | 5343 | 73.9% | 60.1% [58.8%, 61.4%] | **yes** |
| 0.8-0.9 | 574 | 82.8% | 60.6% [56.6%, 64.5%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 22449 rows (2026-05-16 → 2026-08-03) · Test: 10306 rows (2026-08-04 → 2026-08-23) · split at **2026-08-04**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2543 | 0.7038 | 58.88% |
| market | 0.2413 | 0.6756 | 49.97% |
| platt | 0.2445 | 0.6820 | 49.63% |
| isotonic | 0.2444 | 0.6818 | 49.63% |
| _observed_ | — | — | 49.51% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0099) · still loses to market: **true** (gap +0.0030).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 14474 | 48.99% | 0.2653 | 0.2426 | 14.4pp |
| Low | 13543 | 50.86% | 0.2479 | 0.2405 | 4.5pp |
| Medium | 4738 | 49.68% | 0.2465 | 0.2397 | 8.4pp |