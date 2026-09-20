# Model Learning Audit

**Rows:** 45021 decisive · **Dates:** 2026-05-16 → 2026-09-19

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2541 | 0.2413 |
| Log loss ↓ | 0.7041 | 0.6755 |
| Mean predicted | 59.33% | 50.12% |
| Observed | 50.28% | — |

Hit rate **50.28%** (22638/45021), 95% CI [49.82%, 50.75%]. Overconfidence **9.05pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 18267 | 54.02% [53.30%, 54.74%] | 0.2425 | 0.2354 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 16475 | 49.95% [49.19%, 50.71%] | 0.2619 | 0.2472 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 8050 | 43.01% [41.93%, 44.09%] | 0.2597 | 0.2411 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2229 | 48.41% [46.34%, 50.48%] | 0.2720 | 0.2454 | 14.3pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2425 vs market 0.2354; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2619 vs market 0.2472; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.1%] lies entirely below 50% on n=8050
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2720 vs market 0.2454; overconfident by 14.3pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2147 | 36.5% | 35.6% [33.6%, 37.7%] | no |
| 0.4-0.5 | 7156 | 45.7% | 41.5% [40.3%, 42.6%] | **yes** |
| 0.5-0.6 | 13728 | 55.3% | 47.0% [46.2%, 47.9%] | **yes** |
| 0.6-0.7 | 13850 | 64.9% | 54.1% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 7306 | 73.8% | 60.8% [59.6%, 61.9%] | **yes** |
| 0.8-0.9 | 788 | 82.7% | 62.8% [59.4%, 66.1%] | **yes** |
| 0.9-1.0 | 42 | 93.9% | 50.0% [35.5%, 64.5%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 31103 rows (2026-05-16 → 2026-08-20) · Test: 13918 rows (2026-08-21 → 2026-09-19) · split at **2026-08-21**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2509 | 0.6965 | 59.47% |
| market | 0.2413 | 0.6756 | 50.15% |
| platt | 0.2440 | 0.6810 | 49.86% |
| isotonic | 0.2439 | 0.6808 | 49.85% |
| _observed_ | — | — | 51.45% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0070) · still loses to market: **true** (gap +0.0025).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 20076 | 49.59% | 0.2636 | 0.2425 | 13.8pp |
| Low | 18474 | 51.00% | 0.2469 | 0.2404 | 4.3pp |
| Medium | 6471 | 50.39% | 0.2454 | 0.2396 | 7.7pp |