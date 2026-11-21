# MLB run line · market-informed evaluation (`mlb-runline-market-eval@1`)

**Founder decision 7 (2026-10-09):** replace the coin-flip benchmark with a market-informed comparison. Version the protocol. Preserve the previous record. **Do not unpause** the run-line family, and **do not grant product eligibility** because the benchmark changed.

This protocol measures. It decides nothing. The live-record gate's existing judgement (`mlb_run_line` HOLDING against a coin flip, paused by the posted-line inheritance in #1038) and every graded row stay exactly as they are.

## Protocol v1 (fixed before the numbers below were read)

| Item | Rule |
|---|---|
| Universe | Every graded `run_line` row in `game-predictions-graded.jsonl` |
| Forecast | The forecast of record: the graded row's prediction revision, then its `artifactHash`, then the full-game game with that hash |
| Market quote | The quote that forecast carried (`market.runLine`): book, `capturedAt`, the **signed home line**, and the no-vig home cover. It is joined to the committed `team-markets` revision with that `generatedAt`, which supplies **both sides' American prices** |
| De-vig | Multiplicative: p_home = i_home / (i_home + i_away). Recomputed from the committed prices; it must match the stored value within 0.0006, else the game is excluded |
| One-sided quote | Excluded (`ONE_SIDED_QUOTE`). A quote with only one side is never de-vigged |
| Point in time | The quote must be captured before the forecast was generated and before first pitch, else `QUOTE_NOT_POINT_IN_TIME` |
| Event scored | "The home side covers the line the book posted for it." Home margin m and line L: covers if m + L > 0. A whole-number line that lands exactly is a **push**, excluded and counted |
| Model probability | Same signed side, from the forecast's own simulated margins. L = +1.5 → 1 − awayCover@1.5; L = −1.5 → homeCover@1.5. Other lines are not in the artifact, so excluded |
| Scores | Log loss and Brier (proper scoring), model vs market on the same event. Paired game-level bootstrap of the difference (10,000 resamples, fixed seed). A difference counts as established only when its 95% interval excludes 0 |
| Reported separately | (1) Raw hit rate of graded picks. (2) **Base-rate effect**: the market's probability of each picked side, i.e. the hit rate that side should produce. (3) Model vs market accuracy. (4) Market calibration. (5) **Potential edge**: model − market on the picked side, and the hypothetical flat-stake return at the posted price, with intervals. (6) Product eligibility: **not determined here** |
| Subgroups | Regular season / postseason (from 2026-09-28) |

**Limitations stated up front:**
- One book (DraftKings).
- One capture a day, early in the day. This is **not a closing line**, so the benchmark is weaker than a closing-line benchmark would be.
- The comparison is in-sample on already-graded games.
- Historical decision-engine-v1 picks were made on the simulated ±1.5 side, not on the posted side.

## Results (2026-10-09)

805 of 810 graded games scored. 5 excluded: the forecast carried no market quote. Every remaining quote had both prices, its de-vig recomputed, and it was captured before the forecast and before first pitch.

| | All (805) | Regular season (781) | Postseason (24) |
|---|---|---|---|
| Home covered its posted line | 49.6% | 49.9% | 37.5% |
| Market mean P(home covers) | 48.8% | 48.9% | 45.6% |
| **Log loss, model / market** | **0.6944 / 0.6657** | 0.6958 / 0.6653 | 0.6469 / 0.6759 |
| Model − market, 95% | **+0.029 [+0.012, +0.045]** | +0.030 [+0.014, +0.047] | −0.029 [−0.072, +0.012] |
| Brier, model / market | 0.2491 / 0.2364 | 0.2497 / 0.2363 | 0.2279 / 0.2413 |
| Model − market, 95% | +0.013 [+0.005, +0.020] | +0.013 [+0.006, +0.021] | −0.013 [−0.033, +0.006] |

**Model accuracy:** on the event the market prices, the model is **worse than the market** overall and in the regular season. Both intervals exclude 0. The postseason sample (24 games) cannot establish a difference either way.

**Graded picks** (decision engine v1):

| | All | Regular season | Postseason |
|---|---|---|---|
| Picks on a side the book posted | 489 (441 at +1.5, 48 at −1.5) | 470 | 19 |
| Picks on a side the book did **not** post | **316** | 311 | 5 |
| Raw hit rate (posted-side picks) | 60.3% | 60.4% | 57.9% |
| Market-expected hit rate for those picks | 56.4% | 56.2% | 60.6% |
| Hit rate − expected, 95% | +3.9 pts [−0.4, +8.2] | +4.2 [−0.2, +8.5] | −2.7 [−25.0, +19.3] |
| Mean model − market on the pick | +3.2 pts | +3.3 | +0.8 |
| Hypothetical flat-stake return per unit, 95% | +2.3% [−5.1%, +9.8%] | +2.7% [−5.0%, +10.4%] | −7.5% [−43.7%, +28.9%] |

What this separates:
- The run line's **63% hit rate is mostly base rate.** The +1.5 side is expected to cover often, and the market's own prices put the expected hit rate of the posted-side picks at 56.4%.
- The **excess over the market-expected rate is not established.** Its interval includes 0, and the hypothetical return's interval includes 0 too.
- **316 of 805 historical picks were on lines no book offered.** These are the simulated-±1.5 picks that #1038 (decision engine v2) replaces with the posted line. They cannot be priced at all.
- Since the model's probabilities are worse than the market's on this event, the pick-level excess is not evidence of skill. **No eligibility follows from it, and the family stays paused.**

## Files
- `evaluate-run-line-vs-market.mjs`: the protocol, implemented read-only.
- `summary.json`, `rows.jsonl`: outputs. Each row lists book, capture time, signed line, both prices, overround, market and model probability, settlement and pick.
