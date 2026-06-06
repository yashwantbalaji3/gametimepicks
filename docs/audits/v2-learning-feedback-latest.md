# V2 Learning Feedback (auto-generated)

> `audit-v2-learning-feedback.mjs --write-report` · READ-ONLY · settled slates only · no paid API · no live wiring · no public claims.

## 1. Dataset coverage
- Settled dates: 9 (2026-05-27 → 2026-06-05), public era ≥ 2026-05-27, excluding 2026-05-25, 2026-05-26.
- Decided legs (win/loss only; pending + pushes excluded): MLB 4334, NBA 1139.
- De-vig-able legs (two-sided market): overall N = 5473.

## 2. Leakage guard
- Active slate (none passed) is EXCLUDED from the learning dataset by construction.
- Only settled win/loss outcomes are used; no future labels; the active-slate watchlist (section 9) carries NO outcomes.

## 3. Baseline records (lifetime, public era)
- Generated pool: 108W / 611L / 27 pending — 15.0%.
- Published cards: 21W / 106L / 9 pending — 16.5%.
- By sport nba: 5W / 7L — 41.7%.
- By sport mlb: 13W / 115L — 10.2%.
- By sport multi: 5W / 59L — 7.8%.

## 4. Feature inventory
- Available: sport, market, side, win/loss, de-vig (two-sided MLB/NBA), confidence, edgePct, line, modelProb (MLB), recentSeries L5/L10 (MLB).
- Missing / unreliable: home/away split (not in settled lean rows), NBA modelProb/recentSeries (board shape differs), batter handedness/platoon, confirmed-starter.

## 5–8. Hit/miss learning by segment (hardened gates)
Bonferroni numTests = 23. Each segment classified by `classifyCandidate` (de-vig baseline, naive + corrected CI, adjusted p, date-split stability, single-date dependence).

| segment | N | rate | de-vig | corrCI.lo | pAdj | dates+ | stable | verdict |
|---------|--:|-----:|-------:|----------:|-----:|-------:|:------:|---------|
| mlb_all | 4334 | 50% | 50.2% | 47.6% | 1.000 | 3/9 | n | market_already_prices_it |
| mlb_l5_le3 | 3086 | 49% | 48.5% | 46.0% | 1.000 | 6/9 | n | market_already_prices_it |
| mlb_line_1_5 | 2290 | 47% | 47.3% | 44.2% | 1.000 | 4/9 | n | market_already_prices_it |
| mlb_devig_lt50 | 2205 | 42% | 42.8% | 38.9% | 1.000 | 5/9 | n | market_already_prices_it |
| mlb_line_le0_5 | 1776 | 53% | 53.8% | 49.5% | 1.000 | 3/9 | n | market_already_prices_it |
| mlb_market_batter_hits_runs_rbis | 1691 | 50% | 49.6% | 46.7% | 1.000 | 5/9 | n | market_already_prices_it |
| mlb_market_batter_hits | 1688 | 53% | 53.6% | 49.8% | 1.000 | 3/9 | n | market_already_prices_it |
| mlb_devig_50to60 | 1428 | 55% | 55.0% | 50.6% | 1.000 | 4/9 | n | market_already_prices_it |
| mp_60to70 | 1344 | 53% | 54.0% | 48.4% | 1.000 | 3/9 | n | market_already_prices_it |
| mp_50to60 | 1290 | 48% | 47.1% | 43.5% | 1.000 | 3/9 | n | market_already_prices_it |
| nba_all | 1139 | 52% | 50.1% | 47.9% | 1.000 | 3/4 | y | market_already_prices_it |
| mlb_l5_4of5 | 945 | 50% | 54.0% | 45.4% | 1.000 | 3/9 | n | rejected |
| mp_lt50 | 896 | 40% | 40.0% | 34.9% | 1.000 | 4/9 | n | market_already_prices_it |
| mp_ge70 | 804 | 60% | 60.3% | 54.9% | 1.000 | 5/9 | n | market_already_prices_it |
| mlb_market_batter_total_bases | 761 | 42% | 44.1% | 36.2% | 1.000 | 2/9 | n | market_already_prices_it |
| mlb_devig_60to70 | 699 | 65% | 63.8% | 59.0% | 1.000 | 7/9 | y | market_already_prices_it |
| nba_market_PTS | 424 | 58% | 49.7% | 50.3% | 0.010 | 4/4 | y | shadow_watchlist |
| nba_market_REB | 382 | 56% | 50.0% | 48.4% | 0.162 | 4/4 | y | shadow_watchlist |
| nba_market_AST | 333 | 41% | 50.7% | 33.2% | 1.000 | 1/4 | n | rejected |
| mlb_l5_5of5 | 294 | 61% | 56.6% | 52.0% | 1.000 | 6/9 | n | needs_more_data |
| mlb_line_ge2_5 | 268 | 51% | 50.8% | 41.9% | 1.000 | 3/9 | n | market_already_prices_it |
| mlb_market_pitcher_strikeouts | 194 | 48% | 50.5% | 37.3% | 1.000 | 3/9 | n | market_already_prices_it |
| mlb_devig_ge70 | 2 | 100% | 71.5% | 17.5% | 1.000 | 1/1 | n | blocked_sample_size |

## 8. Action recommendations
- **Launch candidates (corrected gates): 0.** Keep V2 internal.
- Shadow watchlist (clears naive CI only, fails ≥1 hard gate): nba_market_PTS, nba_market_REB.
- Everything else: needs_more_data / market_already_prices_it / blocked / rejected — not actionable.

## 9. Active-slate watchlist (informational, NO outcomes)
- No active date passed (`--date`), or no board — watchlist not computed.

*Read-only. No model/projection/optimizer/grading/data change. V2 not wired live.*