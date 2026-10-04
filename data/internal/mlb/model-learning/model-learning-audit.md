# Model Learning Audit

**Rows:** 48925 decisive · **Dates:** 2026-05-16 → 2026-10-03

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2546 | 0.2414 |
| Log loss ↓ | 0.7051 | 0.6758 |
| Mean predicted | 59.44% | 50.15% |
| Observed | 50.31% | — |

Hit rate **50.31%** (24612/48925), 95% CI [49.86%, 50.75%]. Overconfidence **9.13pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 19865 | 54.12% [53.42%, 54.81%] | 0.2431 | 0.2358 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 18051 | 49.87% [49.14%, 50.60%] | 0.2622 | 0.2472 | 10.2pp |
| `batter_total_bases` | **DISABLED** | 8586 | 43.06% [42.01%, 44.11%] | 0.2595 | 0.2412 | 11.4pp |
| `pitcher_strikeouts` | **DISABLED** | 2423 | 48.00% [46.01%, 49.99%] | 0.2737 | 0.2458 | 14.7pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2431 vs market 0.2358; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2622 vs market 0.2472; overconfident by 10.2pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.1%] lies entirely below 50% on n=8586
- `pitcher_strikeouts` → **DISABLED**: the 95% interval [46.0%, 50.0%] lies entirely below 50% on n=2423

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2263 | 36.5% | 35.7% [33.7%, 37.7%] | no |
| 0.4-0.5 | 7688 | 45.7% | 41.4% [40.3%, 42.5%] | **yes** |
| 0.5-0.6 | 14860 | 55.3% | 47.1% [46.3%, 47.9%] | **yes** |
| 0.6-0.7 | 15182 | 64.9% | 54.2% [53.4%, 55.0%] | **yes** |
| 0.7-0.8 | 8018 | 73.9% | 60.4% [59.3%, 61.4%] | **yes** |
| 0.8-0.9 | 866 | 82.7% | 62.1% [58.8%, 65.3%] | **yes** |
| 0.9-1.0 | 44 | 93.9% | 50.0% [35.8%, 64.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 33687 rows (2026-05-16 → 2026-08-25) · Test: 15238 rows (2026-08-26 → 2026-10-03) · split at **2026-08-26**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2530 | 0.7012 | 59.74% |
| market | 0.2419 | 0.6767 | 50.22% |
| platt | 0.2448 | 0.6826 | 50.12% |
| isotonic | 0.2448 | 0.6826 | 50.13% |
| _observed_ | — | — | 51.26% |

**ADOPT platt for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `platt` · improves on raw model: **true** (Brier −0.0082) · still loses to market: **true** (gap +0.0029).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 22033 | 49.53% | 0.2644 | 0.2430 | 14.0pp |
| Low | 19900 | 51.08% | 0.2471 | 0.2405 | 4.3pp |
| Medium | 6992 | 50.56% | 0.2449 | 0.2393 | 7.6pp |