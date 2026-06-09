# MLB hit-rate improvement plan (ranked, backtest-gated)

Each item: benefit · difficulty · data need · overfit risk · how to backtest ·
PR-now / later / research. Nothing shipped here.

## A. Selection-only (no new data) — PR NOW (PR B)
- **No plus-money in Low/Bank** — benefit med (plus-money 35%) · easy · none · low
  · simulator odds-band policy · PR now.
- **Hard exposure caps** (≤1 restricted leg/card, ≤2 cards per player-market,
  same-game cap) — benefit med (cuts correlated blow-ups) · easy · none · low ·
  simulator exposure-caps policy · PR now.
- **Reliability reranking** (rank by recent10-L10 + odds, not edge) — benefit med
  (revived dead lanes 0%→13% in sim) · med · none · low · simulator · PR now.
- **Fewer/empty tiers when thin** — benefit (quality>volume) · easy · none · none ·
  coverage report · PR now.

## B. Feature engineering on existing data — PR LATER (PR C)
- **Shrink recent form to season baseline** (Bayesian/James-Stein) — benefit med-high
  (reduces L10 overfit) · med · none · med · walk-forward projection accuracy.
- **Opposing-pitcher proxy** (probable pitcher's own K/hits-allowed from his game
  logs — already fetched for Ks) — benefit high · med · none-new · med · backtest
  vs settled.
- **Miss-margin-aware calibration** + per-market error distributions — benefit med
  · med · settled history · med · Brier score.
- **Team implied run total from odds** (de-vig moneyline/total) — benefit med ·
  med · odds (have it) · low · backtest.

## C. New data inputs — RESEARCH → PR E
Confirmed lineups + batting order (PA expectation), handedness/platoon splits,
K/contact/ISO rates, park factor, weather/wind. Benefit high; difficulty high;
needs new providers (MLB Stats lineups are free; Savant for rates; a weather/park
source). Overfit risk med. Backtest: walk-forward with/without each feature.

## D. Modeling upgrades — RESEARCH
Per-market calibrated probability (logistic / gradient-boosted / quantile for
total_bases & Ks), Bayesian hierarchical shrinkage (player/market/team),
simulation-based probability instead of projection-gap, calibration curves +
Brier + walk-forward. High benefit, high difficulty, high overfit risk → build a
backtest harness first; gate every change on out-of-sample calibration.

## E. Learning-loop upgrades — PR LATER
Apply learned exposure caps + odds-band thresholds + player-market cooldowns;
automatic downgrade on drift; human-approved upgrades only after sample threshold;
drift alerts when published leg-rate falls below universe baseline.

## Recommended PR order
1. **PR A** — this docs set.
2. **PR B** — selection-only (exposure caps + no-plus-money Low/Bank +
   reliability reranking). Simulator-backed, low risk.
3. **PR C** — recent-form shrinkage + opposing-pitcher proxy. Backtest-gated.
4. **PR D** — per-market calibration (after a backtest harness).
5. **PR E** — lineup/handedness/park/weather data integration.
