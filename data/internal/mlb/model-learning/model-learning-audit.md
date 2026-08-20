# Model Learning Audit

**Rows:** 30226 decisive · **Dates:** 2026-05-16 → 2026-08-18

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2554 | 0.2412 |
| Log loss ↓ | 0.7071 | 0.6753 |
| Mean predicted | 59.26% | 50.09% |
| Observed | 49.81% | — |

Hit rate **49.81%** (15057/30226), 95% CI [49.25%, 50.38%]. Overconfidence **9.45pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 12406 | 53.65% [52.77%, 54.53%] | 0.2432 | 0.2354 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 10621 | 49.47% [48.52%, 50.42%] | 0.2635 | 0.2476 | 10.4pp |
| `batter_total_bases` | **DISABLED** | 5687 | 42.69% [41.41%, 43.98%] | 0.2616 | 0.2407 | 12.1pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1512 | 47.55% [45.05%, 50.07%] | 0.2746 | 0.2449 | 15.1pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2432 vs market 0.2354; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2635 vs market 0.2476; overconfident by 10.4pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.4%, 44.0%] lies entirely below 50% on n=5687
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2746 vs market 0.2449; overconfident by 15.1pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1489 | 36.5% | 36.1% [33.7%, 38.6%] | no |
| 0.4-0.5 | 4909 | 45.7% | 41.1% [39.7%, 42.5%] | **yes** |
| 0.5-0.6 | 9177 | 55.2% | 46.6% [45.6%, 47.6%] | **yes** |
| 0.6-0.7 | 9142 | 64.9% | 53.9% [52.9%, 54.9%] | **yes** |
| 0.7-0.8 | 4941 | 73.9% | 59.9% [58.5%, 61.2%] | **yes** |
| 0.8-0.9 | 527 | 82.8% | 60.5% [56.3%, 64.6%] | **yes** |
| 0.9-1.0 | 38 | 94.2% | 50.0% [34.8%, 65.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 20598 rows (2026-05-16 → 2026-07-25) · Test: 9628 rows (2026-07-26 → 2026-08-18) · split at **2026-07-26**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2545 | 0.7042 | 58.72% |
| market | 0.2407 | 0.6743 | 49.96% |
| platt | 0.2442 | 0.6815 | 49.72% |
| isotonic | 0.2441 | 0.6813 | 49.72% |
| _observed_ | — | — | 48.97% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0104) · still loses to market: **true** (gap +0.0034).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 13309 | 48.89% | 0.2653 | 0.2424 | 14.4pp |
| Low | 12533 | 50.83% | 0.2482 | 0.2405 | 4.5pp |
| Medium | 4384 | 49.70% | 0.2459 | 0.2392 | 8.4pp |