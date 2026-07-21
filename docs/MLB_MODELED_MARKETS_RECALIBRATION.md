# MLB modeled-markets recalibration — out-of-sample validation (2026-07-21)

## Executive result

**No market beat the de-vigged market out of sample. No market earns `PUBLIC_MODEL_OK`. Nothing is restored.**

Recalibration **fixed the raw model's overconfidence** (calibration slope moved from ~0.20–0.61 toward ~1.0) — but that only made the recalibrated probabilities *approach* the market; it did **not** add predictive value beyond the market. Walk-forward method selection chose **market-only (w=0)** for two markets, a near-market blend (w=0.1) for one, and a blend with a **negative** model-disagreement weight (the model's disagreement is anti-predictive) for the fourth. On the frozen final holdout, none beats the market on Brier or log loss.

| Question | Answer |
|---|---|
| Did any market beat the market out of sample? | **No** |
| Selected method (per market) | K: market-only (w=0) · hits: shrink w=0.1 · TB: market-only (w=0) · H+R+RBI: market/model blend (cDisagree=−0.07) |
| Did the selected method use nonzero model contribution? | Effectively no — market-dominated or market-only; the one nonzero blend leans *against* the model |
| Any `PUBLIC_MODEL_OK`? | **None** |
| Any market eligible even for a later founder-reviewed production wiring? | **None** |

## Data protocol (declared before fitting)

- **43 settled dates**, 2026-05-16 → 2026-07-11. Selection region = first 34 dates; **final holdout = last 9 dates (2026-07-02 → 07-11), frozen before tuning.**
- **Method + hyperparameter selection**: expanding-window **walk-forward over the selection region only** (initial window 15 dates). The frozen selected method is refit on all 34 selection dates and applied **once** to the untouched holdout.
- **Join**: settled_leans (official box-score `actual`/`outcome`) ⋈ pregame board archives (model prob + de-vigged market prob) by `id`. **0 duplicates · 0 unmatched · 0 projection-leakage failures.** A hard walk-forward assert rejects any training row dated ≥ the prediction date.
- **De-vig**: proportional — `impliedLean / (impliedOver + impliedUnder)`. Probabilities clipped to `[1e-6, 1−1e-6]` for numerical stability only.
- **Uncertainty**: date-clustered bootstrap (2,000 iterations, resampling dates) on (recalibrated − market) for both Brier and log loss.

## Results by market (final holdout)

| Market | holdout n | Brier recal | Brier market | Brier raw | ΔBrier vs mkt (95% CI) | LogLoss recal | LogLoss market | ΔLL vs mkt | selected | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| `pitcher_strikeouts` | 197 | 0.2458 | 0.2458 | 0.2639 | 0 [0, 0] | 0.6847 | 0.6847 | 0 | market-only (w=0) | **INSUFFICIENT_OUT_OF_SAMPLE_DATA** (197 < 500) |
| `batter_hits` | 1,474 | 0.2371 | 0.2370 | 0.2437 | +0.0001 [−0.0004, +0.0004] | 0.6669 | 0.6668 | +0.0001 | shrink w=0.1 | **MARKET_CONTEXT_ONLY** |
| `batter_total_bases` | 670 | 0.2397 | 0.2397 | 0.2596 | 0 [0, 0] | 0.6723 | 0.6723 | 0 | market-only (w=0) | **MARKET_CONTEXT_ONLY** |
| `batter_hits_runs_rbis` | 943 | 0.2468 | 0.2464 | 0.2663 | +0.0004 [−0.0011, +0.0015] | 0.6866 | 0.6858 | +0.0008 | blend (cDisagree=−0.07) | **MARKET_CONTEXT_ONLY** |

Every "Δ vs market" is ≥ 0 (the market wins or ties) and every confidence interval straddles or sits at 0 — no credible improvement.

## Calibration mechanism (where the repair came from)

The recalibration improved probability quality **by relying almost entirely on the market probability** (and, for H+R+RBI, by *reversing* the model's anti-predictive disagreement). The raw model's overconfidence — calibration slopes of 0.50 (K), 0.61 (hits), 0.38 (TB), 0.21 (H+R+RBI) — was corrected to ~0.86–1.28, but the correction is "become the market," not "add signal." A fixed-shrinkage grid that *includes* w=0 (market-only) selecting w=0 is the cleanest possible statement that the model adds no validated probability value.

## Product implications

- **Bank Builder: paper / review only.** **Moonshot: paper / review only.** Money, record, crown, exposure unchanged.
- **Validated modeled legs available: 0.** Under the centralized eligibility policy (`src/lib/mlb/calibration/eligibility-policy.ts`), only `PUBLIC_MODEL_OK` unlocks product eligibility; no market qualifies.
- **Every current active BB / Moonshot candidate leg uses a failed market** (Lane A/B: pitcher_strikeouts + batter_total_bases; Moonshot: pitcher_strikeouts) — all remain flagged, not validated advantages.
- **No money or exposure changed.** No card was created, settled, or rewritten. No public UI changed.

## Honest negative result

**Recalibration improved the raw model's probability quality but did not establish incremental predictive value beyond the market. All four markets remain market-context-only and ineligible as modeled Bank Builder or Moonshot legs. The de-vigged market remains the best probability model for all four markets.**

## Artifacts (internal, `public:false`, never served)

`data/internal/mlb/calibration/` — protocol.json · candidate-results.json · final-holdout-results.json · robustness-results.json · selected-calibrators.json (`approvedForProduction: false`). Harness: `app/scripts/recalibrate-mlb-modeled-markets.mjs`. Guards: `app/src/lib/mlb-recalibration-guards.test.mjs`.

## Founder decision required

None is forced. The market wins. If desired later: gather more data (K needs ≥ 500 holdout obs), or pursue a genuinely different model input the market lacks (confirmed lineups, bullpen leverage plan) — but the current recalibration result says the *existing* projection model has no validated edge to recover. Restoring any market to product eligibility requires flipping it to `PUBLIC_MODEL_OK` in the policy **and** a separate founder-approved production mission — never automatic.
