# MLB existing-data feature upgrades — research + decision (June 9)

Research only. No paid/new data. Decision gated on the leakage-safe backtest
(`app/scripts/backtest-mlb-projection-formulas.mjs`, settled June 1–8). Full Brier
table in `mlb-projection-formula-backtest-latest.md`.

## A. Recent-form shrinkage — DECISION: DO NOT SHIP YET (evidence too marginal)
Current: batters `0.5·L10 + 0.5·season`; pitchers `0.55·L3 + 0.45·season`.
Backtest (Brier ↓, dirAcc flat) across L10 weights 0.3→0.6:
| Market | w0.3 Brier | w0.5 Brier | dirAcc |
|---|---|---|---|
| batter_hits (n=1497) | 0.2489 | 0.2504 | 0.58 |
| batter_total_bases (706) | 0.2612 | 0.2642 | 0.48 |
| pitcher_strikeouts (168) | 0.2693 | 0.2700 | 0.51 |
| HRR (1497) | 0.2654 | 0.2675 | 0.49 |

**Finding:** lower L10 weight (more season shrinkage) gives a **consistent**
(4/4 markets, monotonic) but **tiny** Brier improvement (~0.0015, ~0.6% relative);
directional accuracy is essentially unchanged. Brier ≈ 0.25 everywhere means the
probabilities are near coin-flip regardless of weight — the recent/season blend is
**not** the binding constraint. **Decision:** do NOT ship a weight change on a
single 8-day window (overfit risk, immaterial gain). Re-run the harness after more
settled dates accumulate; if the consistent edge holds at n≫, a conservative
batter `0.4/0.6` is the most it would justify.

## B. Opposing-pitcher proxy — RECOMMENDED as the next research/PR (higher ceiling)
Feasible with existing data: probable-pitcher IDs are already fetched (used for
pitcher_strikeouts), and `fetch_player_game_log` returns the opposing pitcher's own
season log. We can derive a pitcher's allowed-hits / allowed-total-bases tendency
and a strikeout tendency, then nudge batter projections by opponent strength and Ks
by opposing-lineup contact. This attacks the real gap (matchup-blindness) that the
weight tweak cannot. Build it behind the same backtest harness before shipping.

## C. Plate-appearance proxy — PARTIAL
Batting-order position is NOT available (no confirmed lineup). We CAN require a
minimum recent-PA sample and downweight players with inconsistent recent playing
time (PA is in the game logs, currently only a games-played gate). Low/medium value;
folds into shrinkage work.

## D. Market sigma / distribution — NOTED
Normal-CDF with σ floors is a rough fit for counts. total_bases (dirAcc 0.48) and
HRR (0.49) are directionally **anti-predictive** — these markets are better
disabled/restricted (already are) than re-distributed. A quantile/empirical model
for total_bases is research-tier, not near-term.

## E. Edge/probability calibration — ALREADY HANDLED
Edge is inverted at the top and is already capped/penalized + excluded (#324); the
learned overlay tightens market status. No further edge change recommended now.

## Bottom line
The one cleanly-supported existing-data lever (shrinkage) is **too small to ship on
this sample**. The honest path to materially better MLB hit rate is **matchup
features** (opposing-pitcher proxy first), each gated through the new backtest
harness with ≥multi-week samples. No model formula change ships this session.
