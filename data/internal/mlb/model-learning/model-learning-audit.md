# Model Learning Audit

**Rows:** 40444 decisive · **Dates:** 2026-05-16 → 2026-09-10

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2548 | 0.2413 |
| Log loss ↓ | 0.7056 | 0.6755 |
| Mean predicted | 59.30% | 50.12% |
| Observed | 50.06% | — |

Hit rate **50.06%** (20248/40444), 95% CI [49.58%, 50.55%]. Overconfidence **9.24pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 16453 | 53.73% [52.97%, 54.49%] | 0.2431 | 0.2355 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 14671 | 49.78% [48.97%, 50.59%] | 0.2628 | 0.2473 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 7322 | 42.91% [41.78%, 44.05%] | 0.2602 | 0.2411 | 11.6pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1998 | 48.20% [46.01%, 50.39%] | 0.2726 | 0.2451 | 14.6pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2431 vs market 0.2355; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2628 vs market 0.2473; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.8%, 44.0%] lies entirely below 50% on n=7322
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2726 vs market 0.2451; overconfident by 14.6pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1957 | 36.5% | 35.6% [33.5%, 37.8%] | no |
| 0.4-0.5 | 6458 | 45.7% | 41.3% [40.1%, 42.5%] | **yes** |
| 0.5-0.6 | 12332 | 55.3% | 46.9% [46.0%, 47.8%] | **yes** |
| 0.6-0.7 | 12400 | 64.9% | 53.9% [53.1%, 54.8%] | **yes** |
| 0.7-0.8 | 6545 | 73.8% | 60.3% [59.1%, 61.5%] | **yes** |
| 0.8-0.9 | 710 | 82.7% | 62.4% [58.8%, 65.9%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 28161 rows (2026-05-16 → 2026-08-14) · Test: 12283 rows (2026-08-15 → 2026-09-10) · split at **2026-08-15**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2525 | 0.7001 | 59.39% |
| market | 0.2410 | 0.6749 | 50.19% |
| platt | 0.2443 | 0.6817 | 49.81% |
| isotonic | 0.2443 | 0.6817 | 49.81% |
| _observed_ | — | — | 50.77% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0082) · still loses to market: **true** (gap +0.0033).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 17941 | 49.27% | 0.2646 | 0.2426 | 14.1pp |
| Low | 16648 | 50.91% | 0.2473 | 0.2404 | 4.4pp |
| Medium | 5855 | 50.09% | 0.2460 | 0.2397 | 8.0pp |