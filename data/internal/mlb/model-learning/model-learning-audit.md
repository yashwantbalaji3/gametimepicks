# Model Learning Audit

**Rows:** 32227 decisive · **Dates:** 2026-05-16 → 2026-08-22

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2554 | 0.2413 |
| Log loss ↓ | 0.7072 | 0.6756 |
| Mean predicted | 59.30% | 50.12% |
| Observed | 49.85% | — |

Hit rate **49.85%** (16064/32227), 95% CI [49.30%, 50.39%]. Overconfidence **9.46pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 13214 | 53.64% [52.79%, 54.49%] | 0.2437 | 0.2358 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 11429 | 49.58% [48.67%, 50.50%] | 0.2634 | 0.2476 | 10.3pp |
| `batter_total_bases` | **DISABLED** | 5978 | 42.52% [41.27%, 43.78%] | 0.2613 | 0.2403 | 12.2pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1606 | 47.76% [45.32%, 50.20%] | 0.2735 | 0.2449 | 14.8pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2437 vs market 0.2358; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2634 vs market 0.2476; overconfident by 10.3pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.3%, 43.8%] lies entirely below 50% on n=5978
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2735 vs market 0.2449; overconfident by 14.8pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1561 | 36.5% | 36.4% [34.0%, 38.8%] | no |
| 0.4-0.5 | 5223 | 45.7% | 40.9% [39.5%, 42.2%] | **yes** |
| 0.5-0.6 | 9765 | 55.3% | 46.8% [45.8%, 47.8%] | **yes** |
| 0.6-0.7 | 9814 | 64.9% | 53.7% [52.7%, 54.7%] | **yes** |
| 0.7-0.8 | 5256 | 73.9% | 60.0% [58.7%, 61.3%] | **yes** |
| 0.8-0.9 | 567 | 82.8% | 60.8% [56.8%, 64.8%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 22449 rows (2026-05-16 → 2026-08-03) · Test: 9778 rows (2026-08-04 → 2026-08-22) · split at **2026-08-04**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2545 | 0.7042 | 58.86% |
| market | 0.2414 | 0.6757 | 49.97% |
| platt | 0.2445 | 0.6821 | 49.63% |
| isotonic | 0.2444 | 0.6819 | 49.62% |
| _observed_ | — | — | 49.43% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0100) · still loses to market: **true** (gap +0.0030).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 14252 | 48.96% | 0.2653 | 0.2426 | 14.4pp |
| Low | 13318 | 50.86% | 0.2479 | 0.2405 | 4.5pp |
| Medium | 4657 | 49.65% | 0.2466 | 0.2397 | 8.5pp |