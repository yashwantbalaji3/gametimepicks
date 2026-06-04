# v2 Candidate Search — Aggressive Unbiased Validation (auto-generated)

> `app/scripts/audit-v2-candidate-search.mjs --write-report` · READ-ONLY · deterministic · **no paid API · no live wiring**.
> Unbiased **all-priced** settled sample joined to the pregame board for proper **de-vigging**. Public era only; May 25/26 banned; settled-only.

## GLOBAL: no launch_candidate

## Sample
- MLB unbiased settled legs (public era): decided **2787**, board-matched (de-vig available) **2787**, no-board 0. Dates: 2026-05-27, 2026-05-28, 2026-05-29, 2026-05-30, 2026-06-01, 2026-06-02.
- NBA settled legs (public era, odds inline): **539**. Dates: 2026-05-28, 2026-05-30. (Market-calibration only; recent-form fails closed.)
- Gates: bucket n ≥ 40; overall ≥ 250 (= 2787); "beats market" = Wilson 95% lower bound > mean de-vigged prob; date-split stable ≥60% positive dates.

## Candidate table
| Candidate | Verdict | N | Win% | 95% CI | de-vig | edge vs de-vig | dates+ |
|-----------|---------|--:|----:|:------:|:-----:|:--------------:|:-----:|
| `mlb_all_priced_overall` | `market_already_prices_it` | 2787 | 51% | 49–53% | 50.2% | +0.6pp | 3/6 |
| `mlb_side_over` | `market_already_prices_it` | 2130 | 52% | 49–54% | 51.0% | +0.5pp | 4/6 |
| `mlb_side_under` | `market_already_prices_it` | 657 | 49% | 45–52% | 47.6% | +1.0pp | 4/6 |
| `mlb_market_batter_hits` | `market_already_prices_it` | 1094 | 55% | 52–58% | 53.8% | +1.4pp | 3/6 |
| `mlb_market_batter_hits_runs_rbis` | `market_already_prices_it` | 1095 | 52% | 49–55% | 49.4% | +2.2pp | 4/6 |
| `mlb_market_batter_total_bases` | `rejected` | 473 | 40% | 36–44% | 43.8% | -3.8pp | 1/6 |
| `mlb_market_pitcher_strikeouts` | `rejected` | 125 | 47% | 39–56% | 50.5% | -3.3pp | 2/6 |
| `mlb_conf_high` | `market_already_prices_it` | 1252 | 50% | 47–53% | 49.7% | +0.1pp | 3/6 |
| `mlb_conf_medium` | `market_already_prices_it` | 403 | 50% | 45–55% | 50.9% | -0.8pp | 2/6 |
| `mlb_conf_low` | `market_already_prices_it` | 1132 | 52% | 49–55% | 50.6% | +1.7pp | 4/6 |
| `mlb_devig_lt40` | `needs_more_data` | 334 | 41% | 36–46% | 36.9% | +3.8pp | 4/6 |
| `mlb_devig_40to50` | `market_already_prices_it` | 1093 | 44% | 41–47% | 44.6% | -1.1pp | 2/6 |
| `mlb_devig_50to60` | `market_already_prices_it` | 906 | 56% | 53–59% | 55.1% | +1.1pp | 3/6 |
| `mlb_devig_60to70` | `market_already_prices_it` | 454 | 65% | 61–69% | 63.8% | +1.4pp | 5/6 |
| `mlb_devig_ge70` | `blocked_sample_size` | 0 | — | 0–0% | — | — | 0/0 |
| `mlb_edge_neg` | `market_already_prices_it` | 613 | 53% | 49–57% | 50.7% | +2.3pp | 5/6 |
| `mlb_edge_0to5` | `market_already_prices_it` | 841 | 52% | 49–56% | 51.1% | +1.2pp | 4/6 |
| `mlb_edge_5to15` | `market_already_prices_it` | 1064 | 50% | 47–53% | 50.0% | +0.4pp | 3/6 |
| `mlb_edge_ge15` | `rejected` | 269 | 43% | 37–49% | 47.1% | -3.9pp | 1/6 |
| `mlb_recentform_L5_5of5` | `market_already_prices_it` | 169 | 59% | 51–66% | 56.1% | +2.5pp | 4/6 |
| `mlb_recentform_L5_4plus` | `market_already_prices_it` | 762 | 53% | 50–57% | 54.8% | -1.5pp | 2/6 |
| `mlb_recentform_L10_8plus` | `market_already_prices_it` | 376 | 56% | 51–61% | 57.9% | -1.7pp | 2/6 |
| `mlb_low_gate_5of5_and_-150` | `needs_more_data` | 94 | 70% | 60–79% | 61.8% | +8.4pp | 4/6 |
| `nba_all_priced_overall` | `blocked_unstable` | 539 | 59% | 54–63% | 50.4% | +8.3pp | 2/2 |

## Reading this
- **edge vs de-vig** = win rate − mean de-vigged market probability of the chosen side. A genuine, exploitable edge needs this *positive AND* the CI lower bound above the de-vig baseline (column `95% CI` low > `de-vig`).
- `market_already_prices_it` = win rate within ±3pp of the de-vigged market (no exploitable gap).
- `blocked_sample_size` = bucket < 40 decided. `blocked_unstable` = beats market overall but not in ≥60% of dates (likely noise).
- The `mlb_edge_*` rows test whether `edgePct` predicts outcomes — if higher-edge buckets do NOT win more, edge is not a usable quality signal (and must never be sold as one).
- Recent-form rows are computed on the **unbiased** sample (all priced legs, not just the optimizer's picks).

## Conclusion: no launch candidate
No feature family clears all hard gates on the unbiased de-vigged sample. The market prices the priced props efficiently; the only buckets that beat the de-vig baseline (if any) are too small or unstable. Keep v2 shadow-only; gather more settled slates. See `docs/V2_NOT_READY_DECISION.md`.

*Overwritten by the script. Do not hand-edit.*
