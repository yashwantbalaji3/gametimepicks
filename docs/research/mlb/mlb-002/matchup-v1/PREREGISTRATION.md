# MLB-002 · Challenger `mlb-pa-matchup-v1`: preregistration

**Registered:** 2026-10-10, before any challenger result was computed. This file is committed first, and its commit hash is the registration.

**Owner:** Lane A (Core Intelligence).

**Status:** research. It changes no published forecast, no model, no eligibility, and does not touch the paused families. Passing here is **not** promotion: it only qualifies the challenger for a forward shadow, and adoption needs founder approval.

## Why

The MLB-001 baseline audit (`docs/research/mlb/mlb-001/`) confirmed three defects in the published PA engine (pa-v2):

1. **The opposing pitcher changes only the strikeout rate.** Hit, walk and home-run rates ignore the pitcher. Moving the opponent's projected strikeouts from 3 to 9 changes runs by only −0.04.
2. **Walks plus HBP are a league constant (0.085)** for every batter against every pitcher.
3. **Each batter's per-PA hit rate divides his per-game projection by a constant 3.85 PA.** But the engine itself gives the leadoff slot about 4.69 PA and the 9th about 3.81, so the slot advantage is counted twice (simulated hits run 1.224× the board in slot 1 and 0.993× in slot 9).

The winner model scores worse than a coin flip on log loss (0.6993 vs 0.6931; interval includes 0), and the market (0.6684) is better than the model.

## The mechanism (fixed here)

The approach is DIPS-style: pitchers control strikeouts, walks and home runs, and have little control over hits on balls in play. Per plate appearance against the **starter**:

| Outcome | Challenger |
|---|---|
| Strikeout | log5(batter K% vs the starter's hand, starter K rate, league K) |
| Walk | log5(batter BB% vs hand, starter BB rate, league BB) + league HBP (0.011) |
| Home run | log5(batter HR/PA vs hand, starter HR rate, league HR) |
| Singles / doubles / triples | The batter's board projection (`batter_hits`, `batter_total_bases`) converted per PA with the **slot's** expected PA instead of 3.85. Then the projection's home-run share is replaced by the matchup home-run rate, keeping the 1B/2B/3B split |
| Reach on error | Unchanged (league, 0) |
| Field out | The remainder; floor 0.02, as the engine does |

**Against the bullpen:** the same, with the pitcher at league rates, so the batter's own rates (shrunk) apply. **Bullpen quality is not modelled**: no pregame bullpen-quality data exists, which is a stated limitation.

**Rates and shrinkage.** Prior weights follow standard stabilisation points and are fixed here, not tuned:

- **Batter vs hand:** 2026 counts + 0.5 × 2025 counts, shrunk to league with **K 60, BB 120, HR 170 PA**.
- **Starter:** season to date, with BF ≈ 4.25 × IP (no hits-allowed data is captured), shrunk with **K 70, BB 170, HR 500 BF**.
- **Starter K rate:** the board's `pitcher_strikeouts` projection ÷ 25 BF when present (the engine's existing source), else season to date.
- **League constants** (K%, BB%, HR/PA): pooled from the 2026 batter-splits captures dated **in the dev window only**, frozen before the holdout is read.
- **Slot PA:** the league PA-by-slot reference already in the repository: `PA_BY_SLOT` in `app/scripts/capture-mlb-pregame-pa-opportunity.mjs` (1: 4.65, 2: 4.55, 3: 4.45, 4: 4.35, 5: 4.25, 6: 4.10, 7: 4.00, 8: 3.90, 9: 3.75). See amendment 1.

**Missing data (never invented):**
- A batter with no split, or no captured hand, uses league rates for the matchup terms and keeps his board projection.
- A starter with no season line uses league rates.
- Each game records how many of its 18 batters and 2 starters had matchup data.

**Data (all point in time):** `data/internal/mlb/pregame-archive/pregame-features/`:
- `batter-splits`, `pitcher-workload`, `matchup` (hands) and `lineup`;
- only captures with `capturedAt` ≤ the forecast's `generatedAt` **and** < first pitch.

The base inputs (board, team markets, confirmed lineups) are rebuilt from the commit that first published each forecast of record, exactly as in `docs/research/mlb/mlb-001/rule-corrections/compare-engine-rules.mjs`.

**The control arm is the published engine on the same rebuilt inputs** (not the published number), so the comparison isolates the mechanism. Both arms use the same seed and the same 10,000 games per forecast.

## Evaluation (fixed here)

**Population:** every graded MLB game with feature coverage, in two windows.

| Split | Window | Use |
|---|---|---|
| Dev | 2026-07-24 → 2026-08-31 | Only to confirm the code runs and to freeze the league constants. **No mechanism or prior is changed after reading dev results**, except bug fixes, which are recorded with the reason |
| **Holdout** | **2026-09-01 → 2026-10-08** | **Read once.** No re-runs with changed settings |

**Primary metric:** winner log loss of P(home), challenger minus control, on the holdout. Paired game-level bootstrap with 10,000 resamples and seed 20261010.

**Secondary metrics:**
- Brier and calibration slope and intercept for the winner;
- the total runs distribution: CRPS, log score of the actual total, level (actual − mean), 80% interval coverage;
- run line ±1.5 home-cover log loss;
- the same winner comparison against the de-vigged market where a quote exists.

**Subgroups:** regular season and postseason are reported separately. The postseason is too small to judge.

**Qualifies for a forward shadow only if all of these hold:**
1. The holdout winner log loss improves on the control, with the 95% interval of the difference **below 0**.
2. Total CRPS is no worse than control + 0.02.
3. The total's absolute level is no worse than the control's + 0.25 runs.
4. Every holdout game ran with no refusal caused by the challenger.

**Otherwise it is recorded as not qualified, with the numbers.** Either way:
- Results are reported in full, including where the challenger is worse.
- A beat on the control is not a beat on the market, and is never described as one.
- No claim of betting value is made.

## What would make this invalid (stated in advance)

- Any feature captured after the forecast time or after first pitch.
- Holdout results read before this file was committed, or settings changed after reading them.
- Arms run on different inputs or seeds.

## Amendment 1 (2026-10-10, before any challenger result was computed)

The registered text named "the PA-by-slot table measured on the published engine (4.69 … 3.81), as recorded in the MLB-001 audit receipts". The audit recorded only the two endpoints, not the table.

Re-measuring now would give a fixture-dependent table: an average-offense fixture gives 4.89 … 4.00. More importantly, it would be the wrong quantity. A batter's per-game projection reflects his **real-world** plate appearances for his slot, so it should be divided by the **league's** expected PA for that slot, not by the engine's simulated PA.

The challenger therefore uses the repository's documented league reference `PA_BY_SLOT`. It was fixed before this registration, and its commit history shows it predates this file.

Nothing else changes. This amendment is committed before the harness first runs.

## Amendment 2 (2026-10-10, before the harness first runs): unspecified details, fixed now

1. **Batting slot.**
   - **Confirmed batting order:** the order is the slot.
   - **Prop-derived lineup:** the board's order is prop-listing order, not batting order. The slot comes from the pregame `matchup` capture's `battingOrderSlot` for that player when present. Otherwise the batter keeps the published flat 3.85 PA, so no slot effect is invented.
2. **Which capture.**
   - For each family and key, the **latest** capture with `capturedAt` ≤ the forecast's `generatedAt` and < first pitch.
   - `batter-splits` and `pitcher-workload` are keyed by player and game; `matchup` by game.
3. **Opposing hand.** The starter's `pitchHand` from the `matchup` capture. With no hand, the batter's splits are pooled over both hands.
4. **Bullpen rates for a batter:** his splits pooled over both hands, because the reliever's hand is unknown.
5. **Dev is run first, with the holdout excluded by the harness.** The holdout is run once, after any dev bug fixes are committed.
