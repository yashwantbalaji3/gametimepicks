# Model Learning Audit

**Rows:** 37374 decisive · **Dates:** 2026-05-16 → 2026-09-03

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2547 | 0.2413 |
| Log loss ↓ | 0.7055 | 0.6755 |
| Mean predicted | 59.26% | 50.10% |
| Observed | 50.07% | — |

Hit rate **50.07%** (18715/37374), 95% CI [49.57%, 50.58%]. Overconfidence **9.18pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 15233 | 53.71% [52.92%, 54.50%] | 0.2430 | 0.2355 | 6.7pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 13450 | 49.87% [49.02%, 50.71%] | 0.2626 | 0.2475 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 6846 | 42.87% [41.70%, 44.05%] | 0.2604 | 0.2409 | 11.7pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1845 | 48.29% [46.02%, 50.57%] | 0.2728 | 0.2453 | 14.3pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2430 vs market 0.2355; overconfident by 6.7pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2626 vs market 0.2475; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.7%, 44.0%] lies entirely below 50% on n=6846
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2728 vs market 0.2453; overconfident by 14.3pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1827 | 36.5% | 35.8% [33.6%, 38.0%] | no |
| 0.4-0.5 | 6026 | 45.7% | 41.1% [39.8%, 42.3%] | **yes** |
| 0.5-0.6 | 11370 | 55.3% | 47.2% [46.2%, 48.1%] | **yes** |
| 0.6-0.7 | 11425 | 64.9% | 54.0% [53.0%, 54.9%] | **yes** |
| 0.7-0.8 | 6036 | 73.8% | 60.3% [59.0%, 61.5%] | **yes** |
| 0.8-0.9 | 648 | 82.7% | 61.7% [57.9%, 65.4%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 26129 rows (2026-05-16 → 2026-08-10) · Test: 11245 rows (2026-08-11 → 2026-09-03) · split at **2026-08-11**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2527 | 0.7005 | 59.16% |
| market | 0.2412 | 0.6753 | 50.07% |
| platt | 0.2443 | 0.6817 | 49.80% |
| isotonic | 0.2442 | 0.6813 | 49.80% |
| _observed_ | — | — | 50.44% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0086) · still loses to market: **true** (gap +0.0030).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 16537 | 49.30% | 0.2644 | 0.2425 | 14.1pp |
| Low | 15429 | 50.85% | 0.2475 | 0.2405 | 4.4pp |
| Medium | 5408 | 50.22% | 0.2458 | 0.2397 | 7.9pp |