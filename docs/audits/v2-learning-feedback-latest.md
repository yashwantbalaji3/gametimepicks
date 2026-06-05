# V2 Learning Feedback (auto-generated)

> `audit-v2-learning-feedback.mjs --write-report` · READ-ONLY · settled slates only · no paid API · no live wiring · no public claims.

## 1. Dataset coverage
- Settled dates: 8 (2026-05-27 → 2026-06-04), public era ≥ 2026-05-27, excluding 2026-05-25, 2026-05-26.
- Decided legs (win/loss only; pending + pushes excluded): MLB 3743, NBA 794.
- De-vig-able legs (two-sided market): overall N = 4537.

## 2. Leakage guard
- Active slate 2026-06-05 is EXCLUDED from the learning dataset by construction.
- Only settled win/loss outcomes are used; no future labels; the active-slate watchlist (section 9) carries NO outcomes.

## 3. Baseline records (lifetime, public era)
- Generated pool: 87W / 514L / 27 pending — 14.5%.
- Published cards: 19W / 84L / 9 pending — 18.4%.
- By sport nba: 5W / 7L — 41.7%.
- By sport mlb: 11W / 93L — 10.6%.
- By sport multi: 5W / 41L — 10.9%.

## 4. Feature inventory
- Available: sport, market, side, win/loss, de-vig (two-sided MLB/NBA), confidence, edgePct, line, modelProb (MLB), recentSeries L5/L10 (MLB).
- Missing / unreliable: home/away split (not in settled lean rows), NBA modelProb/recentSeries (board shape differs), batter handedness/platoon, confirmed-starter.

## 5–8. Hit/miss learning by segment (hardened gates)
Bonferroni numTests = 23. Each segment classified by `classifyCandidate` (de-vig baseline, naive + corrected CI, adjusted p, date-split stability, single-date dependence).

| segment | N | rate | de-vig | corrCI.lo | pAdj | dates+ | stable | verdict |
|---------|--:|-----:|-------:|----------:|-----:|-------:|:------:|---------|
| mlb_all | 3743 | 50% | 50.2% | 47.4% | 1.000 | 3/8 | n | market_already_prices_it |
| mlb_l5_le3 | 2661 | 49% | 48.4% | 45.7% | 1.000 | 5/8 | n | market_already_prices_it |
| mlb_line_1_5 | 1967 | 47% | 47.3% | 43.9% | 1.000 | 4/8 | n | market_already_prices_it |
| mlb_devig_lt50 | 1908 | 42% | 42.8% | 38.7% | 1.000 | 5/8 | n | market_already_prices_it |
| mlb_line_le0_5 | 1552 | 53% | 53.8% | 49.1% | 1.000 | 3/8 | n | market_already_prices_it |
| mlb_market_batter_hits_runs_rbis | 1466 | 50% | 49.5% | 46.4% | 1.000 | 4/8 | n | market_already_prices_it |
| mlb_market_batter_hits | 1463 | 54% | 53.6% | 49.6% | 1.000 | 3/8 | n | market_already_prices_it |
| mlb_devig_50to60 | 1227 | 54% | 55.0% | 49.7% | 1.000 | 3/8 | n | market_already_prices_it |
| mp_60to70 | 1169 | 53% | 54.1% | 48.3% | 1.000 | 3/8 | n | market_already_prices_it |
| mp_50to60 | 1104 | 48% | 47.0% | 43.3% | 1.000 | 3/8 | n | market_already_prices_it |
| mlb_l5_4of5 | 821 | 50% | 54.2% | 44.5% | 1.000 | 2/8 | n | rejected |
| nba_all | 794 | 53% | 50.3% | 47.6% | 1.000 | 2/3 | n | market_already_prices_it |
| mp_lt50 | 775 | 39% | 40.0% | 33.5% | 1.000 | 3/8 | n | market_already_prices_it |
| mp_ge70 | 695 | 61% | 60.2% | 54.9% | 1.000 | 5/8 | n | market_already_prices_it |
| mlb_market_batter_total_bases | 647 | 41% | 44.1% | 35.2% | 1.000 | 1/8 | n | rejected |
| mlb_devig_60to70 | 606 | 66% | 63.8% | 59.6% | 1.000 | 7/8 | y | market_already_prices_it |
| nba_market_PTS | 294 | 56% | 49.7% | 47.2% | 0.327 | 3/3 | y | shadow_watchlist |
| nba_market_REB | 268 | 59% | 50.1% | 49.2% | 0.058 | 3/3 | y | shadow_watchlist |
| mlb_l5_5of5 | 253 | 63% | 56.6% | 53.2% | 0.495 | 6/8 | y | shadow_watchlist |
| nba_market_AST | 232 | 43% | 51.3% | 33.2% | 1.000 | 1/3 | n | rejected |
| mlb_line_ge2_5 | 224 | 51% | 50.9% | 41.3% | 1.000 | 3/8 | n | market_already_prices_it |
| mlb_market_pitcher_strikeouts | 167 | 48% | 50.7% | 36.5% | 1.000 | 3/8 | n | market_already_prices_it |
| mlb_devig_ge70 | 2 | 100% | 71.5% | 17.5% | 1.000 | 1/1 | n | blocked_sample_size |

## 8. Action recommendations
- **Launch candidates (corrected gates): 0.** Keep V2 internal.
- Shadow watchlist (clears naive CI only, fails ≥1 hard gate): nba_market_PTS, nba_market_REB, mlb_l5_5of5.
- Everything else: needs_more_data / market_already_prices_it / blocked / rejected — not actionable.

## 9. Active-slate watchlist (informational, NO outcomes)
- 2026-06-05: 25 of 635 actionable legs match a watchlist rule. By market: {"batter_hits":20,"batter_hits_runs_rbis":4,"batter_total_bases":1}.
- `ENABLE_V2_SHADOW_CANDIDATE = false` → watchlist is internal only; it changes NO public output and makes NO recommendation.

*Read-only. No model/projection/optimizer/grading/data change. V2 not wired live.*