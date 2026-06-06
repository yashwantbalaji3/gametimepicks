# v2 Candidate Search — Aggressive Unbiased Validation (auto-generated)

> `app/scripts/audit-v2-candidate-search.mjs --write-report` · READ-ONLY · deterministic · **no paid API · no live wiring**.
> Unbiased **all-priced** settled sample joined to the pregame board for proper **de-vigging**. Public era only; May 25/26 banned; settled-only.
> `launch_candidate` requires the FULL gate set in `src/lib/v2-candidate-gates.ts` (Bonferroni-corrected CI + adjusted p + date stability + no single-date overdependence). A naive-95%-only pass is `shadow_watchlist`.

## GLOBAL: no launch_candidate

## Sample & correction
- MLB unbiased settled legs (public era): decided **4334**, board-matched (de-vig) **4334**, no-board 0. Dates: 2026-05-27, 2026-05-28, 2026-05-29, 2026-05-30, 2026-06-01, 2026-06-02, 2026-06-03, 2026-06-04, 2026-06-05.
- NBA settled legs (public era, odds inline): **1139**. Dates: 2026-05-28, 2026-05-30, 2026-06-03, 2026-06-05.
- Segments searched (multiple-comparisons family size): **41** → Bonferroni two-sided z = **3.234** (vs naive 1.960).
- Gates: bucket n ≥ 40; overall ≥ 250 (= 4334); naive **and** corrected Wilson lower bound > mean de-vig; adjusted p < 0.05; ≥70% positive dates; no single-date overdependence.

## Candidate table
| Candidate | Verdict | N | Win% | naive CI | corr CI | de-vig | edge | p-adj | dates+ |
|-----------|---------|--:|----:|:--------:|:-------:|:-----:|:----:|:-----:|:-----:|
| `mlb_all_priced_overall` | `market_already_prices_it` | 4334 | 50% | 48–51% | 47–52% | 50.2% | -0.3pp | 1.00 | 3/9 |
| `mlb_side_over` | `market_already_prices_it` | 3269 | 51% | 49–52% | 48–53% | 51.0% | -0.4pp | 1.00 | 4/9 |
| `mlb_side_under` | `market_already_prices_it` | 1065 | 48% | 45–51% | 43–53% | 47.9% | +0.1pp | 1.00 | 5/9 |
| `mlb_market_batter_hits` | `market_already_prices_it` | 1688 | 53% | 51–56% | 50–57% | 53.6% | -0.1pp | 1.00 | 3/9 |
| `mlb_market_batter_hits_runs_rbis` | `market_already_prices_it` | 1691 | 50% | 48–53% | 46–54% | 49.6% | +0.8pp | 1.00 | 5/9 |
| `mlb_market_batter_total_bases` | `market_already_prices_it` | 761 | 42% | 38–45% | 36–47% | 44.1% | -2.6pp | 1.00 | 2/9 |
| `mlb_market_pitcher_strikeouts` | `market_already_prices_it` | 194 | 48% | 41–55% | 37–59% | 50.5% | -2.5pp | 1.00 | 3/9 |
| `mlb_conf_high` | `market_already_prices_it` | 1964 | 49% | 47–51% | 46–53% | 50.0% | -0.8pp | 1.00 | 4/9 |
| `mlb_conf_medium` | `market_already_prices_it` | 641 | 52% | 48–55% | 45–58% | 50.9% | +0.8pp | 1.00 | 5/9 |
| `mlb_conf_low` | `market_already_prices_it` | 1729 | 50% | 48–52% | 46–54% | 50.2% | -0.1pp | 1.00 | 5/9 |
| `mlb_devig_lt40` | `market_already_prices_it` | 538 | 38% | 34–42% | 32–45% | 36.9% | +1.3pp | 1.00 | 5/9 |
| `mlb_devig_40to50` | `market_already_prices_it` | 1667 | 43% | 41–46% | 40–47% | 44.7% | -1.2pp | 1.00 | 3/9 |
| `mlb_devig_50to60` | `market_already_prices_it` | 1428 | 55% | 52–57% | 50–59% | 55.0% | -0.3pp | 1.00 | 4/9 |
| `mlb_devig_60to70` | `market_already_prices_it` | 699 | 65% | 61–68% | 59–70% | 63.8% | +0.8pp | 1.00 | 7/9 |
| `mlb_devig_ge70` | `blocked_sample_size` | 2 | 100% | 34–100% | 16–100% | 71.5% | +28.5pp | 1.00 | 1/1 |
| `mlb_edge_neg` | `market_already_prices_it` | 926 | 51% | 48–54% | 46–56% | 50.6% | +0.4pp | 1.00 | 6/9 |
| `mlb_edge_0to5` | `market_already_prices_it` | 1306 | 51% | 49–54% | 47–56% | 50.7% | +0.8pp | 1.00 | 6/9 |
| `mlb_edge_5to15` | `market_already_prices_it` | 1653 | 50% | 48–52% | 46–54% | 50.4% | -0.5pp | 1.00 | 4/9 |
| `mlb_edge_ge15` | `rejected` | 449 | 43% | 39–48% | 36–51% | 47.2% | -4.0pp | 1.00 | 2/9 |
| `mlb_recentform_L5_5of5` | `needs_more_data` | 294 | 61% | 55–66% | 51–70% | 56.6% | +4.3pp | 1.00 | 6/9 |
| `mlb_recentform_L5_4plus` | `market_already_prices_it` | 1239 | 53% | 50–56% | 48–57% | 54.6% | -1.7pp | 1.00 | 3/9 |
| `mlb_recentform_L10_8plus` | `market_already_prices_it` | 606 | 57% | 53–61% | 50–63% | 58.0% | -1.1pp | 1.00 | 3/9 |
| `mlb_recentform_L10_7plus` | `market_already_prices_it` | 1331 | 55% | 52–57% | 50–59% | 56.0% | -1.4pp | 1.00 | 3/9 |
| `mlb_low_gate_5of5_and_-150` | `needs_more_data` | 171 | 69% | 62–75% | 57–79% | 62.1% | +6.9pp | 1.00 | 6/9 |
| `mlb_lowgate_over` | `needs_more_data` | 122 | 70% | 62–78% | 56–82% | 62.2% | +8.3pp | 1.00 | 4/9 |
| `mlb_lowgate_under` | `needs_more_data` | 49 | 65% | 51–77% | 42–83% | 61.9% | +3.4pp | 1.00 | 6/9 |
| `mlb_modelprob_lt50` | `market_already_prices_it` | 896 | 40% | 37–43% | 35–45% | 40.0% | -0.2pp | 1.00 | 4/9 |
| `mlb_modelprob_50to60` | `market_already_prices_it` | 1290 | 48% | 45–50% | 43–52% | 47.1% | +0.6pp | 1.00 | 3/9 |
| `mlb_modelprob_60to70` | `market_already_prices_it` | 1344 | 53% | 50–55% | 48–57% | 54.0% | -1.4pp | 1.00 | 3/9 |
| `mlb_modelprob_ge70` | `market_already_prices_it` | 804 | 60% | 57–64% | 55–66% | 60.3% | +0.1pp | 1.00 | 5/9 |
| `mlb_line_le0_5` | `market_already_prices_it` | 1776 | 53% | 51–55% | 49–57% | 53.8% | -0.7pp | 1.00 | 3/9 |
| `mlb_line_1_5` | `market_already_prices_it` | 2290 | 47% | 45–49% | 44–51% | 47.3% | +0.0pp | 1.00 | 4/9 |
| `mlb_line_2_5` | `needs_more_data` | 66 | 58% | 46–69% | 38–75% | 50.2% | +7.4pp | 1.00 | 6/8 |
| `mlb_line_ge3_5` | `market_already_prices_it` | 202 | 49% | 42–56% | 38–60% | 51.0% | -2.0pp | 1.00 | 3/9 |
| `mlb_lowgate_batter_hits` | `needs_more_data` | 129 | 71% | 62–78% | 56–82% | 63.0% | +7.5pp | 1.00 | 5/9 |
| `mlb_lowgate_batter_hits_runs_rbis` | `blocked_sample_size` | 31 | 65% | 47–79% | 37–85% | 58.7% | +5.8pp | 1.00 | 5/9 |
| `mlb_lowgate_batter_total_bases` | `blocked_sample_size` | 10 | 70% | 40–89% | 25–94% | 61.1% | +8.9pp | 1.00 | 4/5 |
| `mlb_lowgate_pitcher_strikeouts` | `blocked_sample_size` | 1 | 0% | 0–79% | 0–91% | 56.7% | -56.7pp | 1.00 | 0/1 |
| `mlb_home` | `market_already_prices_it` | 2151 | 50% | 47–52% | 46–53% | 50.3% | -0.7pp | 1.00 | 5/9 |
| `mlb_away` | `market_already_prices_it` | 2183 | 50% | 48–52% | 47–54% | 50.1% | +0.2pp | 1.00 | 4/9 |
| `nba_all_priced_overall` | `market_already_prices_it` | 1139 | 52% | 50–55% | 48–57% | 50.1% | +2.3pp | 1.00 | 3/4 |

## Conclusion: no launch candidate
No feature family clears the full launch gate set on the unbiased de-vigged sample. Keep v2 shadow-only; gather more settled slates.


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
