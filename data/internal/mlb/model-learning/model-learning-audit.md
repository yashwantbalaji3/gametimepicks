# Model Learning Audit

**Rows:** 46169 decisive · **Dates:** 2026-05-16 → 2026-09-22

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2543 | 0.2413 |
| Log loss ↓ | 0.7045 | 0.6755 |
| Mean predicted | 59.35% | 50.12% |
| Observed | 50.26% | — |

Hit rate **50.26%** (23205/46169), 95% CI [49.80%, 50.72%]. Overconfidence **9.09pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 18717 | 54.08% [53.36%, 54.79%] | 0.2427 | 0.2356 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 16925 | 49.82% [49.07%, 50.57%] | 0.2622 | 0.2471 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 8239 | 43.01% [41.95%, 44.09%] | 0.2596 | 0.2411 | 11.5pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 2288 | 48.38% [46.34%, 50.43%] | 0.2723 | 0.2455 | 14.3pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2427 vs market 0.2356; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2622 vs market 0.2471; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.9%, 44.1%] lies entirely below 50% on n=8239
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2723 vs market 0.2455; overconfident by 14.3pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2182 | 36.5% | 35.8% [33.8%, 37.8%] | no |
| 0.4-0.5 | 7336 | 45.7% | 41.5% [40.4%, 42.7%] | **yes** |
| 0.5-0.6 | 14063 | 55.2% | 46.9% [46.1%, 47.7%] | **yes** |
| 0.6-0.7 | 14227 | 64.9% | 54.1% [53.2%, 54.9%] | **yes** |
| 0.7-0.8 | 7503 | 73.9% | 60.7% [59.6%, 61.8%] | **yes** |
| 0.8-0.9 | 811 | 82.7% | 62.6% [59.3%, 65.9%] | **yes** |
| 0.9-1.0 | 43 | 93.9% | 51.2% [36.8%, 65.4%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 32227 rows (2026-05-16 → 2026-08-22) · Test: 13942 rows (2026-08-23 → 2026-09-22) · split at **2026-08-23**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2517 | 0.6983 | 59.47% |
| market | 0.2412 | 0.6754 | 50.13% |
| platt | 0.2442 | 0.6814 | 49.93% |
| isotonic | 0.2441 | 0.6812 | 49.92% |
| _observed_ | — | — | 51.22% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0076) · still loses to market: **true** (gap +0.0029).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 20612 | 49.51% | 0.2639 | 0.2426 | 13.9pp |
| Low | 18932 | 51.01% | 0.2470 | 0.2405 | 4.4pp |
| Medium | 6625 | 50.43% | 0.2454 | 0.2395 | 7.7pp |