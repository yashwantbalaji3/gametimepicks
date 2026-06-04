# v2 Candidate Search — Aggressive Unbiased Validation (auto-generated)

> `app/scripts/audit-v2-candidate-search.mjs --write-report` · READ-ONLY · deterministic · **no paid API · no live wiring**.
> Unbiased **all-priced** settled sample joined to the pregame board for proper **de-vigging**. Public era only; May 25/26 banned; settled-only.
> `launch_candidate` requires the FULL gate set in `src/lib/v2-candidate-gates.ts` (Bonferroni-corrected CI + adjusted p + date stability + no single-date overdependence). A naive-95%-only pass is `shadow_watchlist`.

## GLOBAL: no launch_candidate · 3 shadow_watchlist

## Sample & correction
- MLB unbiased settled legs (public era): decided **3356**, board-matched (de-vig) **3356**, no-board 0. Dates: 2026-05-27, 2026-05-28, 2026-05-29, 2026-05-30, 2026-06-01, 2026-06-02, 2026-06-03.
- NBA settled legs (public era, odds inline): **794**. Dates: 2026-05-28, 2026-05-30, 2026-06-03.
- Segments searched (multiple-comparisons family size): **41** → Bonferroni two-sided z = **3.234** (vs naive 1.960).
- Gates: bucket n ≥ 40; overall ≥ 250 (= 3356); naive **and** corrected Wilson lower bound > mean de-vig; adjusted p < 0.05; ≥70% positive dates; no single-date overdependence.

## Candidate table
| Candidate | Verdict | N | Win% | naive CI | corr CI | de-vig | edge | p-adj | dates+ |
|-----------|---------|--:|----:|:--------:|:-------:|:-----:|:----:|:-----:|:-----:|
| `mlb_all_priced_overall` | `market_already_prices_it` | 3356 | 50% | 48–52% | 47–53% | 50.2% | -0.1pp | 1.00 | 3/7 |
| `mlb_side_over` | `market_already_prices_it` | 2545 | 51% | 49–53% | 48–54% | 51.0% | -0.1pp | 1.00 | 4/7 |
| `mlb_side_under` | `market_already_prices_it` | 811 | 47% | 44–51% | 42–53% | 47.8% | -0.3pp | 1.00 | 4/7 |
| `mlb_market_batter_hits` | `market_already_prices_it` | 1317 | 54% | 51–57% | 49–58% | 53.6% | +0.3pp | 1.00 | 3/7 |
| `mlb_market_batter_hits_runs_rbis` | `market_already_prices_it` | 1320 | 51% | 48–53% | 46–55% | 49.5% | +1.3pp | 1.00 | 4/7 |
| `mlb_market_batter_total_bases` | `rejected` | 565 | 41% | 37–45% | 34–48% | 44.0% | -3.3pp | 1.00 | 1/7 |
| `mlb_market_pitcher_strikeouts` | `rejected` | 154 | 47% | 40–55% | 35–60% | 50.8% | -3.4pp | 1.00 | 2/7 |
| `mlb_conf_high` | `market_already_prices_it` | 1529 | 49% | 46–51% | 45–53% | 49.8% | -0.8pp | 1.00 | 3/7 |
| `mlb_conf_medium` | `market_already_prices_it` | 482 | 51% | 47–55% | 44–58% | 51.0% | +0.1pp | 1.00 | 3/7 |
| `mlb_conf_low` | `market_already_prices_it` | 1345 | 51% | 48–54% | 47–56% | 50.5% | +0.6pp | 1.00 | 4/7 |
| `mlb_devig_lt40` | `market_already_prices_it` | 403 | 39% | 34–44% | 31–47% | 36.8% | +1.9pp | 1.00 | 4/7 |
| `mlb_devig_40to50` | `market_already_prices_it` | 1305 | 43% | 40–46% | 39–47% | 44.7% | -1.7pp | 1.00 | 2/7 |
| `mlb_devig_50to60` | `market_already_prices_it` | 1110 | 55% | 52–58% | 50–60% | 55.1% | -0.1pp | 1.00 | 3/7 |
| `mlb_devig_60to70` | `market_already_prices_it` | 536 | 66% | 62–70% | 59–72% | 63.8% | +1.9pp | 1.00 | 6/7 |
| `mlb_devig_ge70` | `blocked_sample_size` | 2 | 100% | 34–100% | 16–100% | 71.5% | +28.5pp | 1.00 | 1/1 |
| `mlb_edge_neg` | `market_already_prices_it` | 717 | 51% | 48–55% | 45–57% | 50.7% | +0.8pp | 1.00 | 5/7 |
| `mlb_edge_0to5` | `market_already_prices_it` | 990 | 52% | 49–55% | 47–57% | 51.0% | +1.1pp | 1.00 | 5/7 |
| `mlb_edge_5to15` | `market_already_prices_it` | 1305 | 50% | 47–52% | 45–54% | 50.1% | -0.5pp | 1.00 | 3/7 |
| `mlb_edge_ge15` | `rejected` | 344 | 43% | 38–49% | 35–52% | 47.5% | -4.1pp | 1.00 | 1/7 |
| `mlb_recentform_L5_5of5` | `needs_more_data` | 219 | 63% | 56–69% | 52–73% | 56.5% | +6.5pp | 1.00 | 5/7 |
| `mlb_recentform_L5_4plus` | `market_already_prices_it` | 954 | 54% | 51–57% | 49–59% | 54.8% | -1.0pp | 1.00 | 3/7 |
| `mlb_recentform_L10_8plus` | `market_already_prices_it` | 464 | 58% | 54–63% | 51–66% | 57.9% | +0.5pp | 1.00 | 3/7 |
| `mlb_recentform_L10_7plus` | `market_already_prices_it` | 1012 | 56% | 53–59% | 51–61% | 56.0% | -0.2pp | 1.00 | 3/7 |
| `mlb_low_gate_5of5_and_-150` | `shadow_watchlist` | 129 | 72% | 64–79% | 58–83% | 62.0% | +10.1pp | 0.358 | 5/7 |
| `mlb_lowgate_over` | `shadow_watchlist` | 90 | 76% | 66–83% | 59–87% | 61.9% | +13.6pp | 0.157 | 4/7 |
| `mlb_lowgate_under` | `blocked_sample_size` | 39 | 64% | 48–77% | 39–83% | 62.0% | +2.1pp | 1.00 | 4/7 |
| `mlb_modelprob_lt50` | `market_already_prices_it` | 687 | 39% | 35–43% | 33–45% | 40.1% | -1.0pp | 1.00 | 3/7 |
| `mlb_modelprob_50to60` | `market_already_prices_it` | 989 | 48% | 45–51% | 43–53% | 47.0% | +1.3pp | 1.00 | 3/7 |
| `mlb_modelprob_60to70` | `market_already_prices_it` | 1055 | 53% | 50–56% | 48–58% | 54.1% | -0.9pp | 1.00 | 3/7 |
| `mlb_modelprob_ge70` | `market_already_prices_it` | 625 | 60% | 56–64% | 54–66% | 60.1% | +0.1pp | 1.00 | 4/7 |
| `mlb_line_le0_5` | `market_already_prices_it` | 1411 | 53% | 50–56% | 49–57% | 53.9% | -0.8pp | 1.00 | 3/7 |
| `mlb_line_1_5` | `market_already_prices_it` | 1742 | 48% | 45–50% | 44–52% | 47.2% | +0.6pp | 1.00 | 4/7 |
| `mlb_line_2_5` | `needs_more_data` | 41 | 54% | 39–68% | 30–75% | 50.1% | +3.5pp | 1.00 | 4/6 |
| `mlb_line_ge3_5` | `market_already_prices_it` | 162 | 49% | 41–56% | 37–61% | 51.4% | -2.7pp | 1.00 | 2/7 |
| `mlb_lowgate_batter_hits` | `shadow_watchlist` | 97 | 74% | 65–82% | 58–86% | 62.8% | +11.5pp | 0.395 | 5/7 |
| `mlb_lowgate_batter_hits_runs_rbis` | `blocked_sample_size` | 23 | 70% | 49–84% | 37–90% | 58.9% | +10.6pp | 1.00 | 5/7 |
| `mlb_lowgate_batter_total_bases` | `blocked_sample_size` | 8 | 63% | 31–86% | 18–93% | 61.6% | +0.9pp | 1.00 | 2/3 |
| `mlb_lowgate_pitcher_strikeouts` | `blocked_sample_size` | 1 | 0% | 0–79% | 0–91% | 56.7% | -56.7pp | 1.00 | 0/1 |
| `mlb_home` | `market_already_prices_it` | 1667 | 50% | 48–53% | 46–54% | 50.5% | -0.0pp | 1.00 | 5/7 |
| `mlb_away` | `market_already_prices_it` | 1689 | 50% | 47–52% | 46–54% | 50.0% | -0.2pp | 1.00 | 3/7 |
| `nba_all_priced_overall` | `market_already_prices_it` | 794 | 53% | 50–56% | 47–59% | 50.3% | +2.7pp | 1.00 | 2/3 |

## Conclusion: no launch candidate
No feature family clears the full launch gate set on the unbiased de-vigged sample. Keep v2 shadow-only; gather more settled slates.

## shadow_watchlist (beats naive CI; fails ≥1 launch gate — track, do not wire)
- `mlb_low_gate_5of5_and_-150`: 72% (N=129) vs de-vig 62.0% (edge +10.1pp). Failed gates: corrected_ci, adjusted_p, single_date_overdependence. naive CI 64–79%, corrected 58–83%, p-adj 0.358, dates+ 5/7.
- `mlb_lowgate_over`: 76% (N=90) vs de-vig 61.9% (edge +13.6pp). Failed gates: corrected_ci, adjusted_p, date_stability, single_date_overdependence. naive CI 66–83%, corrected 59–87%, p-adj 0.157, dates+ 4/7.
- `mlb_lowgate_batter_hits`: 74% (N=97) vs de-vig 62.8% (edge +11.5pp). Failed gates: corrected_ci, adjusted_p, single_date_overdependence. naive CI 65–82%, corrected 58–86%, p-adj 0.395, dates+ 5/7.


## Blocked families (no data / out of scope)
- `mlb_batter_handedness`: no batter-handedness field in settled leans or board → blocked_missing_data
- `mlb_pitcher_handedness`: no pitcher-handedness field → blocked_missing_data
- `mlb_probable_starter`: no confirmed-starter field → blocked_missing_data
- `mlb_platoon_split`: market already prices platoon (prior market-only study); no handedness data to re-derive → market_already_prices_it / blocked_missing_data
- `mlb_team_opponent`: per-team/opponent buckets all fall below the 40-leg floor → blocked_sample_size
- `nba_by_market`: NBA public-era sample too small (June 4 is an NBA off-day; few settled dates) → blocked_sample_size

## Reading this
- **edge** = win rate − mean de-vigged market probability of the chosen side.
- A genuine edge needs BOTH the naive and the Bonferroni-corrected CI lower bound above de-vig, an adjusted p below the threshold, stability across dates, and no single date carrying the result.
- `shadow_watchlist` = clears the naive 95% CI but fails ≥1 launch gate (typically the multiple-comparisons correction) → promising but unconfirmed; keep tracking.
- `mlb_edge_*` / `mlb_conf_*` are flagged edge/confidence-driven and can never be launch candidates (those signals are anti-/non-predictive and must not be sold as quality).

*Overwritten by the script. Do not hand-edit. Gate logic + tests: `src/lib/v2-candidate-gates.ts` (+ `.test.mjs`).*
