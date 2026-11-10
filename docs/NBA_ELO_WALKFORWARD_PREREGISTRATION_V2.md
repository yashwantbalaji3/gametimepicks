# NBA Elo walk-forward challengers: pre-registration v2 (FROZEN DRAFT, awaiting founder approval of this hash)

**Status: FROZEN, NOT APPROVED.** No score of either challenger against a real outcome is computed until the founder approves this exact file in writing.

How approval is recorded:
- The file's sha256 goes in `APPROVED_PREREG_SHA256`, and the approval instant in `PREREG_APPROVED_AT` (`app/src/lib/sports/nba/elo-ha-walkforward.mjs`).
- The scorer refuses any other file, and refuses an approved file that has no timestamp.
- `elo-ha-walkforward.test.mjs` pins this file's bytes to `PREREG_DRAFT_SHA256`. Any edit after freezing changes the sha256 and makes a new registration.

v2 supersedes the v1 draft (`docs/NBA_ELO_HA_WALKFORWARD_PREREGISTRATION_V1.md`, sha256 `5b9c4e48…a76f`, never approved, removed). The differences:
- v2 adds the in-season challenger;
- it makes the in-season challenger the ONE primary comparison;
- it demotes the home-advantage-only challenger to a reported secondary;
- it adds calibration secondaries and the founder items (§6).

## 1. Decisions and task text, verbatim

The founder's decision 2 (2026-11-10). Source: `~/gtp-evidence/nov10-founder-parlay-v3-decisions.md`, quoted without edits:

> DECISION 2, APPROVED: NBA Elo stays available but untiered.
> - Shown in Today, the NBA hub, game pages and the Parlay Lab research section as MODEL PROJECTION, with a concise calibration caveat.
> - Never used for an official risk tier or presented as a validated edge.
> - Priorities: home-court correction, verified injuries/minutes, comparison with other NBA engines (Theater), forward evaluation (calibration, log loss, Brier, accuracy vs baselines), calibrated challengers without touching frozen history. One official NBA forecast per game/market. Promote through the normal approval, then enable the NBA tiers.

The Program Director's task text (2026-11-10), as relayed:
- Slice 1 asked for a challenger whose home advantage is "re-fit by MLE on games strictly before each game date (walk-forward), everything else identical", with "no tuning and no knobs chosen after seeing results", and said: "confirmatory = games after founder approval"; "the already-seen 2026-27 games are exploratory forever"; "Copy the n minimum from the existing §7 winner bar (n ≥ 300) verbatim; invent no new constant."
- The revision asked for an in-season challenger: "start from the official preseason ratings; after each FINAL game, update both teams with the model card's own update rule (K 20, the same MOV/no-MOV form as the card; cite the line), strictly walk-forward (a forecast uses only finals before its instant); home advantage re-fit as in the HA challenger". It added: "No new constants: anything not in the model card is a founder item, listed and left unfilled." It also said: "ONE primary comparison, to avoid multiplicity: inseason+HA challenger vs official … The HA-only challenger is a reported secondary, never a verdict. Add calibration (ECE, home bias) as reported secondaries."

## 2. What is compared

**Official.** The published Elo game-winner estimate, `nba-winner-side@1`: for each game, the frozen official `forecast.elo.pHome` in the v0.1 forecast file of record (`data/internal/research/nba/experimental-v0.1/forecasts/<date>.json`), the value the public lane publishes.
- Ratings come from `team-rating.mjs`: K 20, home advantage 70 (0 at a neutral site), scale 400, 25% regression toward 1500 at each season boundary, folded over the corpus seasons only (family data rule `corpus-v1`).
- So every team's official rating has been constant since the 2025-26 boundary regression; the official Elo does not update during 2026-27.

**Shared training rule.** Both challengers use the same rule for the home advantage h:
- **Training set:** every game strictly before both the official forecast's `inputAsOf` and the game's ET calendar date (America/New_York, the official record's `etDateOf`), not at a neutral site.
- **Each training game:** (the challenger's own pre-game rating difference home − away, home won).
- **Corpus seasons (2023-24 → 2025-26):** the regular-population games (phase ≠ 1) of the official fold (`historySamples`), with the fold's pre-game ratings.
- **Fit:** the likelihood is the official logistic, p = 1 / (1 + 10^(−(d + h) / 400)). h is the root of the monotone score Σ (y − p), found by 100 bisection steps on [−400, 400] (the official scale); a boundary hit is reported.
- **Neutral site:** h = 0, as in the official model.

**Primary challenger `nba-elo-inseason-walkforward@1`** (`inseasonForecast`): the model as documented, actually updated.
1. **Start:** the official preseason ratings, i.e. the frozen official ratings every 2026-27 regular-season forecast carries, keyed by ESPN team id. They are constant per team; the challenger refuses if they are not (`officialPreseasonRatings`).
2. **Update:** walk-forward in tip order over the official finals record (`app/public/data/nba/results/finals-2026-27.json`).
   - **Which finals:** every game in state FINAL (not under review, not preseason, not an exhibition) strictly before the forecast's `inputAsOf` and the game's ET date.
   - **Rule:** both teams move by the model card's own rule. The card (`data/internal/research/nba/model-card-v1.json`, line 11) reads "K=20, HA=+70 (neutral suppressed), 1/3 season regression, preseason never fit". It is a win/loss Elo with no margin of victory, as implemented by `team-rating.mjs` `fold()` (line 68): r_home ← r_home + 20·(s − E) and r_away ← r_away + 20·((1 − s) − (1 − E)), with E = winProbability(home, away, neutral) at home advantage 70.
3. **Home advantage:** re-fit by the shared rule. Current-season games enter with this challenger's own pre-game rating differences, the ones produced by step 2 before each game.
4. **Probability:** pHome = 1 / (1 + 10^(−(R_home − R_away + h) / 400)).

**Secondary challenger `nba-elo-ha-walkforward@1`** (`challengerForecast`): the official frozen ratings, with only the home advantage re-fit by the shared rule.
- Current-season games enter with their frozen official ratings and their official FINALs (`seasonSamples`).
- The challenger refuses a game whose frozen `pHome` the official formula does not reproduce to 4 decimals.

Neither challenger has a window, shrinkage, prior, recency weight, margin-of-victory term or any other parameter.

## 3. Windows

- **Confirmatory:** games whose tip is strictly after `PREREG_APPROVED_AT` of this file's sha256, and that meet all of:
  - regular season (label "NBA REGULAR SEASON — SHADOW");
  - official forecast frozen before tip (§8 of docs/V18_NBA_REGULAR_SEASON_PREREGISTRATION.md);
  - an official final in the record that is not under review;
  - an in-season challenger value that is computable (no refusal).
- **Exploratory forever:** every 2026-27 game tipping at or before the approval instant, including all games already seen in any report. They are counted, never scored, and never enter a confirmatory number.

## 4. The ONE primary analysis and decision

| Item | Rule |
|---|---|
| Comparison | `nba-elo-inseason-walkforward@1` vs the official published Elo — the only comparison with a verdict |
| Unit | one game: (official pHome, in-season challenger pHome, home won) |
| Primary score | paired log loss difference per game, challenger − official (lower is better) |
| Interval | 95% game-clustered percentile bootstrap of the mean difference, B 2000, seed 20261020, alpha 0.05 (the champion/challenger evaluator's defaults, `bootstrap.mjs`) |
| n | ≥ 300 confirmatory games, verbatim from §7's winner bar (`PREREG.winner.minN`) |
| CHALLENGER_BETTER | n ≥ 300 and the interval's upper bound < 0 |
| CHALLENGER_WORSE | n ≥ 300 and the interval's lower bound > 0 |
| INCONCLUSIVE | n ≥ 300 and the interval includes 0 |
| INSUFFICIENT_N | n < 300 |

A CHALLENGER_BETTER verdict is an input to a founder decision, never a promotion. Promotion follows the normal approval. Until then, the official Elo stays the only published value, and neither challenger feeds a public surface, pick, tier or card.

## 5. Reported secondaries (never a verdict)

All on the confirmatory games only:
- the home-advantage-only challenger: paired log loss against the official, with its interval;
- calibration of the official, the in-season challenger and the home-advantage-only challenger: ECE (10 bins) and home bias (mean pHome − home win), each with a game-clustered interval.

The published Elo's own validation block (`grader-metrics.mjs` → `winner.elo.published` and `states.winnerElo`) is reported on every forward row. It is the official model's validation, not a comparison with a challenger.

## 6. Founder items (not in the model card; listed, left unfilled)

1. **Season regression.** The model card says "1/3 season regression"; the implementation uses 25% (`team-rating.mjs` line 22, `SEASON_REGRESSION: 0.25`). Neither challenger crosses a season boundary in 2026-27, so neither applies one. Which value governs at the 2027-28 boundary is the founder's to decide.
2. **Home advantage inside the update.** The card's update uses HA +70 in E, and the in-season challenger keeps it. Whether a re-fit h should also enter E is not in the card, and is not done.
3. **Team without an official preseason rating** (none today): the challenger refuses. No cold-start value is chosen.
4. **Margin of victory, injuries, rest, rosters:** not in the card (card line 10: "no injuries, no rosters, no rest modeling in v1"), not added.

## 7. What changes nothing

- No frozen forecast, published lane or ledger history is rewritten.
- Both challengers are computed from committed inputs only.
- Their scores exist only after approval, and only for confirmatory games.
