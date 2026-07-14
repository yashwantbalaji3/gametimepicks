# Soccer Engine Tuning — Results (2026-07-14)

Tuned the FIFA-Poisson engine against the 2022 WC harness (64 matches), optimizing log loss, guarded by 5-fold
cross-validation and bootstrap confidence intervals. **Blunt conclusion: tuning does not help. Defaults kept.
Engine stays internal.** Money untouched (md5 `affe6b21`).

Scripts: `app/scripts/tune-soccer-engine-2022-wc.mjs` →
`data/internal/world-cup/projection-engine/tuning/2022-wc-grid-search.json` + `.../backtests/2022-wc-tuned.json`
(both `public:false`, `internalOnly:true`).

## Comparison table (N=64, full sample)
| Config | log loss ↓ | Brier ↓ | RPS ↓ | top-pick | draw pred/act |
|---|---|---|---|---|---|
| **Untuned (default)** | 1.0025 | 0.5925 | 0.208 | 56.3% | 0.250 / 0.234 |
| Best 3-D grid (sup 0.0045, base 2.9, draw 1.05) | 1.0003 | 0.5881 | — | 56.3% | 0.237 / 0.234 |
| Best 1-D supremacy (0.0040) | 1.0011 | 0.5893 | — | 56.3% | 0.246 / 0.234 |
| Uniform | 1.0986 | 0.6667 | 0.239 | — | — |
| FIFA-favorite | — | — | — | 56.3% | — |

The full-sample "best" improves log loss by a trivial **0.0022** and Brier by 0.0044. Then the guards kill it:

## Guard 1 — 5-fold cross-validation: the tuning OVERFITS
Select the best config on 4 train folds, score on the held-out fold:
| | tuned (CV test) | untuned (CV test) | improvement |
|---|---|---|---|
| 3-D grid | 1.0387 | 1.0012 | **−0.0375 (worse)** |
| 1-D supremacy | 1.0364 | 1.0012 | **−0.0352 (worse)** |

Out-of-sample, the tuned config is **worse** than leaving the default alone. Both the 3-D grid and even the
single-parameter tune overfit 64 matches.

## Guard 2 — bootstrap CI: the gain is noise
2000 resamples of the (untuned − tuned) log-loss gain: **95% CI [−0.018, +0.021], median +0.003.** The interval
straddles 0. The full-sample improvement is not distinguishable from noise.

## Why supremacy tuning can't fix winner-picking (structural)
The 1-D sweep shows top-pick accuracy is **56.3% at every supremacy value** (0.0015 → 0.0065). Scaling supremacy
changes confidence, never the argmax favorite — so it is **mathematically impossible** to beat the FIFA-favorite
top-pick baseline by tuning this parameter. The log-loss curve is a shallow U with its minimum at ~0.0040, so the
current default 0.0035 is already essentially optimal:

```
sup 0.0025  logLoss 1.0125
sup 0.0035  logLoss 1.0025   <- current default
sup 0.0040  logLoss 1.0011   <- in-sample optimum (gain 0.0014, does not survive CV)
sup 0.0050  logLoss 1.0069
sup 0.0065  logLoss 1.0451
```

## The favorite under-confidence is real but not tunably fixable here
Higher supremacy does sharpen favorites (Brier keeps falling to ~0.005, draw pred drops toward the actual 0.234),
but log loss punishes the extra confidence on the tournament's upsets (Saudi/Morocco/Cameroon), so the net is a
wash — and it doesn't generalize. Fixing this properly needs more data and/or a real feature (form, xG), not a
global coefficient nudge on 64 matches.

## Decision
- **Keep engine defaults unchanged** (`supremacyPerFifaPoint 0.0035`, `baseTotalGoals 2.6`, `drawInflation 1.0`).
- The tuned config is recorded for reference only (`2022-wc-tuned.json`, `tunedRefOnly` in the semis diagnostic),
  explicitly **not adopted**.
- Engine remains **internal, not public-ready**. `verdict.publicReady:false`.

## What would actually move the needle (in priority order)
1. A **market baseline** (odds history) — the real bar. See `SOCCER_ODDS_HISTORY_PROVIDER_SCOPE.md`.
2. A larger backtest set (more tournaments) so tuning can generalize.
3. A real predictive **feature** beyond ratings (recent form, xG) — the jump from rating-Poisson to a model.
