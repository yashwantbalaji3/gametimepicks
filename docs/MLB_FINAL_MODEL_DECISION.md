# MLB Final Model Decision — Program 058–061 Lane C

**Date:** 2026-07-29 · **Protocol:** `docs/experiments/MLB_VARIANCE_FINAL_PREREGISTRATION.md` (committed before the runner and before any scoring — `ecc215fc`)
**Runner:** `app/scripts/mlb-variance-final.mjs` (`npx tsx scripts/mlb-variance-final.mjs`) · guards in `app/src/lib/mlb-variance-final.test.mjs`
**Corpus fingerprint:** `bb7fe616dbec7c08…` (SHA-256, full value in `tmp/mlb-variance-final.json` regeneratable output) · 21,633 rows · 50 dates · 2026-05-16 → 2026-07-27

## Verdict

> **IMPROVES_MODEL_ONLY → the preregistered stopping rule is TRIGGERED.**
> **The independent sportsbook-beating model objective is SUSPENDED.**

The best variance correction, chosen honestly on a validation window and scored once on an untouched test window, repairs a large share of the model's overconfidence and still loses to the de-vigged sportsbook baseline in **every** test sub-window.

## PROVEN

- Windows: train 14,938 (≤ 06-24) · validation 3,721 (07-01→07-11) · untouched test 2,974 (07-21→07-27).
- Validation selected **C2 — per-market variance widening, shrunk toward global** (global k = 2.8; per-market k: hits 1.85, strikeouts 3.31, total bases 3.69, H+R+RBI 3.81). Validation Brier: C2 0.2462 vs C1 0.2473 / C3 0.2470 / C5 0.2463.
- Untouched test: **C2 Brier 0.2462** vs raw model 0.2562 and **market 0.2409**. Sub-windows beating market: **0 of 3**. Leave-one-market-out below market: **no**. Honesty gap: C2 still over-forecasts by 5.04pp on this window (mean predicted 53.73% vs observed 48.69%).
- The hybrid candidate (C4, shrink-toward-market) fitted **w = 0** on train — the third independent time the fitting procedure has assigned the model zero weight next to the market — and scored exactly the market's 0.2409 on test, which by the registration means nothing.
- The framework self-test passed inside the run (synthetic variance defect recovered; noise model refused; genuine signal detected) — the run is valid.

## MEASURED BUT NOT PROVEN

- C5 (variance→Platt) scored 0.2444 on test — numerically the best independent scorer there, and the most honest (mean predicted 50.06%) — but it lost the validation selection by 0.0001 and test numbers cannot re-select a candidate. Its existence does not change the verdict (0.2444 is still > market + 0.0010).

## Per-market decisions (registered mapping, selected candidate on TEST)

| Market | Test n | Sel Brier | Market Brier | Corpus hit (95% CI) | **Decision** |
|---|---|---|---|---|---|
| batter_hits | 1,152 | 0.2377 | 0.2333 | 53.81% [52.78, 54.84] | **RESEARCH_CONTENT_ONLY** |
| batter_hits_runs_rbis | 1,140 | 0.2503 | 0.2469 | 49.64% [48.50, 50.77] | **RESEARCH_CONTENT_ONLY** |
| batter_total_bases | 540 | 0.2543 | 0.2427 | 43.76% [42.25, 45.28] | **DISABLE_PREDICTION** |
| pitcher_strikeouts | 142 | 0.2515 | 0.2477 | 47.82% [44.88, 50.77] | **INSUFFICIENT_EVIDENCE** |

No market earned CONTINUE_R&D.

## What this means (binding, per the registration)

1. **Suspended:** any objective framed as out-predicting the sportsbook with the current MLB simulator. No further backtest-optimization cycles against this corpus.
2. **Retained:** the simulator as *research content* — distributions, calibration curves, per-market variance factors (published as honesty diagnostics), and the disagreement analytics that Lane G builds.
3. **Reopening requires** either a new preregistered protocol on data that does not yet exist, or the live shadow phase reaching the same thresholds forward-only. Nothing in this program deploys a model change; founder review is required for any public probability change.

## HYPOTHESIS (not acted on)

The remaining gap to market (~0.005 Brier after variance repair) is consistent with the market pricing information the simulator's inputs simply do not contain (lineup/matchup/pitch-level context). Closing it would require new information sources, not new calibration — that is an input-data investment decision, not a modeling tweak.

## WALL-CLOCK OBSERVATION

The shadow/live phase can only accumulate rows as future slates settle cleanly (first candidate: 2026-07-30 ET).
