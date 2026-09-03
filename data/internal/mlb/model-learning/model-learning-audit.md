# Model Learning Audit

**Rows:** 37085 decisive · **Dates:** 2026-05-16 → 2026-09-02

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2548 | 0.2413 |
| Log loss ↓ | 0.7057 | 0.6755 |
| Mean predicted | 59.25% | 50.10% |
| Observed | 50.03% | — |

Hit rate **50.03%** (18553/37085), 95% CI [49.52%, 50.54%]. Overconfidence **9.22pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 15118 | 53.66% [52.86%, 54.45%] | 0.2432 | 0.2355 | 6.8pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 13335 | 49.84% [48.99%, 50.69%] | 0.2627 | 0.2475 | 10.0pp |
| `batter_total_bases` | **DISABLED** | 6802 | 42.83% [41.65%, 44.01%] | 0.2604 | 0.2408 | 11.8pp |
| `pitcher_strikeouts` | **RECALIBRATE** | 1830 | 48.20% [45.91%, 50.49%] | 0.2731 | 0.2453 | 14.4pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2432 vs market 0.2355; overconfident by 6.8pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2627 vs market 0.2475; overconfident by 10.0pp
- `batter_total_bases` → **DISABLED**: the 95% interval [41.7%, 44.0%] lies entirely below 50% on n=6802
- `pitcher_strikeouts` → **RECALIBRATE**: Brier 0.2731 vs market 0.2453; overconfident by 14.4pp

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 2 | 25.0% | 100.0% [34.2%, 100.0%] | **yes** |
| 0.3-0.4 | 1813 | 36.5% | 35.8% [33.6%, 38.0%] | no |
| 0.4-0.5 | 5992 | 45.7% | 41.0% [39.7%, 42.2%] | **yes** |
| 0.5-0.6 | 11279 | 55.3% | 47.1% [46.2%, 48.1%] | **yes** |
| 0.6-0.7 | 11334 | 64.9% | 53.9% [53.0%, 54.8%] | **yes** |
| 0.7-0.8 | 5984 | 73.8% | 60.2% [59.0%, 61.5%] | **yes** |
| 0.8-0.9 | 641 | 82.8% | 61.6% [57.8%, 65.3%] | **yes** |
| 0.9-1.0 | 39 | 94.1% | 48.7% [33.9%, 63.8%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 25740 rows (2026-05-16 → 2026-08-09) · Test: 11345 rows (2026-08-10 → 2026-09-02) · split at **2026-08-10**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2533 | 0.7018 | 59.10% |
| market | 0.2415 | 0.6759 | 50.04% |
| platt | 0.2445 | 0.6822 | 49.75% |
| isotonic | 0.2445 | 0.6820 | 49.75% |
| _observed_ | — | — | 50.29% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0088) · still loses to market: **true** (gap +0.0030).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 16389 | 49.25% | 0.2646 | 0.2425 | 14.1pp |
| Low | 15320 | 50.78% | 0.2476 | 0.2405 | 4.5pp |
| Medium | 5376 | 50.26% | 0.2457 | 0.2397 | 7.9pp |