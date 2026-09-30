# Model Learning Audit

**Rows:** 48597 decisive · **Dates:** 2026-05-16 → 2026-09-29

## Overall

| Measure | Model | Market (de-vigged) |
|---|---|---|
| Brier ↓ | 0.2544 | 0.2414 |
| Log loss ↓ | 0.7048 | 0.6757 |
| Mean predicted | 59.42% | 50.14% |
| Observed | 50.32% | — |

Hit rate **50.32%** (24454/48597), 95% CI [49.88%, 50.76%]. Overconfidence **9.10pp**.

## Market registry

| Market | Status | n | Hit rate (95% CI) | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|---|
| `batter_hits` | **RECALIBRATE** | 19720 | 54.14% [53.44%, 54.83%] | 0.2429 | 0.2357 | 6.5pp |
| `batter_hits_runs_rbis` | **RECALIBRATE** | 17914 | 49.90% [49.17%, 50.63%] | 0.2621 | 0.2472 | 10.1pp |
| `batter_total_bases` | **DISABLED** | 8555 | 43.06% [42.02%, 44.11%] | 0.2595 | 0.2411 | 11.4pp |
| `pitcher_strikeouts` | **DISABLED** | 2408 | 47.97% [45.97%, 49.96%] | 0.2738 | 0.2458 | 14.8pp |

- `batter_hits` → **RECALIBRATE**: Brier 0.2429 vs market 0.2357; overconfident by 6.5pp
- `batter_hits_runs_rbis` → **RECALIBRATE**: Brier 0.2621 vs market 0.2472; overconfident by 10.1pp
- `batter_total_bases` → **DISABLED**: the 95% interval [42.0%, 44.1%] lies entirely below 50% on n=8555
- `pitcher_strikeouts` → **DISABLED**: the 95% interval [46.0%, 50.0%] lies entirely below 50% on n=2408

## Calibration curve (model)

| Bucket | n | Mean predicted | Observed (95% CI) | Miscalibrated? |
|---|---|---|---|---|
| 0.1-0.2 | 1 | 17.0% | 100.0% [20.7%, 100.0%] | **yes** |
| 0.2-0.3 | 3 | 26.6% | 100.0% [43.8%, 100.0%] | **yes** |
| 0.3-0.4 | 2258 | 36.5% | 35.7% [33.8%, 37.7%] | no |
| 0.4-0.5 | 7659 | 45.7% | 41.5% [40.4%, 42.6%] | **yes** |
| 0.5-0.6 | 14774 | 55.3% | 47.0% [46.2%, 47.8%] | **yes** |
| 0.6-0.7 | 15062 | 64.9% | 54.2% [53.4%, 55.0%] | **yes** |
| 0.7-0.8 | 7943 | 73.9% | 60.5% [59.4%, 61.6%] | **yes** |
| 0.8-0.9 | 853 | 82.7% | 62.1% [58.8%, 65.3%] | **yes** |
| 0.9-1.0 | 44 | 93.9% | 50.0% [35.8%, 64.2%] | **yes** |

## Calibration backtest — fitted on the past, scored on the future

Train: 33687 rows (2026-05-16 → 2026-08-25) · Test: 14910 rows (2026-08-26 → 2026-09-29) · split at **2026-08-26**

| Scorer | Brier ↓ | Log loss ↓ | Mean predicted |
|---|---|---|---|
| rawModel | 0.2524 | 0.7001 | 59.67% |
| market | 0.2418 | 0.6765 | 50.20% |
| platt | 0.2446 | 0.6823 | 50.08% |
| isotonic | 0.2446 | 0.6822 | 50.08% |
| _observed_ | — | — | 51.33% |

**ADOPT isotonic for honesty of stated probabilities; it improves out-of-sample but still does not out-score the de-vigged market, so it fixes the claim, not the capability**

Best calibrator: `isotonic` · improves on raw model: **true** (Brier −0.0079) · still loses to market: **true** (gap +0.0028).

## By descriptive category

| Category | n | Hit rate | Model Brier | Market Brier | Overconfidence |
|---|---|---|---|---|---|
| High | 21852 | 49.57% | 0.2641 | 0.2429 | 13.9pp |
| Low | 19794 | 51.05% | 0.2471 | 0.2405 | 4.3pp |
| Medium | 6951 | 50.61% | 0.2448 | 0.2393 | 7.6pp |