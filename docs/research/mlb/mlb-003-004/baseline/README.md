# MLB-003 / MLB-004 · baseline audit of the existing player-market models (2026-10-10)

**Founder decision 5 (2026-10-10).** Establish existing model performance, calibration and proper scoring, point-in-time feature availability, and missing-data limitations.

- **Descriptive only.** Nothing is tuned, and no challenger is evaluated here. Any challenger is preregistered separately, before it is evaluated.
- **Receipts:** `analyze-player-markets.mjs`, `baseline-summary.json`.

## Population

| Item | Value |
|---|---|
| Source | `pipeline/validation/mlb_settled_leans.jsonl`: 52,490 settled player leans, 2026-05-16 → 10-08, through the production forecast-of-record rule (`mlbLeansOfRecord`) |
| Of record | 52,433. Excluded: 57 superseded copies, 0 late |
| Point in time | No row's board was generated at or after first pitch (31,407 rows checkable). 21,026 rows predate the graded first-pitch record (before 07-24), so their timing is unverifiable here; the production rule already drops late copies |
| Market | The board row with the same id and the same projection. Both sides' American odds, de-vigged multiplicatively. Available for **every** decisive row |
| Caveat | The board file read is the day's committed file, i.e. its last revision. Restricting to identical projections keeps it to the same model output, but a price can still differ from the revision that made the call |
| Windows | 05-16 → 06-30 · 07-01 → 08-31 · **09-01 → 10-08**. Game outcomes in the last window were **examined in MLB-002**, so it is never an untouched holdout for any future challenger |

## Results: the existing model is worse than the market in every player market

| Market | n | Over rate | Model mean P(over) | Model log loss | Market log loss | Model − market, 95% | Calibration slope | Lean hit rate |
|---|---|---|---|---|---|---|---|---|
| Batter hits | 20,026 | 0.563 | 0.611 | 0.6817 | 0.6643 | **+0.018 [+0.015, +0.020]** | 0.61 | 54.1% |
| Hits + runs + RBI | 18,212 | 0.486 | 0.580 | 0.7214 | 0.6875 | **+0.034 [+0.030, +0.038]** | 0.29 | 49.8% |
| Total bases | 8,616 | 0.410 | 0.519 | 0.7143 | 0.6751 | **+0.039 [+0.034, +0.045]** | 0.08 | 43.0% |
| Pitcher strikeouts (MLB-004) | 2,439 | 0.479 | 0.494 | **0.7488** | 0.6844 | **+0.064 [+0.050, +0.078]** | 0.08 | 48.1% |

A coin flip scores log loss 0.6931. **Hits + runs + RBI, total bases and strikeouts score worse than a coin flip**, and hits is better than a coin but worse than the market. Every interval excludes 0, and every window shows the same pattern (`baseline-summary.json` → `byWindow`).

**What the calibration shows:**
- **Systematic over-lean:** the model's P(over) exceeds the observed over rate by 5 to 11 points in all three batter markets.
- **Hits:** probabilities are too spread. The 0.7–0.8 bin hits 63%, and the 0.8–0.9 bin hits 62%.
- **Total bases:** almost no discrimination (slope 0.08; −0.01 in Jul–Aug). The observed over rate is about 0.41 in every bin from 0.3 to 0.8.
- **Pitcher strikeouts: no discrimination at all.** The observed over rate is about 0.48 in **every** bin from 0.1 to 0.9 (slope 0.08). Today's strikeout probabilities carry no information about the outcome.
- **Projections (means):** nearly unbiased (+0.01 to +0.06), so the failure is in the **distribution around the mean and in the threshold probability**, not the level. Mean absolute error: hits 0.71, hits+runs+RBI 1.52, total bases 1.48, strikeouts 1.90.

**Home runs (MLB-003)**, from the Homer Nukes settled files (2026-08-17 → 10-08, 214 selected picks; no market price is stored, so the comparison is with the base rate):
- Hit rate 0.173 against a mean P of 0.233: **over-confident.**
- Log loss 0.4764 against the base rate's 0.4605. The difference is +0.016 [−0.005, +0.036]: **no better than the base rate**, on a small sample.

## Data availability and limitations (missing stays missing)

| Outcome | Available | Not available |
|---|---|---|
| Hits, total bases, hits+runs+RBI | Settled actual per player-line (52k rows), with the model's P(over), projection and sigma | Full predicted distributions (only the mean, sigma and one threshold are published) |
| Runs, RBI separately | — | **Not captured.** Only the combined hits+runs+RBI. No historical MLB box scores in the repository |
| Home runs | Homer Nukes settled P(HR) for selected players (214) | Every-batter HR outcomes; HR market prices |
| Pitcher strikeouts | 2,439 settled lines with actuals | — |
| Pitcher outs, innings, workload outcomes | Pregame `pitcher-workload` captures (season and last-5 IP, K, BB, ER, HR; rest; 74 dates from 07-22). An earlier 255-start pitcher-outs backtest (`data/internal/mlb/reference/mlb-pitcher-outs-backtest.json`, July) | **Per-game pitching lines after the fact** (outs, pitches, batters faced). They would need a StatsAPI box-score capture, which is free; proposed, not built |
| Bullpen | Pregame usage, last 1 and 3 days (74 dates) | Bullpen quality (ERA or FIP-type rates) |
| Batter splits, handedness, slots | Pregame captures from 07-22 | Before 07-22 |

## What this implies for MLB-003 to MLB-005 (proposals, not results)

1. **The threshold probabilities, not the means, are where the model fails.** A first MLB-003 challenger should model the count distribution per batter: per-PA rates times expected PA, binomial or negative-binomial, with the matchup-v1 inputs. Score it with proper scores on the actual counts, and benchmark it against the market and a market-free baseline.
2. **Strikeouts (MLB-004):** today's probabilities are uninformative. A challenger built from the K-rate matchup (log5 of starter K% and lineup K%) times expected batters faced (workload) is the natural first candidate. It needs per-game pitching lines for outs and innings, which means the box-score capture.
3. **MLB-005:** the full-game simulation already produces batter and pitcher lines from the same games (`players`). The coherence test is whether the simulation's own player distributions score at least as well as the separate prop model. That is measurable with these same settled rows.

**Evaluation rules for any challenger:**
- Preregistered first.
- Development on 05-16 → 08-31.
- **No untouched historical holdout exists after 08-31** for matchup-derived challengers, because 09-01 → 10-08 game outcomes were examined in MLB-002. So the qualifying test is **forward**: the 2027 season, or any remaining 2026 games.
- Failed results are kept.
