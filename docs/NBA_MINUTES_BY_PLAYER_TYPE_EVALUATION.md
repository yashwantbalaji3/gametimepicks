# NBA minutes — controlled evaluation by player type (founder P0C, 2026-11-12)

Status: **EXPLORATORY; promotes nothing.** No official forecast changes. Engine (forecast-guard).
- Script: `app/scripts/nba/research/evaluate-nba-minutes-by-player-type.mjs`
- Reports: `data/internal/research/nba/reports/minutes-by-player-type-{dev,forward}.json`

## Models
Every model predicts expected minutes for a player who plays, from the same pool with the same cutoff.

| Model | Rule |
|---|---|
| **v0.1-frozen** | The official as it runs in 2026-27: prior-season box scores only, with playoffs, and one bounded factor to 240 |
| v0.1-rule-live | The same rule with every box score before the game (development replay only) |
| **challenger** | `nba-minutes-current-season@1`: current season only, ceiling water-fill, fallback to frozen v0.1 |
| **v0.3** | Prior-season role blended toward the current season, play-rate water-fill (the v0.3 shadow) |

**Player-type tags** are defined pregame and may overlap; definitions are in the script header:
- star: ≥ 30 minutes in the prior season;
- starter;
- bench;
- rookie;
- traded;
- returning: missed ≥ 3 team games;
- promoted: started 2 of the last 3 after < 20% starts before.

**Scoring:** players who played; MAE and bias (projected − actual). Paired differences are game-clustered with a
bootstrap of B 2000, seed 20261020.

## Results
Lower MAE is better. Δ is the paired MAE difference vs v0.1-frozen; every Δ below has a 95% CI that excludes 0 unless
marked ≈.

**Development replay, 2024-25** (26,084 rows, 1,230 games; tip-time availability proxy; roster = the box score's
listed players):

| Type (rows) | v0.1-frozen | challenger | v0.3 | v0.3 − challenger |
|---|---|---|---|---|
| all (26,084) | 9.55 (bias +5.0, coverage 0.64) | 5.16, Δ −4.41 | 5.27, Δ −4.45 | +0.10 [+0.04, +0.16] |
| star (6,031) | 9.95 (+8.1) | 5.11 | **4.71** | **−0.39 [−0.53, −0.25]** |
| starter (5,383) | 9.47 | **5.14** | 5.36 | +0.22 |
| bench (14,670) | 9.34 | **5.20** | 5.46 | +0.27 |
| rookie (3,593) | not projected (coverage 0) | 5.25 | 5.61 | +0.43 |
| traded (1,924) | coverage 0.01 | 5.60 | 6.17 | +0.66 [+0.46, +0.87] |
| returning (1,138) | 10.27 | **5.04** | 5.41 | +0.37 |
| promoted (947) | 8.87 | **5.60** | 6.33 | +0.72 |

**Already-graded 2026-27 forward rows** (3,517 rows, 160 games; the real frozen forecasts; seen before this
evaluation):

| Type (rows) | v0.1-frozen | challenger | v0.3 | v0.3 − challenger |
|---|---|---|---|---|
| all (3,517) | 7.18 (−1.8) | 6.11, Δ −1.04 | **5.54, Δ −1.76** | **−0.59 [−0.74, −0.44]** |
| star (733) | 6.00 | 6.12, Δ ≈ +0.15 | **4.74** | **−1.46 [−1.76, −1.15]** |
| starter (866) | 7.53 | 6.29 | **5.90** | −0.41 |
| bench (1,918) | 7.50 | 6.02 | **5.69** | −0.32 |
| rookie (302) | not projected | 5.95 (coverage 0.70) | **5.78** (coverage 1.0) | ≈ −0.12 |
| traded (778) | 8.59 | 6.89 | **5.95** | −0.81 [−1.14, −0.51] |
| returning (42) | 8.70 | 8.16, Δ ≈ | **6.07** | −1.99 |
| promoted (201) | 7.72 | 7.05, Δ ≈ | **6.27** | −0.76 |

## Reading
1. **Frozen v0.1 is the problem, by about 4.4 minutes per player on the development replay.** Its prior-season window
   is wrong in kind, the same root cause as the frozen Elo. Any model that reads the current season fixes most of it.
   Stars are where frozen v0.1 errs most: +8.1 minutes of bias in the replay, the "46–48 minute" symptom.
2. **v0.3 vs the challenger depends on how much of the season exists.**
   - Early in a season (the 2026-27 forward rows, about the first 3 weeks), v0.3's prior-season role prior wins in
     every type. The largest gains are for stars (−1.46) and traded players (−0.81).
   - Over a full development season, the current-season-only challenger is slightly better for starters, bench,
     rookies, traded, returning and promoted players. v0.3 stays better for stars.
   - That is consistent with v0.3's fixed prior weight (PRIOR_GAMES = 10) staying too heavy late in a season.
3. **Coverage:** frozen v0.1 never projects rookies, as on 2026-10-21. v0.3 covers every pool player in both samples.
   The challenger covers 70% of rookies forward, because it falls back to v0.1 when there are fewer than 3
   current-season games.

## Limitations
- The development replay's v0.1-frozen uses team-only history, so its traded and rookie coverage understates
  production v0.1, which carries history across teams. Its traded and rookie rows are therefore not comparable; the
  forward rows are.
- The 2025-26 season is not loaded: the availability prereg's single-use holdout season is kept untouched.
- Forward rows are exploratory forever (seen). Tags are proxies (no historical roster or transaction captures).

## Recommended promotion path (no promotion here; the existing rules)
1. **v0.3 is the stronger candidate for 2026-27 now.** It is best overall and in every type on the forward rows, and it
   is never worse than the challenger for stars.
2. Under the minutes-shadow rules: preregister **v0.3 vs v0.1-frozen** as the single primary comparison on confirmatory
   games after approval.
   - Paired minutes MAE, game bootstrap, n ≥ 300 games: the existing §7 bar, copied, not new.
   - The challenger is a reported secondary.
   - A verdict is an input to a founder decision; promotion follows the normal approval and the release gate.
3. **Founder item:** v0.3's prior weight (PRIOR_GAMES = 10) appears too heavy late in a season on the development
   replay. Changing it would be a new constant, so it needs a source and approval. It is flagged here, not changed.
4. Because the official player head drives every product (cross-product rule), a minutes promotion switches the site,
   social and grading together on one date, with no history rewrite.
