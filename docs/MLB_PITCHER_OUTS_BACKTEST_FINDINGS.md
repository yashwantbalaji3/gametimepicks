# MLB `pitcher_outs` — model backtest & public-gate decision (2026-07-21)

**Verdict: `pitcher_outs` does NOT graduate to a public modeled market. It stays market-context-only.**

The candidate recency-form model does not beat the sportsbook market on calibration, so — per the honesty gate — it is not published as a prediction. Money untouched; md5 `affe6b21071f2b3be96bb2774eb347c3`.

## What was built (leakage-safe, self-contained)

`app/scripts/backtest-mlb-pitcher-outs.mjs` — a reproducible backtest:
- **Lines:** 17 settled `player-props/<date>.json` archives (Jun 23 – Jul 11), pitcher_outs "Over" lines. Market prob = raw over-implied prob de-vigged with the standard ~4.5% hold.
- **Outcomes + model inputs:** official StatsAPI `people/<id>/stats?stats=gameLog` (2026, pitching). Outs = innings-pitched × 3. **Strictly-earlier starts only** for the projection (a hard leakage guard asserts no prior start is dated ≥ the game date).
- **Candidate model:** `projection = shrink(recency-weighted mean of prior-start outs, league prior)`, `sigma = max(sd(prior), floor)`, `modelProbOver = P(N(projection, sigma) > line)`.
- Report: `data/internal/mlb/reference/mlb-pitcher-outs-backtest.json` (`public:false`, never web-served).

## Results (n = 255 settled starts, 10 name-misses, over-rate 51.0%)

| Metric | Model | Market | Winner |
|---|---|---|---|
| Brier | **0.2625** | **0.2470** | Market |
| Log loss | **0.7194** | **0.6871** | Market |
| MAE (proj vs actual outs) | 2.67 outs | — | — |

- The model's Brier (0.2625) is **worse than a no-skill 50% baseline** (0.25 at a 51% over-rate); the market (0.2470) is **better** than the baseline — i.e., the market has real skill on outs and the model has none.
- **Calibration curve shows near-zero discrimination:** predicted 35%→actual 53%, predicted 45%→actual 57%, predicted 54%→actual 46%, predicted 64%→actual 50%. The model's probabilities do not track the empirical over-rate.
- **Leakage guard: PASS** (0 failures — every projection used only strictly-earlier starts).

## Robustness (so the negative result isn't one arbitrary tuning)

A 12-variant sweep (`decay ∈ {0.7, 0.85, 1.0}` × `priorK ∈ {0, 2, 4}` × `sigmaFloor ∈ {3.0, 4.0, 5.5}`), re-scored on the same rows: **none beat the market on both Brier and log loss.** The best variant (heavily shrunk toward the league prior, wide sigma) reached Brier 0.2553 — still worse than the market's 0.2470.

## Why (the honest read)

Outs recorded is dominated by **manager pull decisions, pitch-count limits, and in-game leverage** — not by the pitcher's recent innings alone. The sportsbook line already prices the bullpen plan and matchup, so a recent-form projection has no edge. This is the market being efficient, not a bug in the model.

## Decision & consequences

- `pitcher_outs` remains **market context only — not simulated, not product-eligible.** This matches (and now *validates* with evidence) the coverage note already shown in the MLB report.
- **Not** added to: board leans, 10k-sim distributions, the report player board as a prediction, market-agreement-by-stat, or product-eligibility. Settlement support already exists (`mlb-settlement.ts` maps `pitcher_outs → outs`) but is unused for products.
- The backtest harness is kept as reusable infrastructure. To reconsider `pitcher_outs` in future, a model would need **features the market has and recent-form lacks** — confirmed bullpen/leverage plan, pitch-count caps, manager-specific pull tendencies — and would have to clear the same gate (beat the market on Brier **and** log loss on a fresh, sufficient sample).

## What would change the verdict

Re-run `node app/scripts/backtest-mlb-pitcher-outs.mjs` after adding those features. Only if a variant beats the market on both metrics (n ≥ 60) does `pitcher_outs` become a candidate for the public gate. Until then it stays context-only. The same protocol applies to the other unmodeled markets (ER/HR/RBI/Runs).
