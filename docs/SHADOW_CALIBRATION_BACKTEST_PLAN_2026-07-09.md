# Shadow Calibration Backtest Plan (2026-07-09)

**How we will PROVE the shadow calibration is better before any rollout. No claim of improvement is made
here — this is the design + a feasibility harness that reports honest numbers.**

Money / record / exposure unchanged. Nothing in this plan publishes a calibrated pick.

---

## Why a backtest (not just the audit)

The audit (`audit-mlb-calibration.mjs`) measures the model *in hindsight* on the full settled set. That
can leak: a per-market reliability learned from all 40 dates and then "applied" to those same dates is
circular. A rollout decision needs a **time-aware, walk-forward** test: learn reliability only from the
past, apply it to the next unseen date, and score.

## Splits (no leakage)

Two acceptable designs; the feasibility harness implements the walk-forward one.

1. **Walk-forward (primary).** For each graded date `D` after a minimum history `H`:
   - Train: all rows with `date < D`.
   - Apply: the learned per-market reliability to `D`'s props (blend model→market via `lib/calibration`).
   - Score: `D`'s outcomes. Never touches `date ≥ D`. Aggregate across all `D`.
2. **Fixed holdout (secondary sanity check).** Train first 70% of dates, validate next 15%, holdout
   final 15%. Report holdout only.

Minimum history `H = 10` graded dates before the first scored date (so early reliability isn't noise).

## Metrics (report all; conclude nothing without the numbers)

- **Hit rate** overall, by market, by (learned) shadow tier vs the **current confidence tier** on the
  same props — the head-to-head that matters.
- **Brier score** `mean((p − outcome)²)` for the market baseline, the raw model prob, and the shadow
  calibrated prob. Lower is better; the shadow prob must beat the raw model prob to justify wiring.
- **Reliability curve** — bucket predicted prob into deciles, plot predicted vs realized. A calibrated
  model tracks the diagonal.
- **Sharpness** — spread of predicted probabilities (a calibrated-but-flat model is useless).
- **No-play rate** — fraction the shadow tier declines. A higher no-play rate that *raises* the hit rate
  of what remains is a win (quality over quantity).
- **Coverage** — fraction of props the shadow system can price at all (needs marketProbability).
- **Improvement vs current** — shadow-selected picks' hit rate − current-tier picks' hit rate, on the
  same holdout dates. This is the go/no-go number.

## Go / no-go criteria (proposed, founder-approved)

Wire the shadow calibration into a *shadow column* on live picks (still not public) only if, on the
walk-forward holdout:
1. Shadow Brier ≤ raw-model Brier (calibration doesn't hurt), AND
2. Shadow "lean"+"strong" picks hit ≥ current High-tier picks by a margin that clears a sample-size
   guard (e.g. ≥ +1.5pp on n ≥ 500), AND
3. The reliability curve is visibly closer to the diagonal than the raw model's.

Promote to a *public* recommendation only after a further live shadow period is graded (forward-only,
no hindsight) and reviewed.

## Feasibility harness (shipped, read-only)

`app/scripts/backtest-shadow-calibration.mjs` implements the walk-forward: for each date `D ≥ H`, it
learns per-market reliability from `date < D`, blends `D`'s props, and compares shadow-tier picks vs
current-confidence picks + Brier(market/model/shadow). It writes nothing and claims nothing — it prints
the honest table so the founder can apply the criteria above.

Usage: `npx tsx scripts/backtest-shadow-calibration.mjs`

## Feasibility run (2026-07-09) — encouraging, NOT a rollout decision

First walk-forward run (`H=10`, 30 scored dates, 14,147 decisive props, 100% priceable, no leakage):

| metric | value |
|---|---|
| Brier — market baseline | 0.2423 |
| Brier — raw model | 0.2551 |
| Brier — **shadow** | **0.2462** |
| current High-tier picks hit rate | 49.9% (n=6,433) |
| shadow lean+strong hit rate | **53.1%** (n=4,626) |
| shadow strong-only hit rate | **55.3%** (n=2,183) |
| shadow no-play rate | 39.8% of priceable props |

Read: shadow is better calibrated than the raw model (Brier −0.0089, **criterion 1 met**), and its
surfaced picks out-hit the current High tier by **+3.2pp** on a large holdout (**criterion 2 met on this
window**). The shadow still trails the pure market on Brier — the market is hard to beat — which is
exactly why the blend *anchors* to the market. This is promising but it is a feasibility signal on 30
dates, not the go/no-go: criterion 3 (reliability curve) and a forward-only live shadow period still
gate any public rollout. **No public claim of improved hit rate is made.**

## Data caveats

- Reliability is currently learned at the **market** grain (batter_hits, total_bases, …). Finer grains
  (market×handedness, market×park) need features not yet in the calibration rows.
- 40 graded dates is a modest window; treat single-market conclusions with the sample guards.
- Soccer has **no** settled per-prop ledger yet, so this harness is MLB-only. A soccer version needs the
  soccer settlement→ledger loop (see the multi-sport engine audit).
