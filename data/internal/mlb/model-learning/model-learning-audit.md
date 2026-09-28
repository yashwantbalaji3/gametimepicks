# Model Learning Audit

**Rows:** 48449 decisive · **Dates:** 2026-05-16 → 2026-09-27

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2543 | 0.2414 |
| Log loss ↓ | 0.7046 | 0.6757 |
| Mean predicted | 59.40% | 50.14% |
| Observed | 50.34% | — |

Hit rate **50.34%** (24390/48449), 95% CI [49.90%, 50.79%]. Overconfidence **9.06pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 19654 | 54.17% [53.47%, 54.86%] | 0.2428 | 0.2357 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 17848 | 49.92% [49.19%, 50.66%] | 0.2619 | 0.2471 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 8544 | 43.08% [42.04%, 44.14%] | 0.2594 | 0.2411 | 11.4pp |
| `pitcher_strikeouts` | **DISABLED** | 2403 | 47.98% [45.99%, 49.98%] | 0.2738 | 0.2458 | 14.8pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2428 vs market 0.2357; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2619 vs market 0.2471; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.1%] lies entirely below 50% on n=8544
- `pitcher_strikeouts` → **DISABLED**: the 95% interval [46.0%, 50.0%] lies entirely below 50% on n=2403

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2257 | 36.5% | 35.7% [33.8%, 37.7%] | no |
| 0.4-0.5 | 7652 | 45.7% | 41.5% [40.4%, 42.6%] | **yes** |
| 0.5-0.6 | 14740 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 14998 | 64.9% | 54.3% [53.5%, 55.1%] | **yes** |
| 0.7-0.8 | 7907 | 73.9% | 60.6% [59.5%, 61.6%] | **yes** |
| 0.8-0.9 | 847 | 82.7% | 62.1% [58.8%, 65.3%] | **yes** |
| 0.9-1.0 | 44 | 93.9% | 50.0% [35.8%, 64.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 33687 rows (2026-05-16 → 2026-08-25) · Test: 14762 rows (2026-08-26 → 2026-09-27) · split at **2026-08-26**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2521 | 0.6994 | 59.62% |
| market | 0.2417 | 0.6764 | 50.19% |
| platt | 0.2445 | 0.6822 | 50.05% |
| isotonic | 0.2445 | 0.6821 | 50.05% |
| _observed_ | — | — | 51.41% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0076) · still loses to market: **true** (gap +0.0028).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 21750 | 49.61% | 0.2639 | 0.2428 | 13.8pp |
| Low | 19767 | 51.05% | 0.2471 | 0.2405 | 4.3pp |
| Medium | 6932 | 50.61% | 0.2448 | 0.2392 | 7.6pp |